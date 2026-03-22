---
mode: ask
description: "Create a new ERP module with all standard files (routes, service, types, tests)"
---

# New ERP module

Create a new module for the ERA ERP system.

Module name: ${input:moduleName}

Generate the following files:
1. `src/backend/api/${moduleName}.routes.ts` — Express router with CRUD endpoints
2. `src/backend/services/${moduleName}.service.ts` — Business logic layer
3. `src/shared/types/${moduleName}.ts` — TypeScript interfaces and zod schemas
4. `src/frontend/pages/${moduleName}/index.tsx` — List page component
5. `tests/unit/${moduleName}.test.ts` — Unit tests for the service layer

Follow all project conventions from copilot-instructions.md.
