// ERA — Enterprise Resource Agent(s)
// Cost-optimized Azure infrastructure for $150/mo budget
// Deploy: az deployment group create --resource-group era-rg --template-file infrastructure/main.bicep

@description('Environment name')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('Azure region')
param location string = resourceGroup().location

@description('Application name prefix')
param appName string = 'era'

@description('Azure OpenAI endpoint URL')
param azureOpenAiEndpoint string

@description('Azure OpenAI API key')
@secure()
param azureOpenAiApiKey string

@description('Azure OpenAI deployment name')
param azureOpenAiDeployment string = 'gpt-4o'

@description('ACR login server')
param acrLoginServer string = 'caae790480deacr.azurecr.io'

@description('Container image tag')
param imageTag string = 'v4'

@description('Allowed CORS origins (comma-separated)')
param allowedOrigins string = ''

@description('Enable dev-bypass auth (set to false for go-live)')
param allowDevBypass string = 'true'

var prefix = '${appName}-${environment}'
var tags = {
  project: 'era'
  environment: environment
}

// ─── Cosmos DB (Serverless — pay-per-request, ~$0 at low volume) ───

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: '${prefix}-cosmos'
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
      }
    ]
    capabilities: [
      { name: 'EnableServerless' }
    ]
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: '${appName}-db'
  properties: {
    resource: { id: '${appName}-db' }
  }
}

// Containers — partitioned per Cosmos DB best practices
// Composite indexes defined for hot query patterns (ORDER BY with multiple fields)
var containerDefs = [
  { name: 'companies', partitionKey: '/id', compositeIndexes: [] }
  { name: 'users', partitionKey: '/id', compositeIndexes: [] }
  { name: 'ledger', partitionKey: '/companyId', compositeIndexes: [
    // Journal entries: ORDER BY date DESC, entryNumber DESC
    [{ path: '/date', order: 'descending' }, { path: '/entryNumber', order: 'descending' }]
    // Account code lookups
    [{ path: '/docType', order: 'ascending' }, { path: '/code', order: 'ascending' }]
  ] }
  { name: 'documents', partitionKey: '/companyId', compositeIndexes: [
    // Invoices: ORDER BY date DESC
    [{ path: '/docType', order: 'ascending' }, { path: '/date', order: 'descending' }]
  ] }
  { name: 'contacts', partitionKey: '/companyId', compositeIndexes: [
    [{ path: '/name', order: 'ascending' }]
  ] }
  { name: 'inventory', partitionKey: '/companyId', compositeIndexes: [
    [{ path: '/docType', order: 'ascending' }, { path: '/name', order: 'ascending' }]
  ] }
  { name: 'agent-state', partitionKey: '/companyId', compositeIndexes: [] }
  { name: 'chat', partitionKey: '/companyId', compositeIndexes: [] }
  { name: 'feedback', partitionKey: '/id', compositeIndexes: [] }
  { name: 'events', partitionKey: '/companyId', compositeIndexes: [
    [{ path: '/timestamp', order: 'descending' }]
  ] }
  { name: 'rules', partitionKey: '/country', compositeIndexes: [] }
]

resource cosmosContainers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = [
  for c in containerDefs: {
    parent: cosmosDb
    name: c.name
    properties: {
      resource: {
        id: c.name
        partitionKey: {
          paths: [c.partitionKey]
          kind: 'Hash'
          version: 2
        }
        indexingPolicy: {
          automatic: true
          indexingMode: 'consistent'
          includedPaths: [
            { path: '/*' }
          ]
          excludedPaths: [
            { path: '/"_etag"/?' }
          ]
          compositeIndexes: empty(c.compositeIndexes) ? [] : c.compositeIndexes
        }
        defaultTtl: -1
      }
    }
  }
]

// ─── Container Apps (Consumption — pay-per-use, no VM quota needed) ─

resource containerAppEnv 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: '${prefix}-env'
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-api'
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      secrets: [
        { name: 'azure-openai-key', value: azureOpenAiApiKey }
      ]
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
      }
    }
    template: {
      containers: [
        {
          name: 'era-api'
          image: '${acrLoginServer}/${prefix}-api:${imageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'COSMOS_ENDPOINT', value: cosmosAccount.properties.documentEndpoint }
            { name: 'COSMOS_DATABASE', value: cosmosDb.name }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3000' }
            { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAiEndpoint }
            { name: 'AZURE_OPENAI_API_KEY', secretRef: 'azure-openai-key' }
            { name: 'AZURE_OPENAI_DEPLOYMENT', value: azureOpenAiDeployment }
            { name: 'ALLOWED_ORIGINS', value: allowedOrigins }
            { name: 'ALLOW_DEV_BYPASS', value: allowDevBypass }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
        rules: [
          {
            name: 'http-rule'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

// RBAC: Container App → Cosmos DB (no connection string needed)
resource cosmosRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmosAccount
  name: guid(cosmosAccount.id, containerApp.id, 'cosmos-data-contributor')
  properties: {
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: containerApp.identity.principalId
    scope: cosmosAccount.id
  }
}

// ─── Storage Account (for document blobs — free tier usage) ─

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: replace('${prefix}store', '-', '')
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

// ─── Application Insights (free up to 5GB/mo) ──────────────

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${prefix}-insights'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ─── Key Vault (free tier) ──────────────────────────────────

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${prefix}-kv'
  location: location
  tags: tags
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

// ─── Outputs ────────────────────────────────────────────────

output apiUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output cosmosDatabase string = cosmosDb.name
output storageAccountName string = storageAccount.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output keyVaultUri string = keyVault.properties.vaultUri
