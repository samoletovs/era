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

// ─── VAT Declaration Export (VID-compatible) ────────────────

export interface VatDeclaration {
  companyName: string;
  registrationNumber: string;
  vatNumber: string;
  period: string;
  year: number;
  month: number;
  // PVN deklarācija fields
  outputVatStandard: number;      // 21% output VAT
  outputVatReduced: number;       // 12% output VAT
  outputVatSuperReduced: number;  // 5% output VAT
  taxableStandard: number;
  taxableReduced: number;
  taxableSuperReduced: number;
  totalOutputVat: number;
  totalInputVat: number;
  vatPayable: number;             // positive = owe VID, negative = refund
  lines: VatReturnLine[];
}

export async function generateVatDeclaration(
  companyId: string,
  year: number,
  month: number
): Promise<VatDeclaration> {
  const { resource: company } = await containers.companies()
    .item(companyId, companyId).read<any>();
  if (!company) throw new Error("Company not found");

  const period = `${year}-${String(month).padStart(2, "0")}`;
  const startDate = `${period}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${period}-${lastDay}`;

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

  const vatMap = new Map<string, VatReturnLine>();
  for (const inv of invoices) {
    for (const line of inv.lines) {
      const type = inv.type === "sales" ? "output" : "input";
      const key = `${type}-${line.vatRate}`;
      const net = roundCurrency(line.quantity * line.unitPrice);
      const existing = vatMap.get(key);
      if (existing) {
        existing.taxableAmount = roundCurrency(existing.taxableAmount + net);
        existing.vatAmount = roundCurrency(existing.vatAmount + line.vatAmount);
      } else {
        vatMap.set(key, { vatRate: line.vatRate, taxableAmount: net, vatAmount: line.vatAmount, type });
      }
    }
  }

  const lines = Array.from(vatMap.values());
  const get = (type: string, rate: number) => lines.find(l => l.type === type && l.vatRate === rate);

  return {
    companyName: company.name,
    registrationNumber: company.registrationNumber,
    vatNumber: company.vatNumber || "",
    period,
    year,
    month,
    taxableStandard: get("output", 21)?.taxableAmount ?? 0,
    taxableReduced: get("output", 12)?.taxableAmount ?? 0,
    taxableSuperReduced: get("output", 5)?.taxableAmount ?? 0,
    outputVatStandard: get("output", 21)?.vatAmount ?? 0,
    outputVatReduced: get("output", 12)?.vatAmount ?? 0,
    outputVatSuperReduced: get("output", 5)?.vatAmount ?? 0,
    totalOutputVat: roundCurrency(lines.filter(l => l.type === "output").reduce((s, l) => s + l.vatAmount, 0)),
    totalInputVat: roundCurrency(lines.filter(l => l.type === "input").reduce((s, l) => s + l.vatAmount, 0)),
    vatPayable: roundCurrency(
      lines.filter(l => l.type === "output").reduce((s, l) => s + l.vatAmount, 0) -
      lines.filter(l => l.type === "input").reduce((s, l) => s + l.vatAmount, 0)
    ),
    lines,
  };
}

// ─── Annual Financial Statements (Latvian format) ───────────

export interface AnnualReport {
  companyName: string;
  registrationNumber: string;
  fiscalYear: number;
  periodStart: string;
  periodEnd: string;
  balanceSheet: BalanceSheetReport;
  profitAndLoss: ProfitLossReport;
  // Latvian format groupings
  balanceSheetLv: {
    longTermAssets: number;
    currentAssets: number;
    totalAssets: number;
    equity: number;
    longTermLiabilities: number;
    currentLiabilities: number;
    totalEquityAndLiabilities: number;
  };
  profitAndLossLv: {
    netTurnover: number;
    costOfGoodsSold: number;
    grossProfit: number;
    sellingExpenses: number;
    administrativeExpenses: number;
    otherIncome: number;
    financialExpenses: number;
    profitBeforeTax: number;
    corporateIncomeTax: number;
    netProfit: number;
  };
}

export async function generateAnnualReport(companyId: string, fiscalYear: number): Promise<AnnualReport> {
  const { resource: company } = await containers.companies()
    .item(companyId, companyId).read<any>();
  if (!company) throw new Error("Company not found");

  const bs = await getBalanceSheet(companyId);
  const pl = await getProfitAndLoss(companyId);

  // Group accounts by Latvian CoA classes for annual report
  const { resources: allAccounts } = await containers.ledger().items
    .query<Account>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND IS_DEFINED(c.code) AND IS_DEFINED(c.normalSide) AND c.isPostable = true AND c.balance != 0 ORDER BY c.code",
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();

  const sumByCodeRange = (from: string, to: string): number =>
    roundCurrency(allAccounts.filter(a => a.code >= from && a.code <= to).reduce((s, a) => s + Math.abs(a.balance), 0));

  return {
    companyName: company.name,
    registrationNumber: company.registrationNumber,
    fiscalYear,
    periodStart: `${fiscalYear}-01-01`,
    periodEnd: `${fiscalYear}-12-31`,
    balanceSheet: bs,
    profitAndLoss: pl,
    balanceSheetLv: {
      longTermAssets: sumByCodeRange("1000", "1999"),
      currentAssets: sumByCodeRange("2000", "2999"),
      totalAssets: bs.totalAssets,
      equity: sumByCodeRange("3000", "3999") + (pl.netProfit || 0),
      longTermLiabilities: sumByCodeRange("4100", "4199"),
      currentLiabilities: sumByCodeRange("4200", "4999"),
      totalEquityAndLiabilities: bs.totalLiabilities + bs.totalEquity,
    },
    profitAndLossLv: {
      netTurnover: sumByCodeRange("5100", "5199"),
      costOfGoodsSold: sumByCodeRange("6100", "6199"),
      grossProfit: roundCurrency(sumByCodeRange("5100", "5199") - sumByCodeRange("6100", "6199")),
      sellingExpenses: sumByCodeRange("6200", "6299"),
      administrativeExpenses: sumByCodeRange("6300", "6399"),
      otherIncome: sumByCodeRange("5200", "5299"),
      financialExpenses: sumByCodeRange("6400", "6499"),
      profitBeforeTax: pl.netProfit,
      corporateIncomeTax: sumByCodeRange("6500", "6599"),
      netProfit: roundCurrency(pl.netProfit - sumByCodeRange("6500", "6599")),
    },
  };
}
