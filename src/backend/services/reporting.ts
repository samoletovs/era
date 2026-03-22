import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import type { VatReturn, VatReturnLine, Invoice, Account, JournalEntry } from "@shared/types";

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
      query: "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'invoice' OR IS_DEFINED(c.invoiceNumber)) AND c.status != 'draft' AND c.status != 'cancelled' AND c.date >= @start AND c.date <= @end",
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
    docType: "vat-return" as const,
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
      query: "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'account' OR (IS_DEFINED(c.code) AND IS_DEFINED(c.normalSide))) AND c.isPostable = true AND c.balance != 0 ORDER BY c.code",
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

export async function getProfitAndLoss(companyId: string, from?: string, to?: string): Promise<ProfitLossReport> {
  const periodStart = from || `${new Date().getFullYear()}-01-01`;
  const periodEnd = to || new Date().toISOString().slice(0, 10);

  // Query posted journal entries within the period
  const { resources: entries } = await containers.ledger().items
    .query<any>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) AND c.status = 'posted' AND c.date >= @from AND c.date <= @to",
      parameters: [
        { name: "@cid", value: companyId },
        { name: "@from", value: periodStart },
        { name: "@to", value: periodEnd },
      ],
    })
    .fetchAll();

  // Aggregate by account code
  const accountTotals = new Map<string, { code: string; name: string; type: string; amount: number }>();

  for (const entry of entries) {
    for (const line of (entry.lines || [])) {
      const code = line.accountCode;
      if (!code) continue;

      // Determine if this is a revenue or expense account by code prefix
      let type = "";
      if (code.startsWith("5")) type = "revenue";
      else if (code.startsWith("6")) type = "expense";
      else continue; // skip non-P&L accounts

      const existing = accountTotals.get(code);
      const amount = type === "revenue" ? (line.credit - line.debit) : (line.debit - line.credit);

      if (existing) {
        existing.amount = roundCurrency(existing.amount + amount);
      } else {
        accountTotals.set(code, { code, name: line.accountName || code, type, amount: roundCurrency(amount) });
      }
    }
  }

  const revenue = Array.from(accountTotals.values())
    .filter((a) => a.type === "revenue" && a.amount !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));
  const expenses = Array.from(accountTotals.values())
    .filter((a) => a.type === "expense" && a.amount !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));

  const totalRevenue = roundCurrency(revenue.reduce((s, r) => s + r.amount, 0));
  const totalExpenses = roundCurrency(expenses.reduce((s, e) => s + e.amount, 0));

  return {
    periodStart,
    periodEnd,
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
      query: "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'invoice' OR IS_DEFINED(c.invoiceNumber)) AND c.status != 'draft' AND c.status != 'cancelled' AND c.date >= @start AND c.date <= @end",
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
      query: "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'account' OR (IS_DEFINED(c.code) AND IS_DEFINED(c.normalSide))) AND c.isPostable = true AND c.balance != 0 ORDER BY c.code",
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

// ─── AR/AP Aging Reports ────────────────────────────────────

export interface AgingBucket {
  contactId: string;
  contactName: string;
  current: number;
  days30: number;
  days60: number;
  days90plus: number;
  total: number;
}

export interface AgingReport {
  type: "ar" | "ap";
  date: string;
  buckets: AgingBucket[];
  totalCurrent: number;
  totalDays30: number;
  totalDays60: number;
  totalDays90plus: number;
  grandTotal: number;
}

export async function getAgingReport(companyId: string, type: "ar" | "ap"): Promise<AgingReport> {
  // Get all posted, unpaid/partially-paid invoices
  const invType = type === "ar" ? "sales" : "purchase";
  const { resources: invoices } = await containers.documents().items
    .query<Invoice>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'invoice' OR IS_DEFINED(c.invoiceNumber)) AND c.type = @type AND (c.status = 'posted' OR c.status = 'partially_paid' OR c.status = 'overdue')",
      parameters: [
        { name: "@cid", value: companyId },
        { name: "@type", value: invType },
      ],
    })
    .fetchAll();

  const today = new Date();
  const contactMap = new Map<string, AgingBucket>();

  for (const inv of invoices) {
    const outstanding = roundCurrency(inv.total - inv.amountPaid);
    if (outstanding <= 0) continue;

    const dueDate = new Date(inv.dueDate);
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    let bucket = contactMap.get(inv.contactId);
    if (!bucket) {
      bucket = { contactId: inv.contactId, contactName: inv.contactName, current: 0, days30: 0, days60: 0, days90plus: 0, total: 0 };
      contactMap.set(inv.contactId, bucket);
    }

    if (daysOverdue <= 0) bucket.current = roundCurrency(bucket.current + outstanding);
    else if (daysOverdue <= 30) bucket.days30 = roundCurrency(bucket.days30 + outstanding);
    else if (daysOverdue <= 60) bucket.days60 = roundCurrency(bucket.days60 + outstanding);
    else bucket.days90plus = roundCurrency(bucket.days90plus + outstanding);

    bucket.total = roundCurrency(bucket.total + outstanding);
  }

  const buckets = Array.from(contactMap.values()).sort((a, b) => b.total - a.total);
  return {
    type,
    date: today.toISOString().slice(0, 10),
    buckets,
    totalCurrent: roundCurrency(buckets.reduce((s, b) => s + b.current, 0)),
    totalDays30: roundCurrency(buckets.reduce((s, b) => s + b.days30, 0)),
    totalDays60: roundCurrency(buckets.reduce((s, b) => s + b.days60, 0)),
    totalDays90plus: roundCurrency(buckets.reduce((s, b) => s + b.days90plus, 0)),
    grandTotal: roundCurrency(buckets.reduce((s, b) => s + b.total, 0)),
  };
}

// ─── Mark Overdue Invoices ──────────────────────────────────

export async function markOverdueInvoices(companyId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { resources: invoices } = await containers.documents().items
    .query<Invoice>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'invoice' OR IS_DEFINED(c.invoiceNumber)) AND (c.status = 'posted' OR c.status = 'partially_paid') AND c.dueDate < @today",
      parameters: [
        { name: "@cid", value: companyId },
        { name: "@today", value: today },
      ],
    })
    .fetchAll();

  let count = 0;
  for (const inv of invoices) {
    if (inv.status !== "overdue") {
      inv.status = "overdue";
      inv.updatedAt = new Date().toISOString();
      await containers.documents().item(inv.id, companyId).replace(inv);
      count++;
    }
  }
  return count;
}
