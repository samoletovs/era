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
