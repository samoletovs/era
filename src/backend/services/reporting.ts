import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import type { VatReturn, VatReturnLine, Invoice, Account } from "@shared/types";

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Generate VAT Return ────────────────────────────────────

export async function generateVatReturn(
  companyId: string,
  year: number,
  month: number,
  createdBy: string
): Promise<VatReturn> {
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const startDate = `${period}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${period}-${lastDay}`;

  // Get all posted invoices in this period
  const { resources: invoices } = await containers.documents().items
    .query<Invoice>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND IS_DEFINED(c.invoiceNumber) AND c.status != 'draft' AND c.status != 'cancelled' AND c.date >= @start AND c.date <= @end",
      parameters: [
        { name: "@cid", value: companyId },
        { name: "@start", value: startDate },
        { name: "@end", value: endDate },
      ],
    })
    .fetchAll();

  // Aggregate by VAT rate and type
  const vatMap = new Map<string, VatReturnLine>();

  for (const inv of invoices) {
    for (const line of inv.lines) {
      const type = inv.type === "sales" ? "output" : "input";
      const key = `${type}-${line.vatRate}`;
      const existing = vatMap.get(key);
      const net = roundCurrency(line.quantity * line.unitPrice);

      if (existing) {
        existing.taxableAmount = roundCurrency(existing.taxableAmount + net);
        existing.vatAmount = roundCurrency(existing.vatAmount + line.vatAmount);
      } else {
        vatMap.set(key, {
          vatRate: line.vatRate,
          taxableAmount: net,
          vatAmount: line.vatAmount,
          type,
        });
      }
    }
  }

  const lines = Array.from(vatMap.values());
  const outputVat = roundCurrency(
    lines.filter((l) => l.type === "output").reduce((s, l) => s + l.vatAmount, 0)
  );
  const inputVat = roundCurrency(
    lines.filter((l) => l.type === "input").reduce((s, l) => s + l.vatAmount, 0)
  );

  const now = new Date().toISOString();
  const vatReturn: VatReturn = {
    id: uuidv4(),
    companyId,
    period,
    startDate,
    endDate,
    outputVat,
    inputVat,
    vatPayable: roundCurrency(outputVat - inputVat),
    status: "draft",
    lines,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy,
  };

  await containers.documents().items.create(vatReturn);
  return vatReturn;
}

// ─── Financial Statements ───────────────────────────────────

export interface BalanceSheetReport {
  date: string;
  assets: { code: string; name: string; balance: number }[];
  liabilities: { code: string; name: string; balance: number }[];
  equity: { code: string; name: string; balance: number }[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

export interface ProfitLossReport {
  periodStart: string;
  periodEnd: string;
  revenue: { code: string; name: string; amount: number }[];
  expenses: { code: string; name: string; amount: number }[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

export async function getBalanceSheet(companyId: string): Promise<BalanceSheetReport> {
  const { resources: accounts } = await containers.ledger().items
    .query<Account>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND IS_DEFINED(c.code) AND IS_DEFINED(c.normalSide) AND c.isPostable = true AND c.balance != 0 ORDER BY c.code",
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();

  const assets = accounts
    .filter((a) => a.type === "asset")
    .map((a) => ({ code: a.code, name: a.name, balance: Math.abs(a.balance) }));
  const liabilities = accounts
    .filter((a) => a.type === "liability")
    .map((a) => ({ code: a.code, name: a.name, balance: Math.abs(a.balance) }));
  const equity = accounts
    .filter((a) => a.type === "equity")
    .map((a) => ({ code: a.code, name: a.name, balance: Math.abs(a.balance) }));

  // Add current year P&L to equity
  const revenueTotal = accounts
    .filter((a) => a.type === "revenue")
    .reduce((s, a) => s + Math.abs(a.balance), 0);
  const expenseTotal = accounts
    .filter((a) => a.type === "expense")
    .reduce((s, a) => s + Math.abs(a.balance), 0);
  const currentYearResult = roundCurrency(revenueTotal - expenseTotal);

  if (currentYearResult !== 0) {
    equity.push({ code: "3320", name: "Current year result", balance: currentYearResult });
  }

  return {
    date: new Date().toISOString().slice(0, 10),
    assets,
    liabilities,
    equity,
    totalAssets: roundCurrency(assets.reduce((s, a) => s + a.balance, 0)),
    totalLiabilities: roundCurrency(liabilities.reduce((s, a) => s + a.balance, 0)),
    totalEquity: roundCurrency(equity.reduce((s, a) => s + a.balance, 0)),
  };
}

export async function getProfitAndLoss(companyId: string): Promise<ProfitLossReport> {
  const { resources: accounts } = await containers.ledger().items
    .query<Account>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND IS_DEFINED(c.code) AND IS_DEFINED(c.normalSide) AND c.isPostable = true AND c.balance != 0 AND (c.type = 'revenue' OR c.type = 'expense') ORDER BY c.code",
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();

  const revenue = accounts
    .filter((a) => a.type === "revenue")
    .map((a) => ({ code: a.code, name: a.name, amount: Math.abs(a.balance) }));
  const expenses = accounts
    .filter((a) => a.type === "expense")
    .map((a) => ({ code: a.code, name: a.name, amount: Math.abs(a.balance) }));

  const totalRevenue = roundCurrency(revenue.reduce((s, r) => s + r.amount, 0));
  const totalExpenses = roundCurrency(expenses.reduce((s, e) => s + e.amount, 0));

  return {
    periodStart: `${new Date().getFullYear()}-01-01`,
    periodEnd: new Date().toISOString().slice(0, 10),
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    netProfit: roundCurrency(totalRevenue - totalExpenses),
  };
}
