---
description: "Scaffold a new ERP module with routes, service, types, frontend page, and tests"
agent: "agent"
argument-hint: "Module name, e.g. 'inventory' or 'payroll'"
---

# New ERP module

Create a new module for the ERA ERP system with the given name.

Generate the following files:
1. `src/backend/api/<name>.routes.ts` — Express router with CRUD endpoints
2. `src/backend/services/<name>.service.ts` — Business logic layer
3. `src/shared/types/<name>.ts` — TypeScript interfaces and zod schemas
4. `src/frontend/pages/<name>/index.tsx` — List page component
5. `tests/unit/<name>.test.ts` — Unit tests for the service layer

Follow all project conventions from copilot-instructions.md.
