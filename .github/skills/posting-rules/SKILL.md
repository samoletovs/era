---
name: posting-rules
description: >-
  Create, update, review, or validate country-specific posting rules for ERA ERP.
  Use this skill when the user asks to: add a new country's accounting rules, 
  update posting rules for legislation changes, review existing posting rules,
  create rules for a specific country (e.g. "add Estonian posting rules"), 
  fix or debug why a posting produced wrong GL entries, or validate that posting 
  rules are balanced. Also trigger when the user mentions: chart of accounts for 
  a new country, VAT rules change, tax legislation update, accounting standards 
  change, or any request about how invoices/payments should post to the general 
  ledger in a specific country. DO NOT trigger for general accounting questions 
  or for modifying hardcoded posting logic directly.
---

# Posting Rules Skill

ERA uses a **configurable posting rule engine** instead of hardcoded GL posting logic.
Rules are stored as JSON in Cosmos DB (container: `rules`, partitioned by `/country`)
and defined as TypeScript seed files in `src/shared/rules/{country-code}.ts`.

When a user asks you to add or update posting rules for a country, follow this process.

## How Posting Rules Work

Each rule defines how a document type (invoice, payment) creates GL journal entries:

```typescript
interface PostingRule {
  id: string;                    // e.g. "lv-sales-invoice-v1"
  country: string;               // ISO 3166-1 alpha-2 (e.g. "LV", "EE", "LT")
  documentType: "sales-invoice" | "purchase-invoice" | "incoming-payment" | "outgoing-payment";
  name: string;                  // Human-readable name
  description: string;           // What this rule does
  version: number;               // Increment for updates (latest active wins)
  conditions: PostingRuleCondition[];  // When this rule applies
  lines: PostingRuleLine[];      // GL entries to create
  effectiveFrom: string;         // ISO date — when rule takes effect
  effectiveTo?: string;          // null = still current
  isActive: boolean;
  source?: string;               // Legal reference, e.g. "LV-Cabinet-Regulation-775-2015"
  legalBasis?: string[];         // Paragraph-level citations, e.g. ["Reg 775 §50", "Reg 775 §156"]
}
```

### Rule Lines

Each line in `lines` produces a journal entry line:

```typescript
interface PostingRuleLine {
  accountCode: string;           // GL account, or "{{line.accountCode}}" for per-invoice-line expansion
  accountName: string;           // Display name
  side: "debit" | "credit";     // Which side of the journal
  amountExpr: string;            // Amount expression (see below)
  description?: string;
  taxCode?: string;              // e.g. "LV-output", "EE-input"
}
```

### Amount Expressions

**Document-level** (evaluated once per document):
- `invoice.total` — full invoice amount including VAT
- `invoice.subtotal` — invoice amount excluding VAT
- `invoice.vatAmount` — total VAT on the invoice
- `payment.amount` — payment amount

**Line-level** (evaluated per invoice line — triggers expansion):
- `line.netAmount` — quantity × unit price for each invoice line
- `line.vatAmount` — VAT for each invoice line
- `line.total` — net + VAT for each invoice line

### Dynamic Account Codes

Use `{{line.accountCode}}` as the `accountCode` to reference the account code from each invoice line.
This allows revenue/expense accounts to vary per line item.

## Step-by-Step: Adding Rules for a New Country

### 1. Research the Country's Accounting Requirements

You need to determine:
- **Chart of Accounts structure** — account codes for AR, AP, bank, VAT, revenue, expenses
- **VAT rates** — standard, reduced, zero rates
- **Invoice posting pattern** — how sales and purchase invoices create GL entries
- **Payment posting pattern** — how customer/vendor payments create GL entries
- **Tax codes** — how VAT/GST is tracked (output vs input, per rate)
- **Legal source** — regulation name/number for the `source` field

### 2. Create the Rule File

Create `src/shared/rules/{country-code}.ts` following this template:

```typescript
import type { PostingRule } from "@shared/types";

const now = new Date().toISOString();
const base = {
  isActive: true,
  createdAt: now,
  updatedAt: now,
  createdBy: "copilot-skill",
  source: "COUNTRY-REGULATION-NAME",
};

export const XX_POSTING_RULES: PostingRule[] = [
  {
    id: "xx-sales-invoice-v1",
    country: "XX",
    documentType: "sales-invoice",
    name: "Country — Sales invoice posting",
    description: "...",
    version: 1,
    conditions: [{ field: "invoice.type", operator: "eq", value: "sales" }],
    lines: [
      // DR Accounts Receivable for total
      { accountCode: "XXXX", accountName: "Accounts receivable", side: "debit",
        amountExpr: "invoice.total", description: "AR" },
      // CR Revenue per line
      { accountCode: "{{line.accountCode}}", accountName: "Revenue", side: "credit",
        amountExpr: "line.netAmount" },
      // CR VAT payable for total VAT
      { accountCode: "XXXX", accountName: "VAT payable", side: "credit",
        amountExpr: "invoice.vatAmount", taxCode: "XX-output" },
    ],
    effectiveFrom: "2024-01-01",
    ...base,
  },
  // ... purchase-invoice, incoming-payment, outgoing-payment
];
```

### 3. Validate the Rules

For EVERY rule, manually verify that:

1. **Balance check**: For any document, total debits MUST equal total credits
   - Sales invoice: DR(total) = CR(sum of line nets) + CR(vatAmount) ✓
   - Purchase invoice: CR(total) = DR(sum of line nets) + DR(vatAmount) ✓
   - Payment: DR(amount) = CR(amount) ✓

2. **Account codes exist** in the country's chart of accounts

3. **Tax codes** follow the pattern `{COUNTRY}-{type}` (e.g. "EE-output", "LT-input")

### 4. Register the Seed in the Router

Add an import for the new country in `src/backend/api/router.ts` in the
`/rules/seed` endpoint, so `POST /api/rules/seed?country=XX` works.

### 5. Update Posting Services to Use Company Country

Currently `invoice.ts` and `payment.ts` hardcode `"LV"` in the `getActiveRule()` call.
When adding a second country, update these to read `company.country` instead.

## Updating Existing Rules for Legislation Changes

When a country changes its accounting rules (new VAT rate, new account requirement):

1. **Don't modify the existing rule** — create a new version instead
2. Set `effectiveTo` on the old rule to the day before the new rule takes effect
3. Create a new rule with `version: oldVersion + 1` and `effectiveFrom` = new date
4. The rule engine always picks the latest active version for the current date

Example: Latvia changes VAT rate from 21% to 22% on 2027-01-01:
- Update `lv-sales-invoice-v1`: set `effectiveTo: "2026-12-31"`
- Create `lv-sales-invoice-v2`: set `effectiveFrom: "2027-01-01"`, update tax codes

## Reference: Latvia (LV) Rules

See `src/shared/rules/lv.ts` for the complete Latvia implementation.
Based on Cabinet Regulation No. 775 — Latvian Chart of Accounts.

Key LV account codes:
| Code | Name | Used for |
|------|------|----------|
| 2210 | Accounts receivable | Sales invoice AR |
| 2310 | VAT receivable | Input VAT on purchases |
| 2420 | Bank accounts | Payment receipt/disbursement |
| 4220 | Trade payables | Purchase invoice AP |
| 4230 | VAT payable | Output VAT on sales |
| 5220 | Foreign exchange gains | FX revaluation gain |
| 6420 | Foreign exchange losses | FX revaluation loss |

LV VAT rates: 21% (standard), 12% (reduced), 5% (super-reduced), 0% (zero).

## FX Revaluation Rules

Every country MUST include an `fx-revaluation` rule that defines where FX gains
and losses post. The currency revaluation service resolves these accounts
automatically from the posting rules — **no manual settings needed**.

Amount expressions for FX revaluation rules:
- `revaluation.gain` — unrealized FX gain amount
- `revaluation.loss` — unrealized FX loss amount

Example (Latvia):
```typescript
{
  id: "lv-fx-revaluation-v1",
  country: "LV",
  documentType: "fx-revaluation",
  name: "Latvia — Foreign currency revaluation",
  description: "Unrealized FX gain: CR 5220. Unrealized FX loss: DR 6420.",
  version: 1,
  conditions: [],
  lines: [
    { accountCode: "5220", accountName: "Foreign exchange gains", side: "credit", amountExpr: "revaluation.gain" },
    { accountCode: "6420", accountName: "Foreign exchange losses", side: "debit", amountExpr: "revaluation.loss" },
  ],
  effectiveFrom: "2024-01-01",
  ...base,
}
```

This design follows ERA's **zero-config principle**: users never configure GL accounts
for revaluation — the system derives them from the country's legislation and CoA.
