---
description: Apply when editing any TypeScript files in the backend API
applyTo: "src/backend/**/*.ts"
---

# Backend API conventions

- All API endpoints must validate input with `zod` schemas
- Use async/await, never raw promises
- Return consistent response shapes: `{ data, error, meta }`
- Log errors with structured metadata (requestId, userId, action)
- Never expose internal error details to clients
