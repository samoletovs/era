# Architecture Decision Record: Transaction Model & GL Design

**Status**: Accepted  
**Date**: 2026-03-22  
**Authors**: Sam (ERA project lead)  
**Supersedes**: None

---

## Context

ERA is an AI-agent-first cloud ERP targeting Latvian SIA companies, with a roadmap toward multi-country support. A critical architectural decision was needed: should ERA adopt the traditional ERP subledger transaction model (as seen in Dynamics 365 Finance & Operations), or take a modern unified approach?

Traditional ERPs like D365 F&O maintain **7+ separate transaction tables**: `GeneralJournalAccountEntry`, `VendTrans`, `CustTrans`, `TaxTrans`, `InventTrans`, `AssetTrans`, `BankAccountTrans`. Each subledger tracks its own balances, settlements, and aging — then reconciles to the General Ledger. This model originated in the 1990s when queries were expensive and denormalized views were necessary for performance.

We evaluated the transaction architectures of:

| ERP | Model | Key takeaway |
|-----|-------|-------------|
| **D365 F&O** | Full subledger (7+ transaction tables) | Maximum auditability, maximum complexity |
| **SAP S/4HANA** | Single journal (ACDOCA) — merged all subledgers into one table | Industry signal: subledgers are being retired |
| **Xero / QuickBooks** | Document-centric, no subledger concept | Works for SME, breaks at scale |
| **Odoo** | Document → Journal Entry → Account Move Lines, no subledgers | One transaction model for everything |
| **ERPNext** | GL Entry table is sole source of truth | All reports derive from GL |
| **NetSuite** | Hybrid — unified GL + saved searches per module | Good balance for mid-market |

## Decision

**We chose a unified General Ledger with enriched journal lines, an immutable event log, and a configurable posting rule engine. No subledger transaction tables.**

This is the SAP ACDOCA approach — one rich transaction record — combined with an event-sourcing-inspired audit trail and agent-native rule engine.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  SOURCE DOCUMENTS                                                    │
│  Invoice (sales/purchase) · Payment (incoming/outgoing) · Manual     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  POSTING RULE ENGINE                                                 │
│                                                                      │
│  1. Look up active rule:  getActiveRule(country, documentType)       │
│  2. Evaluate rule against document → JournalLine[]                   │
│  3. If rule is missing or invalid → fall back to hardcoded logic     │
│                                                                      │
│  Rules stored in Cosmos DB (container: rules, partitioned: /country) │
│  Configured per country, versioned, date-effective                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GENERAL LEDGER (single source of truth)                             │
│                                                                      │
│  JournalEntry                                                        │
│    ├── entryNumber: "2026-03-0042"                                   │
│    ├── status: posted | reversed                                     │
│    ├── sourceType: invoice | payment | manual | adjustment           │
│    ├── sourceId: → original document                                 │
│    └── lines: JournalLine[]                                          │
│         ├── accountCode, debit, credit                               │
│         ├── contactId     ← enables AR/AP aging without subledger    │
│         ├── itemId        ← enables inventory valuation from GL      │
│         ├── taxCode       ← enables tax reporting from GL            │
│         ├── taxAmount     ← tax amount per line                      │
│         ├── currencyCode  ← multi-currency prep                      │
│         ├── exchangeRate  ← rate to company currency                 │
│         └── amountInCurrency  ← original transaction amount          │
│                                                                      │
│  Account.balance — denormalized, updated in real-time with _etag     │
│  optimistic concurrency on every posting                             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  IMMUTABLE EVENT LOG                                                 │
│                                                                      │
│  BusinessEvent (append-only, never mutated)                          │
│    type: "invoice.posted" | "payment.posted" | "entry.reversed" ...  │
│    actor: userId | "system"                                          │
│    documentId, journalEntryId, data: {}                              │
│                                                                      │
│  Stored in Cosmos DB (container: events, partitioned: /companyId)    │
│  Provides full audit trail without polluting business entities       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  REPORTING (reads directly from GL)                                  │
│                                                                      │
│  Trial Balance    ← Account.balance (postable accounts)              │
│  Balance Sheet    ← Account.balance grouped by type                  │
│  Profit & Loss    ← Account.balance (revenue + expense types)        │
│  AR Aging         ← JournalLine WHERE contactId + accountCode=2210   │
│  AP Aging         ← JournalLine WHERE contactId + accountCode=4220   │
│  Tax Report       ← JournalLine WHERE taxCode IS DEFINED             │
│  VAT Return       ← Invoice lines aggregated by vatRate + type       │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Enriched Journal Lines (instead of subledger tables)

Traditional ERPs store separate `VendTrans`, `CustTrans`, `TaxTrans` records because the GL entry alone didn't carry enough information. Our approach adds **dimensions** directly to `JournalLine`:

| Field | Purpose | Replaces |
|-------|---------|----------|
| `contactId` | Links to customer/vendor | `VendTrans` + `CustTrans` |
| `itemId` | Links to inventory item | `InventTrans` |
| `taxCode` | Tax identifier (e.g. `"LV-21"`) | `TaxTrans` |
| `taxAmount` | Tax amount on this line | `TaxTrans` |
| `currencyCode` | Transaction currency | Multi-currency subledger |
| `exchangeRate` | Rate to company currency | Currency revaluation |
| `amountInCurrency` | Amount in original currency | Multi-currency subledger |

This means a single query on the ledger container can answer questions that previously required joining across 3-4 subledger tables.

### 2. Account Balance Denormalization

`Account.balance` is updated in real-time when journal entries are posted. This is a deliberate denormalization for performance — reports read the stored balance rather than aggregating all transactions.

**Concurrency protection**: Every balance update uses Cosmos DB `_etag` optimistic concurrency. If two postings hit the same account simultaneously, the second will fail and can be retried.

```
Account.balance += (normalSide === "credit" ? -delta : delta)
Replace with { accessCondition: { type: "IfMatch", condition: etag } }
```

### 3. Immutable Event Log

Every business action emits an append-only `BusinessEvent`:

| Event | Emitted by | Data |
|-------|-----------|------|
| `entry.posted` | `postJournalEntry()` | entryNumber, sourceType, totalDebit |
| `entry.reversed` | `reverseJournalEntry()` | entryNumber |
| `invoice.created` | `createInvoice()` | invoiceNumber, type, total |
| `invoice.posted` | `postInvoice()` | invoiceNumber, type, total, journalEntryId |
| `payment.posted` | `createAndPostPayment()` | type, amount, contactName, journalEntryId |

Events are written with a fire-and-forget pattern — if the event write fails, the business transaction still succeeds. Events are queryable via `GET /api/companies/:id/events`.

### 4. Posting Rule Engine

Instead of hardcoded posting logic per document type, rules are **data** stored in Cosmos DB:

```typescript
PostingRule {
  country: "LV",
  documentType: "sales-invoice",
  lines: [
    { accountCode: "2210", side: "debit",  amountExpr: "invoice.total" },
    { accountCode: "{{line.accountCode}}", side: "credit", amountExpr: "line.netAmount" },
    { accountCode: "4230", side: "credit", amountExpr: "invoice.vatAmount" },
  ],
  effectiveFrom: "2024-01-01",
  version: 1,
}
```

**Evaluation flow**:
1. `getActiveRule(country, documentType)` — finds the latest active, date-effective rule
2. `evaluateInvoiceRule(rule, invoice)` / `evaluatePaymentRule(rule, payment)` — expands lines
3. Line-level expressions (`line.netAmount`) expand per invoice line
4. Validation: if debits ≠ credits or total = 0, the rule result is discarded
5. **Fallback**: if no rule found or validation fails, hardcoded `buildInvoiceJournalLines()` is used

**Amount expressions**:
- Document-level: `invoice.total`, `invoice.subtotal`, `invoice.vatAmount`, `payment.amount`
- Line-level (triggers per-line expansion): `line.netAmount`, `line.vatAmount`, `line.total`
- Dynamic accounts: `{{line.accountCode}}` resolves to each invoice line's account code

**Versioning**: Rules are versioned and date-effective. When legislation changes, a new version is created with `effectiveFrom` set to the new date, and the old version gets `effectiveTo` set to the day before. Historical postings remain valid under the rule that was active at posting time.

### 5. Latvia Default Rules

Four rules ship by default for Latvia (`src/shared/rules/lv.ts`), based on Cabinet Regulation No. 775:

| Rule | DR | CR |
|------|----|----|
| Sales invoice | 2210 (AR) = total | Revenue per line + 4230 (VAT) |
| Purchase invoice | Expense per line + 2310 (VAT) | 4220 (AP) = total |
| Customer payment | 2420 (Bank) | 2210 (AR) |
| Vendor payment | 4220 (AP) | 2420 (Bank) |

Rules are seeded via `POST /api/rules/seed`.

## Data Storage

All data resides in Azure Cosmos DB (serverless, NoSQL):

| Container | Partition key | Contents |
|-----------|--------------|----------|
| `companies` | `/id` | Company master data |
| `users` | `/id` | User profiles |
| `ledger` | `/companyId` | Accounts + Journal entries |
| `documents` | `/companyId` | Invoices + Payments + VAT returns |
| `contacts` | `/companyId` | Customers & Vendors |
| `inventory` | `/companyId` | Items + Stock movements |
| `events` | `/companyId` | Immutable business event log |
| `rules` | `/country` | Posting rules (per country) |
| `chat` | `/companyId` | Agent chat history |
| `agent-state` | `/companyId` | Agent state & actions |
| `feedback` | `/id` | User feedback / dev tasks |

## What We Explicitly Do NOT Have

| Traditional ERP concept | Our approach | Why |
|------------------------|-------------|-----|
| `VendTrans` (AP transactions) | GL entries with `contactId` | Query GL WHERE contactId + accountCode=4220 |
| `CustTrans` (AR transactions) | GL entries with `contactId` | Query GL WHERE contactId + accountCode=2210 |
| `TaxTrans` (tax transactions) | GL entries with `taxCode` + `taxAmount` | Query GL WHERE taxCode IS DEFINED |
| `InventTrans` (stock transactions) | `StockMovement` entity + GL entries with `itemId` | Lightweight; no separate costing subledger |
| `AssetTrans` (fixed asset transactions) | Not yet needed | Will use GL entries with assetId when implemented |
| `BankAccountTrans` (bank transactions) | GL entries on account 2420 | Bank reconciliation can query GL directly |
| Subledger journal | Not needed | No intermediate layer between documents and GL |
| GL ↔ Subledger reconciliation | Not needed | Single source of truth eliminates reconciliation |

## Consequences

### Positive

- **Agent-friendly**: AI agents understand 1 GL schema + 1 event log, not 7+ specialized tables
- **Zero reconciliation**: No subledger-to-GL reconciliation needed — a whole category of issues eliminated
- **Country expansion via data**: Adding a new country means adding posting rules (JSON), not rewriting posting services
- **Audit trail without duplication**: Event log provides complete audit without storing the same amount in 5 places
- **Schema simplicity**: One `JournalLine` schema for all reporting — AR aging, AP aging, tax reports, inventory valuation
- **VS Code Copilot integration**: The `posting-rules` skill enables Copilot to create and validate rules for new countries

### Negative / Risks

- **Account balance denormalization**: `Account.balance` can drift if a write fails after journal creation but before balance update. Mitigated by `_etag` optimistic concurrency.
- **No complex settlement**: D365's `VendTrans.settle()` handles partial payments, credit notes, netting across invoices. ERA currently just tracks `amountPaid` per invoice. This is sufficient for Latvian SIA companies today but may need enhancement for complex AP/AR scenarios.
- **Rule engine limitations**: The expression evaluator is deliberately simple (fixed expressions, not arbitrary formulas). Complex posting logic that depends on computed values or conditional branching still requires hardcoded functions.
- **Query performance**: Filtering GL entries by `contactId` or `taxCode` requires composite indexes. For high-volume companies, these queries may need Cosmos DB indexing policy tuning.

## Future Evolution

| Capability | Approach | Status |
|-----------|---------|--------|
| Multi-currency transactions | `currencyCode`, `exchangeRate`, `amountInCurrency` fields on JournalLine | Fields added, logic not yet implemented |
| New country support | Create `src/shared/rules/{country}.ts` + seed via API | Latvia (LV) complete |
| Fixed asset tracking | Add `assetId` to JournalLine + depreciation posting rules | Not started |
| Cost center / project accounting | Add `costCenter`, `projectId` to JournalLine | Not started |
| Bank reconciliation | Match bank statement lines to GL entries on account 2420 | Not started |
| Credit note settlement | Formal settlement model linking credit/debit documents | Not started |

## API Surface

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/rules` | GET | List posting rules (filter by `?country=`) |
| `/api/rules/seed` | POST | Seed default rules for a country |
| `/api/companies/:id/events` | GET | Query event log (filter by `?type=`, `?limit=`) |

## References

- SAP S/4HANA Universal Journal (ACDOCA): [SAP documentation on single-journal architecture](https://help.sap.com)
- Latvian Cabinet Regulation No. 775: Chart of Accounts and financial reporting requirements
- ERA posting-rules Copilot skill: `.github/skills/posting-rules/SKILL.md`
