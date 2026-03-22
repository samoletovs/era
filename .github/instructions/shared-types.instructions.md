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
