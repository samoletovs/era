// Budget management — create and compare budgets vs actuals
// Sprint 4 feature

import { containers } from "./cosmos.js";
import type { Account } from "@shared/types";

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Types ──────────────────────────────────────────────────

export interface BudgetEntry {
  id: string;
  companyId: string;
  fiscalYear: number;
  period: string;           // "2026-03"
  accountCode: string;
  accountName: string;
  amount: number;
  createdAt: string;
  createdBy: string;
}

export interface BudgetVsActual {
  accountCode: string;
  accountName: string;
  accountType: string;
  budget: number;
  actual: number;
  variance: number;
  variancePercent: number;
}

// ─── CRUD ───────────────────────────────────────────────────

export async function setBudget(input: {
  companyId: string;
  fiscalYear: number;
  entries: Array<{ accountCode: string; accountName: string; period: string; amount: number }>;
  createdBy: string;
}): Promise<number> {
  const now = new Date().toISOString();
  let count = 0;
  for (const e of input.entries) {
    const id = `${input.companyId}-budget-${input.fiscalYear}-${e.period}-${e.accountCode}`;
    const entry = {
      id,
      docType: "budget" as const,
      companyId: input.companyId,
      fiscalYear: input.fiscalYear,
      period: e.period,
      accountCode: e.accountCode,
      accountName: e.accountName,
      amount: e.amount,
      createdAt: now,
      createdBy: input.createdBy,
    };
    try {
      await containers.ledger().items.upsert(entry);
      count++;
    } catch { /* skip */ }
  }
  return count;
}

export async function getBudgetVsActual(companyId: string, fiscalYear: number): Promise<BudgetVsActual[]> {
  const yearStart = `${fiscalYear}-01-01`;
  const yearEnd = `${fiscalYear}-12-31`;

  // Get budget entries
  const { resources: budgets } = await containers.ledger().items
    .query<BudgetEntry>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND c.docType = 'budget' AND c.fiscalYear = @year",
      parameters: [
        { name: "@cid", value: companyId },
        { name: "@year", value: fiscalYear },
      ],
    })
    .fetchAll();

  // Get account metadata (names, types)
  const { resources: accounts } = await containers.ledger().items
    .query<Account>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'account' OR (IS_DEFINED(c.code) AND IS_DEFINED(c.normalSide))) AND c.isPostable = true AND (c.type = 'revenue' OR c.type = 'expense') ORDER BY c.code",
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();

  // Get actual amounts from journal entries within the fiscal year
  const { resources: entries } = await containers.ledger().items
    .query<any>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) AND c.status = 'posted' AND c.date >= @from AND c.date <= @to",
      parameters: [
        { name: "@cid", value: companyId },
        { name: "@from", value: yearStart },
        { name: "@to", value: yearEnd },
      ],
    })
    .fetchAll();

  // Aggregate actuals from journal entries by account
  const actualByAccount = new Map<string, number>();
  for (const entry of entries) {
    for (const line of (entry.lines || [])) {
      const code = line.accountCode;
      if (!code) continue;
      if (!code.startsWith("5") && !code.startsWith("6")) continue;
      const isRevenue = code.startsWith("5");
      const amount = isRevenue ? (line.credit - line.debit) : (line.debit - line.credit);
      actualByAccount.set(code, roundCurrency((actualByAccount.get(code) || 0) + amount));
    }
  }

  // Aggregate budgets by account
  const budgetByAccount = new Map<string, number>();
  for (const b of budgets) {
    budgetByAccount.set(b.accountCode, (budgetByAccount.get(b.accountCode) || 0) + b.amount);
  }

  // Build comparison
  const result: BudgetVsActual[] = [];
  const allCodes = new Set([...budgetByAccount.keys(), ...actualByAccount.keys(), ...accounts.map(a => a.code)]);

  for (const code of allCodes) {
    const acct = accounts.find(a => a.code === code);
    const budget = budgetByAccount.get(code) || 0;
    const actual = Math.abs(actualByAccount.get(code) || 0);
    const variance = roundCurrency(budget - actual);

    result.push({
      accountCode: code,
      accountName: acct?.name || budgets.find(b => b.accountCode === code)?.accountName || code,
      accountType: acct?.type || (code.startsWith("5") ? "revenue" : "expense"),
      budget: roundCurrency(budget),
      actual: roundCurrency(actual),
      variance,
      variancePercent: budget !== 0 ? roundCurrency((variance / budget) * 100) : 0,
    });
  }

  return result.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}
