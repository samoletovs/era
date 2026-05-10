// Latvia (LV) — Default posting rules
//
// Legal framework:
//   • Annual Reports and Consolidated Annual Reports Law (Gada pārskatu un
//     konsolidēto gada pārskatu likums) — defines balance-sheet and P&L
//     line-item structure that the rules below feed into.
//   • Cabinet Regulation No. 775 of 22 December 2015 — "Gada pārskatu un
//     konsolidēto gada pārskatu likuma piemērošanas noteikumi" — the
//     application rules for the Annual Reports Law. Cited inline as
//     "Reg 775 §N". Does **not** prescribe specific account codes; account
//     codes below follow the conventional Latvian commercial chart of
//     accounts and accounting policy adopted under Reg 775 §29–§30.
//   • Value Added Tax Law (Pievienotās vērtības nodokļa likums) — basis
//     for VAT recognition (input/output) on invoice lines.
//
// Each rule's `legalBasis` field cites the specific paragraphs of Reg 775
// that justify the recognition pattern. Account codes are commercial
// convention, not regulatory mandate.
//
// These rules can be seeded into the rules container via seedRules()

import type { PostingRule } from '@shared/types';

const now = new Date().toISOString();
const base = {
  isActive: true,
  createdAt: now,
  updatedAt: now,
  createdBy: 'system',
  source: 'LV-Cabinet-Regulation-775-2015',
};

export const LV_POSTING_RULES: PostingRule[] = [
  // ─── Sales Invoice ────────────────────────────────────────
  // Reg 775 §50: revenue from goods/services sales reported in P&L "Net
  //              turnover" (Neto apgrozījums).
  // Reg 775 §51: revenue is economic benefits earned in the ordinary
  //              course of business that increase equity.
  // Reg 775 §52: amounts collected on behalf of third parties (i.e. VAT
  //              collected for the State) are NOT included in revenue —
  //              hence the separate VAT-payable credit.
  // Reg 775 §53: recognition criteria for goods sales (transfer of risks
  //              and rewards of ownership).
  // Reg 775 §156: debtor balances in the balance sheet are based on
  //               supporting documents and accounting register entries.
  {
    id: 'lv-sales-invoice-v1',
    country: 'LV',
    documentType: 'sales-invoice',
    name: 'Latvia — Sales invoice posting',
    description:
      'DR Accounts Receivable (2210) for total. CR Revenue per line (Reg 775 §50–§53). CR VAT Payable (4230) for VAT total — VAT is a third-party collection (Reg 775 §52), not revenue.',
    version: 1,
    conditions: [{ field: 'invoice.type', operator: 'eq', value: 'sales' }],
    lines: [
      {
        accountCode: '2210',
        accountName: 'Accounts receivable',
        side: 'debit',
        amountExpr: 'invoice.total',
        description: 'AR — customer (Reg 775 §156)',
      },
      {
        accountCode: '{{line.accountCode}}',
        accountName: 'Revenue',
        side: 'credit',
        amountExpr: 'line.netAmount',
        description: 'Revenue per line (Reg 775 §50, §51, §53)',
      },
      {
        accountCode: '4230',
        accountName: 'VAT payable',
        side: 'credit',
        amountExpr: 'invoice.vatAmount',
        description: 'Output VAT — third-party collection (Reg 775 §52); VAT Law',
        taxCode: 'LV-output',
      },
    ],
    effectiveFrom: '2024-01-01',
    legalBasis: [
      "Reg 775 §50 — Revenue in P&L 'Net turnover'",
      'Reg 775 §51 — Revenue definition (economic benefits)',
      'Reg 775 §52 — Third-party collections excluded from revenue (VAT)',
      'Reg 775 §53 — Goods sale recognition (transfer of risks/rewards)',
      'Reg 775 §156 — Debtor balances based on supporting documents',
      'VAT Law — Output VAT recognition',
    ],
    ...base,
  },

  // ─── Purchase Invoice ─────────────────────────────────────
  // Reg 775 §156: creditor balances based on supporting documents and
  //               reconciled with counterparties at balance date.
  // Matching principle (Annual Reports Law general principles + Reg 775
  // §55): expenses associated with a transaction are recognised in the
  // same period as the related goods/services flow.
  // VAT Law: input VAT recoverable when an inbound invoice meets formal
  // requirements (separate from Reg 775).
  {
    id: 'lv-purchase-invoice-v1',
    country: 'LV',
    documentType: 'purchase-invoice',
    name: 'Latvia — Purchase invoice posting',
    description:
      'CR Trade Payables (4220) for total (Reg 775 §156). DR Expense/Asset per line (matching principle, P&L cost lines per Annual Reports Law schema). DR VAT Receivable (2310) for VAT total — input VAT is a receivable from the State (VAT Law).',
    version: 1,
    conditions: [{ field: 'invoice.type', operator: 'eq', value: 'purchase' }],
    lines: [
      {
        accountCode: '4220',
        accountName: 'Trade payables',
        side: 'credit',
        amountExpr: 'invoice.total',
        description: 'AP — vendor (Reg 775 §156)',
      },
      {
        accountCode: '{{line.accountCode}}',
        accountName: 'Expense/Asset',
        side: 'debit',
        amountExpr: 'line.netAmount',
        description:
          'Expense/asset per line (matching principle; P&L cost classification per Annual Reports Law)',
      },
      {
        accountCode: '2310',
        accountName: 'VAT receivable',
        side: 'debit',
        amountExpr: 'invoice.vatAmount',
        description: 'Input VAT receivable from the State (VAT Law)',
        taxCode: 'LV-input',
      },
    ],
    effectiveFrom: '2024-01-01',
    legalBasis: [
      'Reg 775 §156 — Creditor balances based on supporting documents',
      'Annual Reports Law — P&L cost classification (Annex 2/3)',
      'VAT Law — Input VAT recognition',
    ],
    ...base,
  },

  // ─── Incoming Payment (Customer) ──────────────────────────
  // Reg 775 §156: settlement of debtor balances against bank receipts
  //               based on supporting documents.
  {
    id: 'lv-incoming-payment-v1',
    country: 'LV',
    documentType: 'incoming-payment',
    name: 'Latvia — Customer payment received',
    description:
      'DR Bank (2420). CR Accounts Receivable (2210). Settlement of debtor balance (Reg 775 §156).',
    version: 1,
    conditions: [{ field: 'payment.type', operator: 'eq', value: 'incoming' }],
    lines: [
      {
        accountCode: '2420',
        accountName: 'Bank accounts',
        side: 'debit',
        amountExpr: 'payment.amount',
        description: 'Bank receipt',
      },
      {
        accountCode: '2210',
        accountName: 'Accounts receivable',
        side: 'credit',
        amountExpr: 'payment.amount',
        description: 'AR settlement (Reg 775 §156)',
      },
    ],
    effectiveFrom: '2024-01-01',
    legalBasis: ['Reg 775 §156 — Debtor balance settlement'],
    ...base,
  },

  // ─── Outgoing Payment (Vendor) ────────────────────────────
  // Reg 775 §156: settlement of creditor balances against bank payments
  //               based on supporting documents.
  {
    id: 'lv-outgoing-payment-v1',
    country: 'LV',
    documentType: 'outgoing-payment',
    name: 'Latvia — Vendor payment sent',
    description:
      'DR Trade Payables (4220). CR Bank (2420). Settlement of creditor balance (Reg 775 §156).',
    version: 1,
    conditions: [{ field: 'payment.type', operator: 'eq', value: 'outgoing' }],
    lines: [
      {
        accountCode: '4220',
        accountName: 'Trade payables',
        side: 'debit',
        amountExpr: 'payment.amount',
        description: 'AP settlement (Reg 775 §156)',
      },
      {
        accountCode: '2420',
        accountName: 'Bank accounts',
        side: 'credit',
        amountExpr: 'payment.amount',
        description: 'Bank payment',
      },
    ],
    effectiveFrom: '2024-01-01',
    legalBasis: ['Reg 775 §156 — Creditor balance settlement'],
    ...base,
  },

  // ─── FX Revaluation (month-end) ──────────────────────────
  // Reg 775 §38–§39: accounting estimates must be reliable and use latest
  //                   available information.
  // Reg 775 §105¹: explicitly distinguishes FX revaluation from other
  //                revaluations for corporate-income-tax purposes
  //                ("izņemot aktīvu pārvērtēšanu sakarā ar ārvalstu
  //                 valūtas kursa maiņu").
  // Annual Reports Law general principles — monetary items denominated in
  // foreign currency are translated at the balance-date rate; resulting
  // gains/losses go through P&L.
  // Account codes (commercial chart of accounts convention):
  //   5220 — Foreign exchange gains (Valūtas kursa peļņa)
  //   6420 — Foreign exchange losses (Valūtas kursa zaudējumi)
  {
    id: 'lv-fx-revaluation-v1',
    country: 'LV',
    documentType: 'fx-revaluation',
    name: 'Latvia — Foreign currency revaluation',
    description:
      'Unrealised FX gain: CR 5220. Unrealised FX loss: DR 6420. Reliable accounting estimate per Reg 775 §38–§39; FX revaluation explicitly recognised in Reg 775 §105¹.',
    version: 1,
    conditions: [],
    lines: [
      {
        accountCode: '5220',
        accountName: 'Foreign exchange gains',
        side: 'credit',
        amountExpr: 'revaluation.gain',
        description: 'Unrealised FX gain (Reg 775 §38–§39, §105¹)',
      },
      {
        accountCode: '6420',
        accountName: 'Foreign exchange losses',
        side: 'debit',
        amountExpr: 'revaluation.loss',
        description: 'Unrealised FX loss (Reg 775 §38–§39, §105¹)',
      },
    ],
    effectiveFrom: '2024-01-01',
    legalBasis: [
      'Reg 775 §38 — Accounting estimates',
      'Reg 775 §39 — Reliable estimates using latest available information',
      'Reg 775 §105¹ — FX revaluation explicitly distinguished for CIT purposes',
      'Annual Reports Law — Foreign-currency monetary items at balance-date rate',
    ],
    ...base,
  },
];
