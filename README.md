# era

era is an experimental cloud ERP in which users provide business facts and
country-specific posting rules determine the accounting treatment.

## Research question

era tests the NauroLabs question **"Do we still need apps?"** It asks how far an
ERP can reduce configuration and manual accounting work when agents and
deterministic rules apply the business logic and a person reviews the result.

## What it does

- Manages companies, contacts, invoices, payments, ledger entries, and reports.
- Lets users choose financial metric cards in Reports > Multi-country overview.
  Choices persist in the current browser; Reset to defaults removes them.
- Applies country-specific accounting and tax posting rules.
- Exposes the same business operations through an API and a React interface.
- Uses AI-assisted inputs where useful while keeping financial calculations and
  postings deterministic.

## Stack

- React 18, TypeScript, and Vite
- Node.js, Express, and Zod
- Azure Cosmos DB and Azure OpenAI
- Azure Container Apps and Bicep

## Run locally

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Before submitting a change:

```powershell
npm run lint
npm test -- --run
npm run test:integration -- --run
npm run build
```

Dashboard browser tests use mocked APIs (no Azure services). With the frontend
running via `npm run dev:frontend`, run
`npm run test:e2e -- tests/e2e/multi-country-metrics.spec.ts`.
Set `ERA_E2E_BASE_URL` for a different local frontend URL and optionally
`PLAYWRIGHT_CHANNEL=msedge` to use an installed Microsoft Edge browser.

## Status

**Active research prototype.** Core accounting workflows, country posting
rules, APIs, and automated tests are implemented. era is not production
accounting software and its rule coverage is still being expanded.

## License

MIT
