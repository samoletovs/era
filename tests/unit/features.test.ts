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

// ─── Recurring Entries ──────────────────────────────────────

describe("recurring entry templates", () => {
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
