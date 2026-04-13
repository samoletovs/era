# era — Claude Code Instructions

## Project Overview

ERA is an AI-native cloud ERP application using React + TypeScript frontend and Node backend services.

## Architecture

- `src/` — frontend and backend app code
- `tests/` — Vitest tests for key modules and flows
- `infrastructure/` — Bicep infrastructure assets
- `docs/` — product and engineering documentation

## Key Rules

- Preserve TypeScript strictness and existing ESLint standards.
- Keep UI changes aligned with business-app design conventions.
- Never embed secrets in source; use env variables.

## Validation

- `npm run lint`
- `npm run build`
- `npm run test`
