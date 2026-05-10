# ERA — Copilot workspace instructions

## Project

ERA (Enterprise Resource Agents) — cloud ERP.

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: Azure Cosmos DB (NoSQL)
- **Auth**: Microsoft Entra ID
- **Infrastructure**: Bicep → Azure
- **CI/CD**: GitHub Actions

## Build and test

```bash
npm install          # Install all dependencies
npm run dev           # Start frontend + backend in parallel
npm run build         # Production build
npm test              # Run unit tests (vitest)
npm run test:e2e      # Run e2e tests (playwright)
npm run lint          # Lint all source files
```

## Conventions

- TypeScript strict mode everywhere
- Shared types live in `src/shared/types/` — never duplicate across front/backend
- `zod` for runtime validation at API boundaries
- Sentence case for all UI text (per design-system skill)
- Inter font family for UI (per design-system skill)
- See `README.md` for module overview and architecture

## Design Principle: Zero-Config, Agent-Driven

ERA is a future ERP run by AI agents. Users provide facts, the system decides how to process them.

- **Never add a settings field** for something that can be derived from country legislation or posting rules
- **Posting rules** (in `src/shared/rules/{cc}.ts`) encode all accounting logic — GL accounts, VAT treatment, FX gain/loss accounts
- When building a new feature, ask: "Can the system figure this out automatically?" If yes, use rules, not settings
- Every feature should be operable by an AI agent end-to-end — minimize required user interaction
- New country = new posting rules file, not new settings UI

## Git

- GitHub account: `samoletovs`
- Descriptive commit messages
- Push to `origin/main`

## Deployments

- Infrastructure: `az deployment group create --resource-group era-rg --template-file infrastructure/main.bicep`
- Always send a Telegram notification after deployment using the `telegram-notify` skill
