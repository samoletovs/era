---
description: "Use when editing backend API routes, services, or middleware. Covers validation, error handling, and response patterns."
applyTo: "src/backend/**/*.ts"
---

# Backend API conventions

- All API endpoints must validate input with `zod` schemas — use standard types from `src/shared/types/data-types.ts`
- Use async/await, never raw promises
- Return consistent response shapes: `{ data, error, meta }`
- Log errors with structured metadata (requestId, userId, action)
- Never expose internal error details to clients
- Use structured error codes per `docs/development-standards.md` §6: `VAL-*` (validation), `BIZ-*` (business rules), `FIN-*` (financial), `AUTH-*` (auth), `SYS-*` (system)
- Every Cosmos query must include the partition key — never cross-partition fan-out in hot paths
- Only the owning service should query a container — no cross-service Cosmos queries
- All monetary math must use `roundCurrency()` — never raw floating-point arithmetic
- Emit business events for all status transitions and GL postings (see `docs/development-standards.md` §7)
