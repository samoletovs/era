# ERA - Enterprise Resource Application

Cloud-based ERP system built with modern web technologies and deployed on Microsoft Azure.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: Azure Cosmos DB (NoSQL)
- **Auth**: Microsoft Entra ID (Azure AD)
- **Infrastructure**: Azure (App Service, Functions, Storage, CDN)
- **IaC**: Bicep
- **CI/CD**: GitHub Actions

## Modules

| Module | Description | Status |
|--------|-------------|--------|
| Finance & Accounting | GL, AP, AR, Fixed Assets | Planned |
| Inventory Management | Stock, Warehousing, Transfers | Planned |
| Sales & CRM | Quotes, Orders, Customer Mgmt | Planned |
| Procurement | Purchase Orders, Vendor Mgmt | Planned |
| HR & Payroll | Employees, Payroll, Leave | Planned |
| Reporting & Analytics | Dashboards, Reports, Export | Planned |

## Getting Started

### Prerequisites

- Node.js 20+
- Azure CLI
- GitHub CLI
- VS Code

### Setup

```bash
# Install dependencies
npm install

# Copy env template
cp .env.example .env

# Start development
npm run dev
```

### Project Structure

```
ERA/
├── src/
│   ├── frontend/         # React SPA
│   ├── backend/          # Express API
│   └── shared/           # Shared types & constants
├── infrastructure/       # Bicep IaC templates
├── tests/                # Unit, integration, e2e tests
├── docs/                 # Documentation
├── scripts/              # Build & deployment scripts
└── .skills/              # Anthropic Claude skills
```

## Azure Resources

- **App Service**: Web frontend hosting
- **Azure Functions**: Serverless API endpoints
- **Cosmos DB**: NoSQL document database
- **Azure Storage**: Blob storage for documents
- **Azure CDN**: Static asset delivery
- **Application Insights**: Monitoring & telemetry
- **Key Vault**: Secrets management
- **Entra ID**: Authentication & authorization

## License

Proprietary - All Rights Reserved
