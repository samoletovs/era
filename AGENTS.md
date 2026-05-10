# ERA — Copilot Coding Agent Instructions

> This file is read by GitHub Copilot coding agent when it auto-implements issues assigned to `copilot`.

## Project

ERA (Enterprise Resource Agents) — cloud ERP built with React 18 + TypeScript + Vite (frontend) and Node.js + Express + TypeScript (backend), deployed on Azure with Cosmos DB.

## Build & verify

```bash
npm install          # Install deps
npm run build        # Build frontend + backend — MUST pass before committing
npm test             # Run unit tests (vitest) — MUST pass
npm run lint         # Lint — MUST pass
```

Always run all three verification steps before creating a PR.

## Project structure

```
src/
├── frontend/          # React SPA
│   ├── App.tsx        # Main app shell, routing, sidebar, feedback button
│   ├── components/    # Shared components (AiInput, GlPostings, UniversalGrid, etc.)
│   ├── pages/         # Page components (Invoices, Accounts, Reports, etc.)
│   ├── styles/        # global.css with CSS custom properties (design tokens)
│   ├── hooks/         # Custom React hooks
│   └── utils/         # api.ts (API client), context.tsx (app state)
├── backend/
│   ├── index.ts       # Express server entry point
│   ├── api/
│   │   ├── router.ts  # All API routes
│   │   └── schemas.ts # Zod validation schemas
│   ├── middleware/     # auth, validation, error handling, pagination
│   └── services/      # Business logic (invoice, payment, ledger, etc.)
└── shared/
    ├── types/         # TypeScript interfaces shared across front/backend
    ├── constants/     # Shared constants
    └── rules/         # Country-specific posting rules (accounting logic)
tests/
├── unit/              # Vitest unit tests
├── integration/       # Integration tests
└── e2e/               # Playwright e2e tests
```

## Key conventions

### TypeScript
- Strict mode — no `any`, no unsafe casts
- Shared types in `src/shared/types/` — never duplicate across frontend/backend

### Backend
- All API inputs validated with zod schemas from `src/backend/api/schemas.ts`
- Response shape: `{ data, error, meta }`
- Error codes: `VAL-*`, `BIZ-*`, `FIN-*`, `AUTH-*`, `SYS-*`
- Every Cosmos query must include the partition key
- All monetary math uses `roundCurrency()` — no raw floating-point
- Emit business events for status changes and GL postings

### Frontend
- Functional components with React hooks
- Sentence case for all UI text
- Inter font family via `--font-sans` CSS custom property
- Use CSS custom properties for all colors, spacing, radii — no hardcoded values
- Mobile-first responsive design (breakpoints: 768px, 480px, 400px)
- Accessibility: `aria-label` on interactive elements, keyboard nav, 4.5:1 contrast

### Testing
- Unit tests with vitest: one behavior per `it` block
- Mock external deps — never call real Azure services
- E2e tests with Playwright

## When implementing an issue

1. Read the issue description and labels carefully
2. Check existing code patterns before writing new code
3. Make minimal, focused changes — don't refactor unrelated code
4. Run `npm run build && npm test && npm run lint` before committing
5. Create a PR targeting `master` with a clear description of what changed

## Off-path deviations

ERA deliberately leaves the [NauroLabs golden path](../.github/PLATFORM.md) on a few axes. This section is the canonical record so future agents don't try to "normalize" era back onto the path without understanding the trade-offs.

| # | Decision area | Golden path default | ERA's choice | Why |
|---|---------------|---------------------|--------------|-----|
| 1 | Hosting | Azure Static Web App (Free) + SWA-managed Functions | **Azure Container Apps + Express server** | Long-lived ERP backend with custom middleware (auth, idempotency, App Insights direct SDK, Cosmos transactional batches, request-id propagation). The Functions cold-start tax and per-execution billing model are wrong for an interactive ERP. |
| 2 | Auth | SWA built-in Microsoft Entra ID | **Custom Google Identity Services popup** | Need fine-grained Google scopes (Drive read for receipts, Calendar read for due-date sync), client-side ID-token control, and origin allowlist outside SWA. Follows the [google-oauth skill](../.github/skills/google-oauth/SKILL.md); origins synced via `.github/scripts/google-oauth-sync.ps1`. |
| 3 | Secrets | SWA App Settings | **Container Apps secrets + Managed Identity to Cosmos and OpenAI** | Same default for Container Apps per [PLATFORM.md §3](../.github/PLATFORM.md#3-secrets). |
| 4 | CI/CD | `workflow-templates/swa-deploy.yml` | **Bespoke `.github/workflows/deploy.yml`** (Docker build → ACR push → Container App update) | Required by the Container Apps stack; quality gate (`build && test && lint`) still applied. |
| 5 | Default branch | `main` | **`master`** (legacy) | Predates the lab-wide `main` convention. Migration is destructive (force-push, PR retargeting, branch-protection rules, Container App webhook URL); to be done explicitly when no in-flight PRs are open. |

For background on the off-path policy, see [PLATFORM.md "Off-the-path projects"](../.github/PLATFORM.md#off-the-path-projects-today). When you find this list out of date — fix it in the same PR as the change.

## Country-specific accounting

Latvia (LV) posting rules in [`src/shared/rules/lv.ts`](src/shared/rules/lv.ts) are based on:

- **Annual Reports and Consolidated Annual Reports Law** — Gada pārskatu likums.
- **Cabinet Regulation No. 775 (2015)** — application rules for the Annual Reports Law (NOT a chart of accounts; account codes are commercial convention).
- **VAT Law** — Pievienotās vērtības nodokļa likums.

Each `PostingRule` carries a `legalBasis: string[]` field with paragraph-level citations for auditability. See [`docs/lv-posting-rules-audit-2026.md`](docs/lv-posting-rules-audit-2026.md) for the audit findings and per-rule mapping. When adding rules for new countries, follow the [posting-rules skill](.github/skills/posting-rules/SKILL.md) and cite specific paragraphs in `legalBasis`, not just the regulation name in `source`.
