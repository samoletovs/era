# ERA — Copilot workspace instructions

## Project

ERA (Enterprise Resource Application) — cloud ERP.

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

## Git

- GitHub account: `samoletovs`
- Azure account: `146099412+samoletovs@users.noreply.github.com`
- Descriptive commit messages
- Push to `origin/master`

## Deployments

- Infrastructure: `az deployment group create --resource-group era-rg --template-file infrastructure/main.bicep`
- Always send a Telegram notification after deployment using the `telegram-notify` skill
