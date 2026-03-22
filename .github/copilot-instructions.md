# ERA — Copilot workspace instructions

## Project

ERA (Enterprise Resource Application) is a cloud ERP built with:
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: Azure Cosmos DB (NoSQL)
- **Auth**: Microsoft Entra ID
- **Infrastructure**: Bicep → Azure (App Service, Functions, Storage, Key Vault)
- **CI/CD**: GitHub Actions

## Conventions

- TypeScript strict mode everywhere
- Shared types in `src/shared/types/`; never duplicate type definitions across front/backend
- Use `zod` for runtime validation at API boundaries
- Sentence case for all UI text (per design-system skill)
- Use Inter font family for UI (per design-system skill)

## Git

- GitHub account: `samoletovs`
- Azure account: `146099412+samoletovs@users.noreply.github.com`
- Always commit with descriptive messages
- Push to `origin/master`

## After deployments

- Always send a Telegram notification using the `telegram-notify` skill
