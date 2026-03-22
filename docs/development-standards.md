# ERA Development Standards

> Authoritative reference for all ERA development. Inspired by proven patterns from D365 F&O (Extended Data Types,
> table groups, error codes), SAP S/4HANA (ACDOCA universal journal, data dictionary), and adapted for ERA's
> TypeScript / Cosmos DB / AI-first architecture.
>
> **Adoption strategy**: New code follows these standards immediately. Existing code is migrated incrementally —
> prefer new conventions, accept old ones during transition. When in doubt, follow this document.

---

## 1. Entity & type naming

| Element | Convention | Examples |
|---------|-----------|----------|
| TypeScript interfaces | PascalCase, singular noun | `Invoice`, `JournalEntry`, `Contact` |
| Type aliases / unions | PascalCase | `AccountType`, `InvoiceStatus` |
| Zod schemas | camelCase + `Schema` suffix | `invoiceSchema`, `journalLineSchema` |
| Constants | SCREAMING_SNAKE_CASE | `DEFAULT_CURRENCY`, `VAT_RATES` |
| Functions / variables | camelCase | `createInvoice()`, `roundCurrency()` |
| Boolean variables | `is*` / `has*` / `can*` prefix | `isActive`, `hasVat`, `canPost` |

### Container (table) naming

Cosmos DB containers use **lowercase plural** or **kebab-case** for compound names:

| Container | Partition key | Entity types stored |
|-----------|--------------|---------------------|
| `companies` | `/id` | `Company` |
| `users` | `/id` | `UserProfile` |
| `ledger` | `/companyId` | `Account`, `JournalEntry`, `FiscalPeriod` |
| `documents` | `/companyId` | `Invoice`, `Payment`, `VatReturn` |
| `contacts` | `/companyId` | `Contact` |
| `inventory` | `/companyId` | `Item`, `StockMovement` |
| `events` | `/companyId` | `BusinessEvent` |
| `rules` | `/country` | `PostingRule` |
| `chat` | `/companyId` | `ChatMessage` |
| `agent-state` | `/companyId` | `AgentAction` |
| `feedback` | `/id` | `Feedback` |

### Document type discriminator (`docType`)

Every entity stored in a **shared container** (one that holds multiple entity types) must include a `docType` field.
This replaces fragile `IS_DEFINED()` queries with explicit, indexable discrimination.

| Container | `docType` values |
|-----------|-----------------|
| `ledger` | `"account"`, `"journal-entry"`, `"fiscal-period"` |
| `documents` | `"invoice"`, `"payment"`, `"credit-note"`, `"vat-return"` |
| `inventory` | `"item"`, `"stock-movement"` |

Containers that store only one entity type (`companies`, `users`, `contacts`, `events`, `rules`, `chat`, `agent-state`, `feedback`) do not need `docType`.

**Query pattern** — always filter by `docType`:
```sql
-- Good
SELECT * FROM c WHERE c.companyId = @companyId AND c.docType = "invoice"

-- Avoid
SELECT * FROM c WHERE c.companyId = @companyId AND IS_DEFINED(c.invoiceNumber)
```

---

## 2. Field naming standards

### Standard suffixes

Every field name must use one of these established suffixes to convey its semantic meaning:

| Suffix | Meaning | TypeScript type | Examples |
|--------|---------|----------------|----------|
| `*Id` | Foreign key / UUID reference | `string` (UUID v4) | `companyId`, `contactId`, `invoiceId` |
| `*Code` | Human-readable business key | `string` (uppercase) | `accountCode`, `currencyCode`, `countryCode` |
| `*Name` | Display name | `string` | `contactName`, `accountName`, `itemName` |
| `*Number` | Sequential business number | `string` (formatted) | `invoiceNumber`, `entryNumber` |
| `*Date` | Date only | `string` (`YYYY-MM-DD`) | `invoiceDate`, `dueDate`, `documentDate` |
| `*At` | Full timestamp | `string` (ISO 8601) | `createdAt`, `updatedAt`, `postedAt` |
| `*By` | Actor / user reference | `string` | `createdBy`, `closedBy`, `approvedBy` |
| `*Amount` | Monetary value | `number` (2 decimals) | `netAmount`, `taxAmount`, `totalAmount` |
| `*Rate` | Percentage or ratio | `number` | `taxRate`, `exchangeRate`, `discountRate` |
| `*Status` | Lifecycle state | string union | Use bare `status` when unambiguous within entity |
| `*Type` | Classification enum | string union | `accountType`, `documentType`, `movementType` |
| `*Count` | Integer quantity | `number` | `lineCount`, `periodCount` |
| `is*` | Boolean flag | `boolean` | `isActive`, `isPostable`, `isReversed` |
| `has*` | Boolean presence check | `boolean` | `hasVat`, `hasAttachment` |

### Tax / VAT field naming (canonical names)

Use these consistently across all entities. Legacy names (`vatCode`, `vatRate` on `JournalLine`) are accepted during migration but should not be added to new code.

| Field | Meaning | Example value |
|-------|---------|--------------|
| `taxCode` | Rule identifier | `"LV-21"`, `"EE-22"`, `"LT-21"` |
| `taxRate` | Percentage rate | `21`, `12`, `5`, `0` |
| `taxAmount` | Computed tax amount | `42.00` |

On `Invoice` and `InvoiceLine`, the existing `vatAmount` and `vatRate` fields are acceptable aliases — they match the suffix convention. In `JournalLine`, prefer `taxCode` / `taxAmount` over `vatCode`.

### Amount field naming (canonical names)

| Field | Meaning | Formula |
|-------|---------|---------|
| `netAmount` | Before tax | Sum of line totals |
| `taxAmount` | Tax portion | Sum of line tax |
| `totalAmount` | Net + tax | `netAmount + taxAmount` |
| `paidAmount` | Cumulative paid | Running total of applied payments |
| `balanceDue` | Remaining | `totalAmount - paidAmount` |
| `unitPrice` | Per-unit price | — |
| `lineTotal` | Line subtotal | `quantity × unitPrice` |
| `costPrice` | Unit cost | — |
| `sellingPrice` | Unit selling price | — |

On `Invoice`, the existing fields `subtotal`, `vatAmount`, `total`, `amountPaid` are accepted during migration. New entities should use `netAmount`, `taxAmount`, `totalAmount`, `paidAmount`.

### Denormalized reference fields

When referencing another entity for display purposes, store **both** the ID and the name:

```typescript
contactId: string;        // UUID — for joins and lookups
contactName: string;      // Cached name — for display without extra reads
```

This pattern follows D365 F&O's approach of storing RecId + denormalized lookup fields to avoid cross-entity reads at query time.

---

## 3. Standard data types

Inspired by D365 F&O Extended Data Types (EDT). These are the canonical Zod schemas for ERA fields, defined in `src/shared/types/data-types.ts`. Use these as building blocks when defining entity schemas.

| Type name | TypeScript | Format | Zod schema |
|-----------|-----------|--------|------------|
| `EntityId` | `string` | UUID v4 | `z.string().uuid()` |
| `CompanyCode` | `string` | 1-5 uppercase alphanumeric | `z.string().regex(/^[A-Z0-9]{1,5}$/)` |
| `MoneyAmount` | `number` | 2 decimal places | `z.number()` + always apply `roundCurrency()` |
| `Percentage` | `number` | 0–100 | `z.number().min(0).max(100)` |
| `ExchangeRate` | `number` | Positive, up to 6 decimals | `z.number().positive()` |
| `ISODate` | `string` | `YYYY-MM-DD` | `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` |
| `ISOTimestamp` | `string` | ISO 8601 | `z.string().datetime()` |
| `FiscalPeriod` | `string` | `YYYY-MM` | `z.string().regex(/^\d{4}-\d{2}$/)` |
| `CountryCode` | `string` | ISO 3166-1 alpha-2 | `z.string().regex(/^[A-Z]{2}$/)` |
| `CurrencyCode` | `string` | ISO 4217 | `z.string().regex(/^[A-Z]{3}$/)` |
| `AccountCode` | `string` | 4-digit numeric | `z.string().regex(/^\d{4}$/)` |
| `TaxCode` | `string` | `{CC}-{rate}` | `z.string().regex(/^[A-Z]{2}-\d+$/)` |
| `Email` | `string` | RFC 5322 | `z.string().email()` |
| `PhoneE164` | `string` | E.164 international format | `z.string().regex(/^\+\d{7,15}$/)` |
| `VATNumber` | `string` | EU format (country prefix + digits) | `z.string().regex(/^[A-Z]{2}\d{5,12}$/)` |
| `RegistrationNo` | `string` | Country-specific | `z.string().min(1).max(20)` |

---

## 4. ID & key standards

### Primary IDs

| Pattern | When to use | Example |
|---------|------------|---------|
| UUID v4 | Default for all entities | `"a1b2c3d4-e5f6-..."` |
| Compound: `${companyId}-{prefix}-${key}` | When direct-read by business key is needed | Accounts: `"uuid-acct-2210"` |

### Business numbers (human-readable)

| Document | Format | Example |
|----------|--------|---------|
| Sales invoice | `INV-{NNNNN}` | `INV-00001` |
| Purchase invoice | `PINV-{NNNNN}` | `PINV-00042` |
| Payment | `PAY-{NNNNN}` | `PAY-00001` |
| Journal entry | `{YYYY-MM}-{NNNN}` | `2026-03-0001` |

Business numbers are sequential per company, zero-padded, generated from `Company.settings.next*Number`.

### Partition keys

| Scope | Partition key | Containers |
|-------|--------------|------------|
| Tenant-scoped | `/companyId` | `ledger`, `documents`, `contacts`, `inventory`, `events`, `chat`, `agent-state` |
| Global | `/id` | `companies`, `users`, `feedback` |
| Classification | `/country` | `rules` |

Every Cosmos query **must** include the partition key in the WHERE clause. Never perform cross-partition fan-out queries in hot paths.

---

## 5. Status & lifecycle standards

### Document lifecycles

| Entity | States | Transitions | Terminal |
|--------|--------|------------|----------|
| Invoice | `draft` → `posted` → `partially_paid` → `paid` | Forward only (except cancel) | `paid`, `cancelled` |
| Credit note | `draft` → `posted` | Forward only | `posted`, `cancelled` |
| Payment | `draft` → `posted` | Forward only | `posted`, `cancelled` |
| Journal entry | `draft` → `posted` → `reversed` | Forward only | `reversed` |
| Fiscal period | `open` → `closed` | Bidirectional (reopen allowed) | — |
| Contact / Item | `active` ↔ `inactive` | Toggle | — |
| Agent action | `pending` → `approved` / `rejected` → `executed` / `failed` | Forward only | `executed`, `failed`, `rejected` |

### Rules

1. **String unions only** — never numeric status codes
2. **Define as const arrays** for runtime + type safety:
   ```typescript
   const INVOICE_STATUSES = ["draft", "posted", "partially_paid", "paid", "overdue", "cancelled"] as const;
   type InvoiceStatus = typeof INVOICE_STATUSES[number];
   ```
3. **Validate transitions** — never jump states (e.g., `draft` → `paid` is invalid)
4. **Soft delete only** — set `isActive = false` or `status = "cancelled"`, never `DELETE` from the database
5. **Reversal over deletion** — posted journal entries are reversed with a new contra entry, never modified or deleted

---

## 6. API design standards

### URL patterns

All API routes follow REST conventions under `/api/companies/{companyId}`:

| Operation | Method | Path | Response |
|-----------|--------|------|----------|
| List | `GET` | `/{resource}` | `PaginatedResponse<T>` |
| Get one | `GET` | `/{resource}/:id` | `ApiResponse<T>` |
| Create | `POST` | `/{resource}` | `ApiResponse<T>` |
| Update | `PUT` | `/{resource}/:id` | `ApiResponse<T>` |
| Action | `POST` | `/{resource}/:id/{action}` | `ApiResponse<T>` |
| Delete | — | — | *Not supported — use status transitions* |

Actions for state transitions: `/post`, `/cancel`, `/reverse`, `/approve`, `/reject`.

No `PATCH` — use full resource replacement via `PUT`.

### Response envelope

Every response uses the standard envelope:

```typescript
// Success
{ data: T, meta?: { ... } }

// Error
{ error: { code: "BIZ-003", message: "Cannot post to closed period", details?: { ... } } }

// Paginated
{ data: T[], meta: { total, page, pageSize, hasMore }, continuationToken?: string }
```

### Error codes

Structured error codes for programmatic handling (inspired by D365 F&O error system):

| Range | Category | Examples |
|-------|---------|----------|
| `VAL-001..099` | Validation errors | `VAL-001`: Required field missing, `VAL-002`: Invalid format |
| `BIZ-001..099` | Business rule violations | `BIZ-001`: Cannot post draft, `BIZ-003`: Period is closed |
| `FIN-001..099` | Financial errors | `FIN-001`: Entry not balanced, `FIN-002`: Insufficient balance |
| `AUTH-001..099` | Authentication / authorization | `AUTH-001`: Invalid token, `AUTH-002`: No access to company |
| `SYS-001..099` | System / infrastructure | `SYS-001`: Database unavailable, `SYS-002`: External service timeout |
| `DUP-001..099` | Duplicate detection | `DUP-001`: Duplicate vendor invoice number |

### Pagination

- Default page size: `25` (from `DEFAULT_PAGE_SIZE` constant)
- Maximum page size: `100` (from `MAX_PAGE_SIZE` constant)
- Support Cosmos continuation tokens for deep pagination
- Client provides: `?page=1&pageSize=25` or `?continuationToken=...`

### Input validation

- **Every** endpoint validates input with Zod schemas
- Use standard data types from `src/shared/types/data-types.ts` as building blocks
- Validate at API boundary, trust internal code
- Return `VAL-*` error codes for validation failures with field-level details

---

## 7. Event & audit standards

### Event naming

Pattern: `{entity}.{action}` in lowercase dot notation.

| Event type | When emitted |
|-----------|-------------|
| `invoice.created` | New invoice saved |
| `invoice.posted` | Invoice posted to GL |
| `invoice.cancelled` | Invoice cancelled |
| `payment.posted` | Payment posted to GL |
| `entry.posted` | Manual journal entry posted |
| `entry.reversed` | Journal entry reversed |
| `period.closed` | Fiscal period closed |
| `period.reopened` | Fiscal period reopened |
| `year-end.closed` | Year-end closing completed |
| `contact.created` | New contact created |
| `item.created` | New item created |

### Required event fields

```typescript
interface BusinessEvent {
  id: string;              // UUID v4
  companyId: string;       // Tenant scope
  type: string;            // Event type (dot notation)
  timestamp: string;       // ISO 8601
  actor: string;           // userId or "system"
  documentType?: string;   // Entity type
  documentId?: string;     // Entity ID
  journalEntryId?: string; // GL reference (if applicable)
  data?: Record<string, unknown>; // Event-specific payload
}
```

### Mandatory audit events

The following operations **must** emit a business event — no exceptions:

1. All GL postings and reversals
2. All financial document status transitions (draft → posted, posted → paid, etc.)
3. All period open/close operations
4. Year-end closing
5. Invoice creation and cancellation
6. Payment posting

Events are **append-only** and **immutable** — they are never updated or deleted. The events container serves as a complete audit trail for SOX compliance and GDPR accountability.

---

## 8. Multi-country & localization

### Country expansion pattern

Adding a new country requires:

| Step | Artifact | Location |
|------|----------|----------|
| 1 | Posting rules | `src/shared/rules/{cc}.ts` (e.g., `ee.ts` for Estonia) |
| 2 | Chart of accounts template | `src/backend/services/chart-of-accounts.ts` |
| 3 | Tax code definitions | Format: `{CC}-{rate}` (e.g., `EE-22`) |
| 4 | VAT rates constant | `src/shared/constants/index.ts` |
| 5 | Seed endpoint | `POST /api/rules/seed` with country-specific rules |

### Tax code format

`{CountryCode}-{Rate}` — e.g., `LV-21`, `EE-22`, `LT-21`, `LV-0`.

Special codes for output/input designation: `{CC}-output`, `{CC}-input` (used in VAT return generation).

### Legal references

Every posting rule **must** include a `source` field referencing the legal basis:

```typescript
source: "LV-Cabinet-Regulation-775"  // Latvian accounting rules
source: "EE-Accounting-Act-2002"     // Estonian accounting rules
```

### Multi-currency (preparation)

- Company base currency stored in `Company.currency` (ISO 4217)
- All GL amounts stored in **base currency**
- Original transaction currency stored in `*InCurrency` fields on `JournalLine`:
  - `currencyCode` — ISO 4217 transaction currency
  - `exchangeRate` — rate to base currency (1.0 if same)
  - `amountInCurrency` — original amount
- Exchange rates: 6 decimal precision
- Realized/unrealized FX gains: tracked in dedicated GL accounts (per country CoA)

---

## 9. Frontend standards

### Component architecture

| Category | Naming | Location | Example |
|----------|--------|----------|---------|
| Pages | `PascalCase.tsx` | `src/frontend/pages/` | `Invoices.tsx`, `Dashboard.tsx` |
| Shared components | `PascalCase.tsx` | `src/frontend/components/` | `DataTable.tsx`, `StatusBadge.tsx` |
| Utilities | `camelCase.ts` | `src/frontend/utils/` | `api.ts`, `context.tsx` |
| Styles | `camelCase.css` | Adjacent to component | `global.css` |

### Rules

1. **No `any` types** — all API responses and state must be typed with entities from `src/shared/types/`
2. **Extract shared components** when used in 2+ pages → move to `src/frontend/components/`
3. **Component size limit** — extract when over ~100 lines
4. **Toast/notification system** for errors — never use `alert()` or `confirm()`
5. **Loading skeletons** instead of "Loading..." text for content areas
6. **Sentence case** for all UI text (per design system)
7. **Inter font family** (per design system)

### Accessibility baseline (WCAG 2.1 AA)

1. All interactive elements have `aria-label` or a visible `<label>`
2. Keyboard navigation works for all actions (Tab, Enter, Escape)
3. Color contrast minimum **4.5:1** for normal text, **3:1** for large text
4. Focus indicators visible on all interactive elements
5. Screen reader announcements for dynamic content changes
6. Form error messages associated with inputs via `aria-describedby`

### State management

- **Global state**: React Context for company selection (`useApp()` hook)
- **Page state**: `useState` for local page data (lists, selection, filters)
- **No Redux/Zustand** — keep state minimal and close to where it's used
- **API calls**: centralized in `src/frontend/utils/api.ts`, fetched in `useEffect` per page

---

## 10. Testing standards

### Coverage targets

| Layer | Target | Rationale |
|-------|--------|-----------|
| Business logic (services) | **90%+** line coverage | Core ERP logic must be well-tested |
| Financial calculations | **100%** branch coverage | Zero tolerance for monetary errors |
| API routes | **80%+** line coverage | Cover all happy paths + key error paths |
| Frontend pages | E2E happy paths | Playwright covers critical user flows |

### Test organization

| Type | Framework | Location | Naming |
|------|----------|----------|--------|
| Unit | vitest | `tests/unit/` | `{module}.test.ts` |
| Integration | vitest | `tests/integration/` | `{feature}.test.ts` |
| E2E | Playwright | `tests/e2e/` | `{flow}.spec.ts` |

### Test data patterns

Use **factory functions** (test builders) instead of hardcoded objects:

```typescript
// Good — flexible, maintainable
const invoice = buildInvoice({ type: "sales", total: 121 });
const payment = buildPayment({ amount: 121 });

// Avoid — brittle, duplicated across tests
const invoice = { id: "test-1", companyId: "c-1", type: "sales", ... };
```

**Standard test factories** to create:
- `buildCompany()` — company with Latvian defaults
- `buildInvoice()` — invoice with valid lines and calculated amounts
- `buildPayment()` — payment with invoice allocation
- `buildContact()` — customer or vendor
- `buildItem()` — product or service item
- `buildJournalEntry()` — balanced journal entry

### Test rules

1. **One behavior per `it` block** — test one thing at a time
2. **Mock external dependencies** — never call real Cosmos DB or Azure services in tests
3. **Test public API**, not implementation details
4. **Sentence case** for `describe` and `it` descriptions
5. **Golden master tests** for financial reports — snapshot-based to catch regressions

---

## 11. Code organization

### Backend service pattern

One service file per domain entity in `src/backend/services/`:

```
invoice.ts       → createInvoice(), postInvoice(), cancelInvoice()
payment.ts       → createPayment(), postPayment()
ledger.ts        → postEntry(), reverseEntry(), getBalance()
contact.ts       → createContact(), updateContact()
inventory.ts     → createItem(), adjustStock()
```

**Rules:**

1. **Public functions** — business operations (verbs): `createInvoice()`, `postInvoice()`
2. **Private functions** — internal helpers: unexported or prefixed with `_`
3. **Container ownership** — only the owning service queries a container's data
4. **No cross-service Cosmos queries** — go through the service's public API
5. **All monetary math** uses `roundCurrency()` — never raw floating-point arithmetic

### File naming

| Category | Convention | Examples |
|----------|-----------|----------|
| Backend services | `kebab-case.ts` | `invoice.ts`, `chart-of-accounts.ts` |
| Frontend pages | `PascalCase.tsx` | `Invoices.tsx`, `Dashboard.tsx` |
| Frontend components | `PascalCase.tsx` | `DataTable.tsx`, `StatusBadge.tsx` |
| Shared types | `kebab-case.ts` | `entities.ts`, `data-types.ts` |
| Unit tests | `kebab-case.test.ts` | `finance.test.ts` |
| E2E tests | `kebab-case.spec.ts` | `invoice-flow.spec.ts` |
| Instruction files | `kebab-case.instructions.md` | `backend-api.instructions.md` |
| Docs | `kebab-case.md` | `architecture-transactions.md` |

---

## 12. Security standards

### Multi-tenant data isolation

1. **Every Cosmos query must include the partition key** (`companyId`) in the WHERE clause
2. **Auth middleware validates** that the authenticated user has access to the requested `companyId`
3. **Never expose data** from other tenants — no cross-company joins or aggregations
4. **Never log** sensitive data (tokens, passwords, PII) in plaintext

### Input protection

1. **Zod schemas** validate every API request body at the boundary
2. **Parameterized queries only** — never interpolate user input into Cosmos SQL strings
3. **HTML-escape** user-provided strings before rendering in the frontend
4. **No `eval()`** or dynamic code execution from user input
5. **Rate limiting** on authentication endpoints
6. **File upload validation** — check MIME type, size limits, scan for malicious content

### Authentication

1. **Microsoft Entra ID** as primary auth provider
2. **JWT verification** with JWKS endpoint rotation
3. **Dev bypass** (`Bearer dev-bypass`) only in development mode — never in production
4. **Token expiry** enforced — reject expired tokens with `AUTH-001`

---

## 13. Documentation standards

### Code documentation

1. **JSDoc on public service functions** — include `@param`, `@returns`, `@throws`
2. **No JSDoc on private helpers** — keep them simple and self-documenting
3. **No obvious comments** — don't document what the code clearly shows
4. **Document WHY, not WHAT** — especially for financial rules and legal compliance
5. **Reference legal sources** in comments for country-specific logic:
   ```typescript
   // Per LV Cabinet Regulation No. 775, Section 48:
   // Sales invoices must debit AR (2210) and credit Revenue + VAT payable
   ```

### Architecture decisions

Major architectural decisions are documented in `docs/` as decision records:

| Document | Decision |
|----------|----------|
| [architecture-transactions.md](architecture-transactions.md) | Unified GL with enriched journal lines (no subledgers) |
| [development-standards.md](development-standards.md) | This document — naming, data types, API design |

Format for new decisions: **Context → Decision → Consequences**.

---

## 14. Cosmos DB standards

### Indexing

1. **Include `docType`** in composite indexes for shared containers
2. **Exclude large text fields** from indexing (e.g., `description`, `notes`) unless searched
3. **Use range indexes** for date and amount fields used in range queries
4. **Review RU consumption** for new queries before deploying to production

### Concurrency

1. **Optimistic concurrency** via `_etag` on all mutable entities (especially `Account.balance`)
2. **Read-before-write** pattern for balance updates — read current etag, update with etag condition
3. **Retry on 412 Precondition Failed** — re-read and re-apply the update (max 3 retries)

### Container design

1. **Prefer multi-type containers** over one-container-per-type — reduces cost and simplifies cross-type queries within the same partition
2. **Always use `/companyId`** as partition key for tenant data — enables efficient single-partition queries
3. **Keep documents under 100 KB** — if larger, split into header + lines pattern
4. **TTL policies** — consider TTL for chat messages and agent state (e.g., 90 days)

---

## 15. Automated enforcement

ERA includes a custom ESLint plugin (`eslint-plugin-era.js`) that enforces key standards at lint time.

### Rules

| Rule | Severity | What it checks |
|------|----------|---------------|
| `era/field-suffixes` | warn | Fields ending in `*Amount`, `*Rate`, `*Count` must be `number`; `*Date`, `*At` must be `string`; booleans must start with `is`/`has`/`can` |
| `era/doctype-required` | warn | Interfaces for shared-container entities (`Invoice`, `Account`, `Item`, etc.) must include a `docType` field |
| `era/no-cross-partition-query` | warn | Cosmos SQL query strings must include a partition key filter (`companyId`, `id`, or `country`) |

Additional built-in rules enforced:
- `no-eval`, `no-implied-eval`, `no-new-func` — security (§12)
- `no-alert` — frontend must use toast system (§9)
- `eqeqeq` — always use strict equality

### Configuration

The ESLint flat config is in `eslint.config.js`. Rules are set to `warn` (not `error`) during the migration period. Promote to `error` once existing code is brought into compliance.

Test files (`tests/**`) are excluded from `field-suffixes` and `doctype-required` to avoid noise in test fixtures.

### Running

```bash
npm run lint          # Run all ESLint rules including ERA custom rules
```

---

## 16. Machine-readable schema

The standards are also available in machine-readable form for tooling consumption:

| File | Purpose |
|------|---------|
| `docs/development-standards.schema.json` | JSON Schema defining the structure of ERA standards data |
| `docs/development-standards.data.json` | Instance data with all current field rules, data types, containers, lifecycles, error codes, audit events, and coverage targets |

### Use cases

- **Code generators** can read `dataTypes` to generate Zod schemas for new entities
- **CI pipelines** can validate that new entities include required `docType` values
- **Status transition validators** can read `statusLifecycles` to enforce valid transitions at runtime
- **Audit compliance checks** can verify all `mandatoryEvents` are emitted
- **Documentation generators** can produce up-to-date field reference tables

When updating standards, update **both** the human-readable `development-standards.md` and the machine-readable `development-standards.data.json` to keep them in sync.

---

## Appendix A: Entity table reference

Quick reference for all ERA entities and their classification (inspired by D365 F&O table groups):

| Entity | Table group | Container | Partition | `docType` |
|--------|-----------|-----------|-----------|-----------|
| `Company` | Main | `companies` | `/id` | — |
| `UserProfile` | Main | `users` | `/id` | — |
| `Account` | Main | `ledger` | `/companyId` | `"account"` |
| `Contact` | Main | `contacts` | `/companyId` | — |
| `Item` | Main | `inventory` | `/companyId` | `"item"` |
| `PostingRule` | Parameter | `rules` | `/country` | — |
| `Invoice` | Transaction | `documents` | `/companyId` | `"invoice"` |
| `Payment` | Transaction | `documents` | `/companyId` | `"payment"` |
| `JournalEntry` | Transaction | `ledger` | `/companyId` | `"journal-entry"` |
| `VatReturn` | Transaction | `documents` | `/companyId` | `"vat-return"` |
| `StockMovement` | Transaction | `inventory` | `/companyId` | `"stock-movement"` |
| `FiscalPeriod` | Parameter | `ledger` | `/companyId` | `"fiscal-period"` |
| `BusinessEvent` | Log | `events` | `/companyId` | — |
| `ChatMessage` | Log | `chat` | `/companyId` | — |
| `AgentAction` | Worksheet | `agent-state` | `/companyId` | — |
| `Feedback` | Reference | `feedback` | `/id` | — |

**Table groups** (from D365 F&O, adapted):
- **Main** — master data, rarely changes (companies, contacts, items, accounts)
- **Transaction** — business transactions, append-mostly (invoices, payments, journal entries)
- **Parameter** — configuration data (posting rules, fiscal periods)
- **Worksheet** — in-progress work, temporary (agent actions)
- **Log** — immutable audit/history records (events, chat)
- **Reference** — supporting reference data (feedback)

---

## Appendix B: Migration guide (existing → standard)

Fields that should be migrated when modifying existing entities:

| Entity | Current field | Standard field | Priority |
|--------|--------------|---------------|----------|
| `Invoice` | `total` | `totalAmount` | Low (add alias, keep both during transition) |
| `Invoice` | `subtotal` | `netAmount` | Low |
| `Invoice` | `amountPaid` | `paidAmount` | Low |
| `JournalLine` | `vatCode` | `taxCode` | Medium (standardize to single field) |
| All shared-container entities | *(missing)* | `docType` | **High** (add to all entities in shared containers) |

**Migration rules:**
- When modifying an entity, add the standard field alongside the old one
- Update service code to write to both fields
- Update queries to use the standard field
- After all consumers are migrated, remove the legacy field
- Never remove a field without verifying zero reads against it

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-03-22 | Added automated ESLint enforcement (§15): `era/field-suffixes`, `era/doctype-required`, `era/no-cross-partition-query` | ERA team |
| 2026-03-22 | Added machine-readable JSON Schema + data file (§16) for tooling consumption | ERA team |
| 2026-03-22 | Initial standards document created (§1–§14, Appendix A–B) | ERA team |
