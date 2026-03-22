---
description: "Use when editing backend API routes, services, or middleware. Covers validation, error handling, and response patterns."
applyTo: "src/backend/**/*.ts"
---

# Backend API conventions

- All API endpoints must validate input with `zod` schemas
- Use async/await, never raw promises
- Return consistent response shapes: `{ data, error, meta }`
- Log errors with structured metadata (requestId, userId, action)
- Never expose internal error details to clients
