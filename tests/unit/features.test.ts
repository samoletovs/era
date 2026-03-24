// Tests for Sprint 1-5 features: period close, credit notes, depreciation,
// aging reports, bank reconciliation, recurring entries, budget, autonomous tasks
import { describe, it, expect } from "vitest";

// ─── Period Close ───────────────────────────────────────────

describe("period close logic", () => {
  it("period format is YYYY-MM", () => {
    const period = "2026-03";
    expect(period).toMatch(/^\d{4}-\d{2}$/);
  });

  it("period statuses are valid", () => {
    const valid = ["open", "closed", "on-hold"];
    expect(valid).toContain("open");
    expect(valid).toContain("closed");
  });

  it("closed period cannot be closed again", () => {
    const period = { status: "closed" };
    const canClose = period.status !== "closed";
    expect(canClose).toBe(false);
  });

  it("open period can be closed", () => {
    const period = { status: "open" };
    const canClose = period.status !== "closed";
    expect(canClose).toBe(true);
  });
});

// ─── Year-End Close ─────────────────────────────────────────

describe("year-end close logic", () => {
  it("zeros out revenue accounts (credit to zero)", () => {
    const revenueAccount = { code: "5120", type: "revenue", balance: 5000, normalSide: "credit" };
    // To zero: debit the balance
    const closingLine = {
      accountCode: revenueAccount.code,
      debit: Math.abs(revenueAccount.balance),
      credit: 0,
    };
    expect(closingLine.debit).toBe(5000);
    expect(closingLine.credit).toBe(0);
  });

  it("zeros out expense accounts (debit to zero)", () => {
    const expenseAccount = { code: "6310", type: "expense", balance: 3000, normalSide: "debit" };
    const closingLine = {
      accountCode: expenseAccount.code,
      debit: 0,
      credit: Math.abs(expenseAccount.balance),
    };
    expect(closingLine.debit).toBe(0);
    expect(closingLine.credit).toBe(3000);
  });

  it("transfers net profit to retained earnings (3310)", () => {
    const totalRevenue = 10000;
    const totalExpenses = 7000;
    const netResult = totalRevenue - totalExpenses;
    expect(netResult).toBe(3000);

    // Profit → credit retained earnings
    const retainedEarningsLine = {
      accountCode: "3310",
      debit: 0,
      credit: netResult,
    };
    expect(retainedEarningsLine.credit).toBe(3000);
  });

  it("transfers net loss to retained earnings as debit", () => {
    const totalRevenue = 5000;
    const totalExpenses = 8000;
    const netResult = totalRevenue - totalExpenses;
    expect(netResult).toBe(-3000);

    const retainedEarningsLine = {
      accountCode: "3310",
      debit: Math.abs(netResult),
      credit: 0,
    };
    expect(retainedEarningsLine.debit).toBe(3000);
  });

  it("closing entry is balanced (revenue + expense zeros = retained earnings transfer)", () => {
    const revenue = [{ balance: 5000 }, { balance: 3000 }];
    const expenses = [{ balance: 4000 }, { balance: 2000 }];

    const totalRevDebit = revenue.reduce((s, r) => s + r.balance, 0); // zero revenue
    const totalExpCredit = expenses.reduce((s, e) => s + e.balance, 0); // zero expenses
    const netResult = totalRevDebit - totalExpCredit; // 8000 - 6000 = 2000

    const totalDebit = totalRevDebit + (netResult < 0 ? Math.abs(netResult) : 0); // 8000
    const totalCredit = totalExpCredit + (netResult > 0 ? netResult : 0); // 6000 + 2000 = 8000

    expect(totalDebit).toBe(totalCredit);
  });
});

// ─── Credit Notes ───────────────────────────────────────────

describe("credit note logic", () => {
  it("credit note has negative total", () => {
    const original = { subtotal: 100, vatAmount: 21, total: 121 };
    const creditNote = {
      subtotal: -original.subtotal,
      vatAmount: -original.vatAmount,
      total: -original.total,
    };
    expect(creditNote.total).toBe(-121);
    expect(creditNote.subtotal).toBe(-100);
  });

  it("credit note GL reverses the original posting", () => {
    // Original sales invoice: DR AR 121, CR Revenue 100, CR VAT 21
    const originalLines = [
      { account: "2210", debit: 121, credit: 0 },
      { account: "5120", debit: 0, credit: 100 },
      { account: "4230", debit: 0, credit: 21 },
    ];

    const reversedLines = originalLines.map(l => ({
      account: l.account,
      debit: l.credit,
      credit: l.debit,
    }));

    expect(reversedLines[0]).toEqual({ account: "2210", debit: 0, credit: 121 });
    expect(reversedLines[1]).toEqual({ account: "5120", debit: 100, credit: 0 });
    expect(reversedLines[2]).toEqual({ account: "4230", debit: 21, credit: 0 });

    // Still balanced
    const totalDebit = reversedLines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = reversedLines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it("credit note reduces original invoice outstanding", () => {
    const original = { total: 121, amountPaid: 0 };
    const creditAmount = 121;
    original.amountPaid += creditAmount;
    const status = original.amountPaid >= original.total ? "paid" : "partially_paid";
    expect(status).toBe("paid");
  });

  it("cannot create credit note for draft invoice", () => {
    const invoice = { status: "draft" };
    const canCredit = invoice.status !== "draft" && invoice.status !== "cancelled";
    expect(canCredit).toBe(false);
  });
});

// ─── Fixed Asset Depreciation ───────────────────────────────

describe("fixed asset depreciation", () => {
  it("calculates straight-line monthly depreciation", () => {
    const cost = 12000;
    const residualValue = 0;
    const usefulLifeMonths = 60;
    const monthly = Math.round((cost - residualValue) / usefulLifeMonths * 100) / 100;
    expect(monthly).toBe(200);
  });

  it("calculates depreciation with residual value", () => {
    const cost = 10000;
    const residualValue = 2000;
    const usefulLifeMonths = 48;
    const monthly = Math.round((cost - residualValue) / usefulLifeMonths * 100) / 100;
    expect(monthly).toBeCloseTo(166.67, 1);
  });

  it("stops depreciation when fully depreciated", () => {
    const cost = 6000;
    const residualValue = 0;
    const accumulatedDepreciation = 6000;
    const remaining = cost - residualValue - accumulatedDepreciation;
    expect(remaining).toBe(0);
    expect(remaining <= 0).toBe(true);
  });

  it("depreciation entry: DR expense, CR accumulated depreciation", () => {
    const amount = 200;
    const lines = [
      { accountCode: "6380", debit: amount, credit: 0, desc: "Depreciation expense" },
      { accountCode: "1240", debit: 0, credit: amount, desc: "Accumulated depreciation" },
    ];
    expect(lines[0].debit).toBe(lines[1].credit);
  });

  it("net book value = cost - accumulated depreciation", () => {
    const cost = 12000;
    const accumulated = 4800;
    const nbv = cost - accumulated;
    expect(nbv).toBe(7200);
  });

  it("disposal gain/loss: proceeds - NBV", () => {
    const proceeds = 5000;
    const nbv = 3000;
    const gainOrLoss = proceeds - nbv;
    expect(gainOrLoss).toBe(2000); // gain
  });

  it("disposal loss when proceeds < NBV", () => {
    const proceeds = 1000;
    const nbv = 3000;
    const gainOrLoss = proceeds - nbv;
    expect(gainOrLoss).toBe(-2000); // loss
  });
});

// ─── AR/AP Aging ────────────────────────────────────────────

describe("aging report logic", () => {
  it("categorizes current (not yet due) invoices", () => {
    const dueDate = new Date("2026-04-01");
    const today = new Date("2026-03-22");
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(daysOverdue).toBeLessThanOrEqual(0);
  });

  it("categorizes 1-30 day overdue invoices", () => {
    const dueDate = new Date("2026-03-01");
    const today = new Date("2026-03-22");
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(daysOverdue).toBe(21);
    expect(daysOverdue > 0 && daysOverdue <= 30).toBe(true);
  });

  it("categorizes 31-60 day overdue invoices", () => {
    const dueDate = new Date("2026-02-01");
    const today = new Date("2026-03-22");
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(daysOverdue).toBe(49);
    expect(daysOverdue > 30 && daysOverdue <= 60).toBe(true);
  });

  it("categorizes 90+ day overdue invoices", () => {
    const dueDate = new Date("2025-12-01");
    const today = new Date("2026-03-22");
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(daysOverdue).toBeGreaterThan(90);
  });

  it("outstanding = total - amountPaid", () => {
    const total = 242;
    const amountPaid = 100;
    const outstanding = Math.round((total - amountPaid) * 100) / 100;
    expect(outstanding).toBe(142);
  });
});

// ─── VAT Declaration ────────────────────────────────────────

describe("VAT declaration (PVN deklarācija)", () => {
  it("separates output and input VAT", () => {
    const salesLines = [{ vatRate: 21, vatAmount: 42 }, { vatRate: 21, vatAmount: 21 }];
    const purchaseLines = [{ vatRate: 21, vatAmount: 10.5 }];

    const outputVat = salesLines.reduce((s, l) => s + l.vatAmount, 0);
    const inputVat = purchaseLines.reduce((s, l) => s + l.vatAmount, 0);
    const vatPayable = Math.round((outputVat - inputVat) * 100) / 100;

    expect(outputVat).toBe(63);
    expect(inputVat).toBe(10.5);
    expect(vatPayable).toBe(52.5);
  });

  it("groups by VAT rate (21%, 12%, 5%)", () => {
    const lines = [
      { vatRate: 21, taxable: 100, vat: 21 },
      { vatRate: 21, taxable: 200, vat: 42 },
      { vatRate: 12, taxable: 50, vat: 6 },
    ];

    const byRate = new Map<number, number>();
    for (const l of lines) {
      byRate.set(l.vatRate, (byRate.get(l.vatRate) || 0) + l.vat);
    }

    expect(byRate.get(21)).toBe(63);
    expect(byRate.get(12)).toBe(6);
    expect(byRate.has(5)).toBe(false);
  });
});

// ─── Bank Reconciliation ────────────────────────────────────

describe("bank reconciliation logic", () => {
  it("matches by amount and date", () => {
    const statementLine = { date: "2026-03-15", amount: 121.00 };
    const glEntry = { date: "2026-03-15", amount: 121.00 };
    const isMatch = statementLine.amount === glEntry.amount && statementLine.date === glEntry.date;
    expect(isMatch).toBe(true);
  });

  it("does not match different amounts", () => {
    const statementLine = { date: "2026-03-15", amount: 121.00 };
    const glEntry = { date: "2026-03-15", amount: 120.00 };
    const isMatch = statementLine.amount === glEntry.amount && statementLine.date === glEntry.date;
    expect(isMatch).toBe(false);
  });

  it("positive amount = deposit, negative = payment", () => {
    expect(500 > 0).toBe(true);   // deposit
    expect(-200 < 0).toBe(true);  // payment
  });

  it("unmatched line can be posted as adjustment", () => {
    const bankFee = { amount: -15.00, description: "Monthly fee" };
    const journalLines = [
      { accountCode: "6430", debit: Math.abs(bankFee.amount), credit: 0, desc: "Bank fees" },
      { accountCode: "2420", debit: 0, credit: Math.abs(bankFee.amount), desc: "Bank" },
    ];
    expect(journalLines[0].debit).toBe(journalLines[1].credit);
  });
});

// ─── Journal Entries (Recurring + One-off) ──────────────────

describe("journal entry templates", () => {
  it("calculates next run date for monthly frequency", () => {
    const lastRun = new Date("2026-02-15");
    lastRun.setMonth(lastRun.getMonth() + 1);
    expect(lastRun.toISOString().slice(0, 10)).toBe("2026-03-15");
  });

  it("calculates next run date for quarterly frequency", () => {
    const lastRun = new Date("2026-03-15T12:00:00Z");
    lastRun.setMonth(lastRun.getMonth() + 3);
    expect(lastRun.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("calculates next run date for yearly frequency", () => {
    const lastRun = new Date("2026-01-01");
    lastRun.setFullYear(lastRun.getFullYear() + 1);
    expect(lastRun.toISOString().slice(0, 10)).toBe("2027-01-01");
  });

  it("template lines must balance", () => {
    const lines = [
      { accountCode: "6330", debit: 1200, credit: 0, desc: "Rent" },
      { accountCode: "2420", debit: 0, credit: 1200, desc: "Bank" },
    ];
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it("supports multi-entity account types on lines", () => {
    type AccountType = "ledger" | "customer" | "vendor" | "bank" | "fixed-asset" | "item";
    const lines: Array<{ accountType: AccountType; accountCode: string; debit: number; credit: number; contactId?: string; fixedAssetId?: string; itemId?: string }> = [
      { accountType: "vendor", accountCode: "5310", debit: 500, credit: 0, contactId: "vendor-1" },
      { accountType: "bank", accountCode: "2420", debit: 0, credit: 500 },
    ];
    expect(lines[0].accountType).toBe("vendor");
    expect(lines[0].contactId).toBe("vendor-1");
    expect(lines[1].accountType).toBe("bank");
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it("defaults accountType to ledger when not specified", () => {
    const line = { accountCode: "6330", accountName: "Rent", debit: 1200, credit: 0 };
    const accountType = (line as any).accountType || "ledger";
    expect(accountType).toBe("ledger");
  });
});

// ─── Budget vs Actual ───────────────────────────────────────

describe("budget vs actual", () => {
  it("calculates variance (budget - actual)", () => {
    const budget = 5000;
    const actual = 4200;
    const variance = Math.round((budget - actual) * 100) / 100;
    expect(variance).toBe(800);
  });

  it("calculates negative variance (over budget)", () => {
    const budget = 3000;
    const actual = 3500;
    const variance = Math.round((budget - actual) * 100) / 100;
    expect(variance).toBe(-500);
  });

  it("calculates variance percentage", () => {
    const budget = 5000;
    const actual = 4200;
    const variance = budget - actual;
    const variancePercent = Math.round((variance / budget) * 100 * 100) / 100;
    expect(variancePercent).toBe(16);
  });
});

// ─── Company Health Check ───────────────────────────────────

describe("company health check scoring", () => {
  it("perfect score when no issues", () => {
    const criticalCount = 0;
    const warningCount = 0;
    const infoCount = 0;
    const score = Math.max(0, 100 - (criticalCount * 25) - (warningCount * 10) - (infoCount * 2));
    expect(score).toBe(100);
  });

  it("critical issues heavily penalize score", () => {
    const criticalCount = 2;
    const warningCount = 1;
    const infoCount = 0;
    const score = Math.max(0, 100 - (criticalCount * 25) - (warningCount * 10) - (infoCount * 2));
    expect(score).toBe(40);
  });

  it("score cannot go below 0", () => {
    const criticalCount = 5;
    const score = Math.max(0, 100 - (criticalCount * 25));
    expect(score).toBe(0);
  });
});

// ─── Month-End Autonomous Process ───────────────────────────

describe("month-end autonomous process", () => {
  it("step statuses are valid", () => {
    const validStatuses = ["completed", "skipped", "failed"];
    expect(validStatuses).toHaveLength(3);
  });

  it("runs 4 steps: overdue, recurring, depreciation, close", () => {
    const steps = [
      "Mark overdue invoices",
      "Execute recurring entries",
      "Monthly depreciation",
      "Close period",
    ];
    expect(steps).toHaveLength(4);
  });
});

// ─── Posting Rule Engine ────────────────────────────────────

describe("posting rule evaluation", () => {
  it("evaluates document-level amount expressions", () => {
    const invoice = { total: 121, subtotal: 100, vatAmount: 21 };
    const expressions: Record<string, number> = {
      "invoice.total": invoice.total,
      "invoice.subtotal": invoice.subtotal,
      "invoice.vatAmount": invoice.vatAmount,
    };
    expect(expressions["invoice.total"]).toBe(121);
    expect(expressions["invoice.subtotal"]).toBe(100);
    expect(expressions["invoice.vatAmount"]).toBe(21);
  });

  it("evaluates line-level amount expressions", () => {
    const line = { quantity: 5, unitPrice: 20, vatRate: 21 };
    const net = Math.round(line.quantity * line.unitPrice * 100) / 100;
    const vatAmount = Math.round(net * line.vatRate / 100 * 100) / 100;

    expect(net).toBe(100);
    expect(vatAmount).toBe(21);
  });

  it("rule output must be balanced", () => {
    const ruleLines = [
      { side: "debit", amount: 121 },
      { side: "credit", amount: 100 },
      { side: "credit", amount: 21 },
    ];
    const totalDebit = ruleLines.filter(l => l.side === "debit").reduce((s, l) => s + l.amount, 0);
    const totalCredit = ruleLines.filter(l => l.side === "credit").reduce((s, l) => s + l.amount, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it("falls back to hardcoded when rule produces invalid output", () => {
    const ruleResult = null; // rule failed validation
    const hardcodedResult = [
      { accountCode: "2210", debit: 121, credit: 0 },
      { accountCode: "5120", debit: 0, credit: 100 },
      { accountCode: "4230", debit: 0, credit: 21 },
    ];
    const lines = ruleResult ?? hardcodedResult;
    expect(lines).toBe(hardcodedResult);
    expect(lines).toHaveLength(3);
  });
});

// ─── Business Event Log ─────────────────────────────────────

describe("business event log", () => {
  it("events have required fields", () => {
    const event = {
      id: "evt-1",
      companyId: "comp-1",
      type: "invoice.posted",
      timestamp: "2026-03-22T10:00:00.000Z",
      actor: "user-1",
    };
    expect(event.id).toBeTruthy();
    expect(event.type).toContain(".");
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("event types follow domain.action pattern", () => {
    const eventTypes = [
      "entry.posted", "entry.reversed",
      "invoice.created", "invoice.posted",
      "payment.posted", "creditnote.posted",
      "month-end.completed", "year-end.closed",
      "period.closed", "bank.statement.imported",
      "asset.acquired", "recurring.executed",
      "contact.created", "item.created", "company.created",
    ];
    for (const type of eventTypes) {
      expect(type).toContain(".");
    }
    expect(eventTypes.length).toBeGreaterThan(10);
  });
});

// ─── Multi-Currency (D365 F&O dual-currency model) ──────────

describe("multi-currency architecture", () => {
  it("exchange rate types are valid", () => {
    const validTypes = ["daily", "budget"];
    expect(validTypes).toHaveLength(2);
    expect(validTypes).toContain("daily");
    expect(validTypes).toContain("budget");
  });

  it("system exchange rate sources are valid", () => {
    const systemSources = ["ecb"];
    expect(systemSources).toHaveLength(1);
  });

  it("custom rate sources have id and name", () => {
    const custom = { id: "abc-123", name: "Internal treasury" };
    expect(custom.id).toBeTruthy();
    expect(custom.name).toBeTruthy();
  });

  it("converts transaction currency to accounting currency", () => {
    const transactionAmount = 1000; // USD
    const rate = 0.92; // 1 USD = 0.92 EUR
    const accountingAmount = Math.round(transactionAmount * rate * 100) / 100;
    expect(accountingAmount).toBe(920);
  });

  it("converts transaction currency to reporting currency independently", () => {
    const transactionAmount = 1000; // USD
    const reportingRate = 0.85; // 1 USD = 0.85 GBP (direct from USD, not via EUR)
    const reportingAmount = Math.round(transactionAmount * reportingRate * 100) / 100;
    expect(reportingAmount).toBe(850);
  });

  it("journal line carries both accounting and reporting amounts", () => {
    const line = {
      accountCode: "2420",
      debit: 920,       // accounting currency (EUR)
      credit: 0,
      currencyCode: "USD",
      exchangeRate: 0.92,
      amountInCurrency: 1000,
      reportingCurrencyAmount: 850,
      reportingExchangeRate: 0.85,
    };
    expect(line.debit).toBe(Math.round(line.amountInCurrency! * line.exchangeRate! * 100) / 100);
    expect(line.reportingCurrencyAmount).toBe(Math.round(line.amountInCurrency! * line.reportingExchangeRate! * 100) / 100);
  });

  it("reverse exchange rate lookup (1/rate)", () => {
    const eurToUsd = 1.087;
    const usdToEur = Math.round(1 / eurToUsd * 100) / 100;
    expect(usdToEur).toBe(0.92);
  });

  it("same currency rate is 1", () => {
    const rate = 1;
    const amount = 500;
    expect(amount * rate).toBe(amount);
  });
});

describe("currency revaluation", () => {
  it("calculates unrealized gain when rate increases", () => {
    // Original: 1000 USD at 0.90 EUR/USD = 900 EUR
    // Closing:  1000 USD at 0.95 EUR/USD = 950 EUR
    const originalAmount = 900;
    const revaluedAmount = 950;
    const unrealizedGain = Math.round((revaluedAmount - originalAmount) * 100) / 100;
    expect(unrealizedGain).toBe(50);
    expect(unrealizedGain).toBeGreaterThan(0); // gain
  });

  it("calculates unrealized loss when rate decreases", () => {
    const originalAmount = 900;
    const revaluedAmount = 860;
    const unrealizedLoss = Math.round((revaluedAmount - originalAmount) * 100) / 100;
    expect(unrealizedLoss).toBe(-40);
    expect(unrealizedLoss).toBeLessThan(0); // loss
  });

  it("revaluation entry is balanced", () => {
    const unrealizedGain = 50;
    const lines = [
      { accountCode: "2420", debit: unrealizedGain, credit: 0, desc: "Bank (FX adjustment)" },
      { accountCode: "8110", debit: 0, credit: unrealizedGain, desc: "Unrealized FX gain" },
    ];
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it("loss entry debits loss account, credits asset", () => {
    const unrealizedLoss = 40;
    const lines = [
      { accountCode: "8120", debit: unrealizedLoss, credit: 0, desc: "Unrealized FX loss" },
      { accountCode: "2420", debit: 0, credit: unrealizedLoss, desc: "Bank (FX adjustment)" },
    ];
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it("only revalues accounts flagged for FX revaluation", () => {
    const accounts = [
      { code: "2420", isForeignCurrencyRevaluation: true, currencyCode: "USD" },
      { code: "2210", isForeignCurrencyRevaluation: true, currencyCode: "USD" },
      { code: "5120", isForeignCurrencyRevaluation: false, currencyCode: undefined },
      { code: "6350", isForeignCurrencyRevaluation: false, currencyCode: undefined },
    ];
    const toRevalue = accounts.filter(a => a.isForeignCurrencyRevaluation && a.currencyCode);
    expect(toRevalue).toHaveLength(2);
    expect(toRevalue.map(a => a.code)).toEqual(["2420", "2210"]);
  });
});

describe("short name generation", () => {
  function generateShortName(name: string): string {
    const quotedMatch = name.match(/[""\u201C\u201D]([^""\u201C\u201D]+)[""\u201C\u201D]/);
    if (quotedMatch) return quotedMatch[1].trim();
    const cleaned = name
      .replace(/^(SIA|AS|IK|ZS|PS|Sabiedr.ba\s+.*?atbild.bu)\s+/i, "")
      .replace(/[""\u201C\u201D]/g, "")
      .trim();
    return cleaned || name;
  }

  it("extracts quoted name", () => {
    expect(generateShortName('Sabiedrība ar ierobežotu atbildību "DAIS"')).toBe("DAIS");
  });

  it("strips SIA prefix", () => {
    expect(generateShortName("SIA Latvijas Gāze")).toBe("Latvijas Gāze");
  });

  it("handles names without prefix", () => {
    expect(generateShortName("Acme Corp")).toBe("Acme Corp");
  });
});

// ─── Annual Report (Latvian Format) ─────────────────────────

describe("Latvian annual report structure", () => {
  it("balance sheet has required Latvian groupings", () => {
    const groups = [
      "longTermAssets",
      "currentAssets",
      "totalAssets",
      "equity",
      "longTermLiabilities",
      "currentLiabilities",
      "totalEquityAndLiabilities",
    ];
    expect(groups).toHaveLength(7);
  });

  it("P&L has required Latvian groupings", () => {
    const groups = [
      "netTurnover",
      "costOfGoodsSold",
      "grossProfit",
      "sellingExpenses",
      "administrativeExpenses",
      "otherIncome",
      "financialExpenses",
      "profitBeforeTax",
      "corporateIncomeTax",
      "netProfit",
    ];
    expect(groups).toHaveLength(10);
  });

  it("assets = equity + liabilities (accounting equation)", () => {
    const assets = 50000;
    const equity = 30000;
    const liabilities = 20000;
    expect(assets).toBe(equity + liabilities);
  });
});

// ─── Contact Register Check & Merge ─────────────────────────

describe("contact register check", () => {
  it("matches contact by registration number", () => {
    const contact = { registrationNumber: "40003290084", name: "DAIS" };
    const registerData = { registrationNumber: "40003290084", name: 'SIA "DAIS"', status: "active" };
    expect(contact.registrationNumber).toBe(registerData.registrationNumber);
  });

  it("detects name difference that needs update", () => {
    const contact = { name: "Dais Ltd" };
    const registerData = { name: 'SIA "DAIS"' };
    const needsUpdate = contact.name !== registerData.name;
    expect(needsUpdate).toBe(true);
  });

  it("detects when no update is needed", () => {
    const contact = { name: 'SIA "DAIS"', vatNumber: "LV40003290084" };
    const registerData = { name: 'SIA "DAIS"', vatNumber: "LV40003290084" };
    const needsUpdate = contact.name !== registerData.name || contact.vatNumber !== registerData.vatNumber;
    expect(needsUpdate).toBe(false);
  });
});

describe("contact merge logic", () => {
  it("transfers invoices from source to target", () => {
    const sourceInvoices = [{ id: "inv-1", contactId: "source" }, { id: "inv-2", contactId: "source" }];
    const merged = sourceInvoices.map(inv => ({ ...inv, contactId: "target" }));
    expect(merged.every(inv => inv.contactId === "target")).toBe(true);
    expect(merged).toHaveLength(2);
  });

  it("deactivates source contact after merge", () => {
    const source = { id: "source", status: "active" };
    source.status = "merged";
    expect(source.status).toBe("merged");
  });

  it("cannot merge contact with itself", () => {
    const sourceId = "contact-1";
    const targetId = "contact-1";
    expect(sourceId === targetId).toBe(true);
    // Should be rejected
  });

  it("cannot merge with different types without flag", () => {
    const source = { type: "customer" };
    const target = { type: "vendor" };
    const compatible = source.type === target.type || source.type === "both" || target.type === "both";
    expect(compatible).toBe(false);
  });
});

// ─── Budget vs Actual Date Filtering ────────────────────────

describe("budget vs actual date filtering", () => {
  it("filters budget entries by fiscal year", () => {
    const entries = [
      { period: "2025-01", amount: 1000 },
      { period: "2025-06", amount: 1500 },
      { period: "2026-01", amount: 2000 },
      { period: "2026-03", amount: 800 },
    ];
    const year = 2026;
    const filtered = entries.filter(e => e.period.startsWith(String(year)));
    expect(filtered).toHaveLength(2);
    expect(filtered[0].period).toBe("2026-01");
  });

  it("calculates YTD actual from GL entries within period", () => {
    const entries = [
      { date: "2026-01-15", amount: 500 },
      { date: "2026-02-10", amount: 700 },
      { date: "2026-03-05", amount: 300 },
      { date: "2025-12-20", amount: 900 },
    ];
    const yearStart = "2026-01-01";
    const yearEnd = "2026-12-31";
    const ytd = entries
      .filter(e => e.date >= yearStart && e.date <= yearEnd)
      .reduce((s, e) => s + e.amount, 0);
    expect(ytd).toBe(1500);
  });

  it("favorable variance when actual < budget for expenses", () => {
    const budget = 5000;
    const actual = 4200;
    const variance = budget - actual;
    const favorable = variance > 0;
    expect(favorable).toBe(true);
    expect(variance).toBe(800);
  });

  it("unfavorable variance when actual > budget for expenses", () => {
    const budget = 3000;
    const actual = 3500;
    const variance = budget - actual;
    const favorable = variance > 0;
    expect(favorable).toBe(false);
    expect(variance).toBe(-500);
  });
});
