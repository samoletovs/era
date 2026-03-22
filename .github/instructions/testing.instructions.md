---
description: "Use when writing or editing unit tests, integration tests, or e2e tests with vitest or playwright."
applyTo: "tests/**/*.ts"
---

# Testing conventions

- Use `vitest` for unit and integration tests
- Use `playwright` for end-to-end tests
- Name test files `<module>.test.ts` (unit) or `<feature>.spec.ts` (e2e)
- Use `describe` / `it` blocks with sentence-case descriptions
- Test one behavior per `it` block
- Mock external dependencies (Cosmos DB, Azure services) — never call real services in unit tests
- Aim for the public API, not implementation details
