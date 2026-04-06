# era - Enterprise Resource Application

Cloud-based ERP system built with modern web technologies and deployed on Microsoft Azure.

## Design Philosophy: Zero-Config, Agent-Driven ERP

ERA is designed as a **next-generation ERP run by AI agents**, not by users manually
configuring settings. The core principle:

> **Users provide facts. The system decides how to process them.**

### How it works

1. **Country onboarding** — When a company is created in a new country, the system
   (or an AI agent/Copilot) researches the country's legislation, accounting standards,
   and chart of accounts, then generates **posting rules** that encode all the accounting
   logic (which GL accounts to debit/credit, VAT treatment, FX gain/loss accounts, etc.).

2. **Posting rules, not settings** — Instead of requiring users to configure GL accounts
   for revaluation, VAT, AR/AP, and other posting targets, the system resolves them
   automatically from country-specific posting rules stored in `src/shared/rules/{cc}.ts`.
   Users never need to know account codes.

3. **Minimal user interaction** — The user's job is to provide inputs (invoices,
   payments, bank statements). The system applies the correct accounting treatment
   automatically based on the company's country, chart of accounts, and legislation.

4. **Agent-first architecture** — Every feature should be designed so an AI agent can
   operate it end-to-end. Settings screens exist only for genuine business choices
   (company name, payment terms, currency), not for accounting configuration that
   can be derived from rules.

### When adding new features

- **Ask**: "Can the system figure this out from the posting rules or country legislation?"
  If yes, don't add a settings field — add a posting rule instead.
- **Ask**: "Would an AI agent need this UI?" If not, the feature should be API-driven
  with rules, not UI-driven with manual configuration.
- New countries: create `src/shared/rules/{cc}.ts` with all posting rules (invoices,
  payments, FX revaluation, period close, etc.) — the skill `posting-rules` guides this.

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
