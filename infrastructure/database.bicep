// ERA — Database & supporting services only
// Use when VM quota is unavailable (e.g. VS Enterprise subscription)
// Deploy: az deployment group create --resource-group era-rg --template-file infrastructure/database.bicep

@description('Environment name')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('Azure region')
param location string = resourceGroup().location

@description('Application name prefix')
param appName string = 'era'

var prefix = '${appName}-${environment}'
var tags = {
  project: 'era'
  environment: environment
}

// ─── Cosmos DB (Serverless) ─────────────────────────────────

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

var containers = [
  { name: 'companies', partitionKey: '/id' }
  { name: 'users', partitionKey: '/id' }
  { name: 'ledger', partitionKey: '/companyId' }
  { name: 'documents', partitionKey: '/companyId' }
  { name: 'contacts', partitionKey: '/companyId' }
  { name: 'inventory', partitionKey: '/companyId' }
  { name: 'agent-state', partitionKey: '/companyId' }
  { name: 'chat', partitionKey: '/companyId' }
  { name: 'feedback', partitionKey: '/id' }
]

resource cosmosContainers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = [
  for c in containers: {
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
        }
        defaultTtl: -1
      }
    }
  }
]

// ─── Key Vault ──────────────────────────────────────────────

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

output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output cosmosDatabase string = cosmosDb.name
output keyVaultUri string = keyVault.properties.vaultUri
