// Latvia (LV) — Default posting rules
// Based on Cabinet Regulation No. 775 — Latvian Chart of Accounts
// These rules can be seeded into the rules container via seedRules()

import type { PostingRule } from "@shared/types";

const now = new Date().toISOString();
const base = {
  isActive: true,
  createdAt: now,
  updatedAt: now,
  createdBy: "system",
  source: "LV-Cabinet-Regulation-775",
};

export const LV_POSTING_RULES: PostingRule[] = [
  // ─── Sales Invoice ────────────────────────────────────────
  {
    id: "lv-sales-invoice-v1",
    country: "LV",
    documentType: "sales-invoice",
    name: "Latvia — Sales invoice posting",
    description:
      "DR Accounts Receivable (2210) for total. CR Revenue per line. CR VAT Payable (4230) for VAT total.",
    version: 1,
    conditions: [{ field: "invoice.type", operator: "eq", value: "sales" }],
    lines: [
      {
        accountCode: "2210",
        accountName: "Accounts receivable",
        side: "debit",
        amountExpr: "invoice.total",
        description: "AR — customer",
      },
      {
        accountCode: "{{line.accountCode}}",
        accountName: "Revenue",
        side: "credit",
        amountExpr: "line.netAmount",
        description: "Revenue per line",
      },
      {
        accountCode: "4230",
        accountName: "VAT payable",
        side: "credit",
        amountExpr: "invoice.vatAmount",
        description: "Output VAT",
        taxCode: "LV-output",
      },
    ],
    effectiveFrom: "2024-01-01",
    ...base,
  },

  // ─── Purchase Invoice ─────────────────────────────────────
  {
    id: "lv-purchase-invoice-v1",
    country: "LV",
    documentType: "purchase-invoice",
    name: "Latvia — Purchase invoice posting",
    description:
      "CR Trade Payables (4220) for total. DR Expense/Asset per line. DR VAT Receivable (2310) for VAT total.",
    version: 1,
    conditions: [{ field: "invoice.type", operator: "eq", value: "purchase" }],
    lines: [
      {
        accountCode: "4220",
        accountName: "Trade payables",
        side: "credit",
        amountExpr: "invoice.total",
        description: "AP — vendor",
      },
      {
        accountCode: "{{line.accountCode}}",
        accountName: "Expense/Asset",
        side: "debit",
        amountExpr: "line.netAmount",
        description: "Expense per line",
      },
      {
        accountCode: "2310",
        accountName: "VAT receivable",
        side: "debit",
        amountExpr: "invoice.vatAmount",
        description: "Input VAT",
        taxCode: "LV-input",
      },
    ],
    effectiveFrom: "2024-01-01",
    ...base,
  },

  // ─── Incoming Payment (Customer) ──────────────────────────
  {
    id: "lv-incoming-payment-v1",
    country: "LV",
    documentType: "incoming-payment",
    name: "Latvia — Customer payment received",
    description: "DR Bank (2420). CR Accounts Receivable (2210).",
    version: 1,
    conditions: [{ field: "payment.type", operator: "eq", value: "incoming" }],
    lines: [
      {
        accountCode: "2420",
        accountName: "Bank accounts",
        side: "debit",
        amountExpr: "payment.amount",
        description: "Bank receipt",
      },
      {
        accountCode: "2210",
        accountName: "Accounts receivable",
        side: "credit",
        amountExpr: "payment.amount",
        description: "AR settlement",
      },
    ],
    effectiveFrom: "2024-01-01",
    ...base,
  },

  // ─── Outgoing Payment (Vendor) ────────────────────────────
  {
    id: "lv-outgoing-payment-v1",
    country: "LV",
    documentType: "outgoing-payment",
    name: "Latvia — Vendor payment sent",
    description: "DR Trade Payables (4220). CR Bank (2420).",
    version: 1,
    conditions: [{ field: "payment.type", operator: "eq", value: "outgoing" }],
    lines: [
      {
        accountCode: "4220",
        accountName: "Trade payables",
        side: "debit",
        amountExpr: "payment.amount",
        description: "AP settlement",
      },
      {
        accountCode: "2420",
        accountName: "Bank accounts",
        side: "credit",
        amountExpr: "payment.amount",
        description: "Bank payment",
      },
    ],
    effectiveFrom: "2024-01-01",
    ...base,
  },

  // ─── FX Revaluation (month-end) ──────────────────────────
  // Accounts derived from Latvian CoA (Cabinet Regulation No. 775):
  //   5220 — Foreign exchange gains (Valūtas kursa peļņa)
  //   6420 — Foreign exchange losses (Valūtas kursa zaudējumi)
  {
    id: "lv-fx-revaluation-v1",
    country: "LV",
    documentType: "fx-revaluation",
    name: "Latvia — Foreign currency revaluation",
    description:
      "Unrealized FX gain: CR 5220. Unrealized FX loss: DR 6420. Per Cabinet Regulation No. 775.",
    version: 1,
    conditions: [],
    lines: [
      {
        accountCode: "5220",
        accountName: "Foreign exchange gains",
        side: "credit",
        amountExpr: "revaluation.gain",
        description: "Unrealized FX gain",
      },
      {
        accountCode: "6420",
        accountName: "Foreign exchange losses",
        side: "debit",
        amountExpr: "revaluation.loss",
        description: "Unrealized FX loss",
      },
    ],
    effectiveFrom: "2024-01-01",
    ...base,
  },
];
