# Integration tests

End-to-end backend tests that exercise the full Express + service-layer + Cosmos
data path against an **in-memory Cosmos fake**. No Docker, no Cosmos emulator,
no Azure account needed. Run them with:

```bash
npm run test:integration          # watch mode
npm run test:integration -- --run # single run (CI)
```

## How it works

1. `tests/integration/_harness/setup.ts` runs before every test file.
   - Sets `NODE_ENV=test` plus stub values for `COSMOS_ENDPOINT`, `COSMOS_KEY`, `GOOGLE_CLIENT_ID`, `OPENAI_API_KEY`.
   - Hoist-mocks `src/backend/services/cosmos.ts` so every `containers.foo()` call returns the in-memory fake instead of a real `CosmosClient`.
   - Resets all containers between tests.
2. `src/backend/index.ts` skips `app.listen()` and signal handlers when `NODE_ENV === 'test'`, so importing the module returns the configured Express `app` without binding a port.
3. Tests use `supertest(app)` and authenticate with the `Bearer dev-bypass` token that the auth middleware accepts in non-production builds.

## In-memory Cosmos fake

`tests/integration/_harness/cosmos-fake.ts` implements the subset of `@azure/cosmos` Container API that era actually uses:

- `items.create(item)`, `items.upsert(item)`
- `items.query(spec).fetchAll()`
- `item(id, partitionKey).read()`, `.replace(doc)`, `.delete()`

It compiles a small dialect of Cosmos SQL into JavaScript predicates at runtime:

| Cosmos SQL | Supported |
|---|---|
| `SELECT * FROM c` | yes |
| `SELECT VALUE COUNT(1) FROM c` | yes |
| `SELECT VALUE c.field FROM c` | yes |
| `SELECT c.a, c.b FROM c` | yes |
| `WHERE c.field = @param` (and `!=`, `<`, `<=`, `>`, `>=`) | yes |
| `AND` / `OR` / `NOT` / parentheses | yes |
| `IS_DEFINED(c.field)` | yes |
| `ARRAY_CONTAINS(c.arr, value [, true])` | yes |
| `ARRAY_CONTAINS(@param, c.field)` | yes |
| `LOWER(c.field)` | yes |
| `c.field IN ('a', 'b')` | yes |
| `ORDER BY c.field [ASC\|DESC]` (single or comma list) | yes |
| `OFFSET n LIMIT m` | yes |

Anything outside this dialect throws with the offending SQL — extend the fake instead of working around it.

## Adding a new test

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { getApp, authHeader } from "./_harness/test-server.js";
import { createTestCompany, createTestContact } from "./_harness/factories.js";

describe("my new flow", () => {
  it("does the thing", async () => {
    const app = await getApp();
    const company = await createTestCompany(app);
    // ... POST/GET via supertest, assert on res.body.data
  });
});
```

State is automatically reset between tests via the `afterEach` hook in `setup.ts`.

## Limits

- **No real Cosmos behavior** — partition-key isolation, RU costs, retries, optimistic concurrency on `_etag`, change feed, etc. are not modeled.
- **No frontend** — these are backend HTTP tests only. UI tests live separately under `tests/e2e/` (Playwright, scaffolded later).
- **Auth is bypassed** — covered by unit tests in `tests/unit/auth-sharing.test.ts`. These tests assume a valid dev user.
