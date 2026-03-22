---
description: "Use when editing shared types, interfaces, constants, or zod schemas used across frontend and backend."
applyTo: "src/shared/**/*.ts"
---

# Shared types conventions

- This is the single source of truth for all types — frontend and backend import from here
- Never duplicate a type definition in `src/frontend/` or `src/backend/`
- Export all public types from `src/shared/types/index.ts`
- Pair every entity type with a zod schema for runtime validation
- Use `z.infer<typeof Schema>` to derive TypeScript types from zod schemas
- Use standard data types from `src/shared/types/data-types.ts` as building blocks for entity schemas
- Follow field naming conventions in `docs/development-standards.md` §2 (suffixes: `*Id`, `*Code`, `*Amount`, `*Date`, `*At`, etc.)
- Every entity in a shared Cosmos container must include a `docType` discriminator field
- Use canonical tax fields: `taxCode`, `taxRate`, `taxAmount` (not `vatCode` / `vatRate` on journal lines)
- Use canonical amount fields: `netAmount`, `taxAmount`, `totalAmount`, `paidAmount` in new entities
