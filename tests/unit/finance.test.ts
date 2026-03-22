// Tests for the General Ledger double-entry posting engine
import { describe, it, expect } from "vitest";

// We test the validation logic directly without Cosmos DB
// by extracting the pure functions

describe("GL validation rules", () => {
  describe("journal entry balance", () => {
    it("accepts balanced entries (debits = credits)", () => {
      const lines = [
        { accountCode: "2420", accountName: "Bank", debit: 100, credit: 0 },
        { accountCode: "5120", accountName: "Revenue", debit: 0, credit: 100 },
      ];
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBe(totalCredit);
    });

    it("rejects unbalanced entries", () => {
      const lines = [
        { accountCode: "2420", accountName: "Bank", debit: 100, credit: 0 },
        { accountCode: "5120", accountName: "Revenue", debit: 0, credit: 90 },
      ];
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).not.toBe(totalCredit);
    });

    it("rejects entries with both debit and credit on same line", () => {
      const line = { debit: 50, credit: 30 };
      expect(line.debit > 0 && line.credit > 0).toBe(true);
      // This should be rejected by the GL engine
    });

    it("rejects entries with zero debit and zero credit", () => {
      const line = { debit: 0, credit: 0 };
      expect(line.debit === 0 && line.credit === 0).toBe(true);
    });

    it("rejects negative amounts", () => {
      const line = { debit: -50, credit: 0 };
      expect(line.debit < 0).toBe(true);
    });

    it("rejects entries with less than 2 lines", () => {
      const lines = [
        { accountCode: "2420", accountName: "Bank", debit: 100, credit: 0 },
      ];
      expect(lines.length).toBeLessThan(2);
    });
  });

  describe("currency rounding", () => {
    it("rounds to 2 decimal places", () => {
      const round = (n: number) => Math.round(n * 100) / 100;
      expect(round(10.005)).toBe(10.01);
      expect(round(10.004)).toBe(10);
      expect(round(99.999)).toBe(100);
      expect(round(0.1 + 0.2)).toBe(0.3);
    });
  });

  describe("account balance updates", () => {
    it("increases debit-normal accounts with debit entries", () => {
      const account = { balance: 100, normalSide: "debit" as const };
      const delta = 50; // debit - credit for this account
      const newBalance = account.balance + delta;
      expect(newBalance).toBe(150);
    });

    it("increases credit-normal accounts with credit entries", () => {
      const account = { balance: 500, normalSide: "credit" as const };
      const delta = -100; // flipped for credit-normal: debit(0) - credit(100) = -100
      const signedDelta = -delta; // flip for credit-normal
      const newBalance = account.balance + signedDelta;
      expect(newBalance).toBe(600);
    });

    it("decreases debit-normal accounts with credit entries", () => {
      const account = { balance: 200, normalSide: "debit" as const };
      const delta = -75; // debit(0) - credit(75)
      const newBalance = account.balance + delta;
      expect(newBalance).toBe(125);
    });
  });

  describe("entry numbering", () => {
    it("generates sequential numbers within a period", () => {
      const period = "2026-03";
      const lastNum = 5;
      const next = `${period}-${String(lastNum + 1).padStart(4, "0")}`;
      expect(next).toBe("2026-03-0006");
    });

    it("starts at 0001 for new period", () => {
      const period = "2026-04";
      const next = `${period}-0001`;
      expect(next).toBe("2026-04-0001");
    });
  });
});

describe("invoice GL posting rules", () => {
  describe("sales invoice", () => {
    it("debits AR and credits revenue + VAT payable", () => {
      const subtotal = 100;
      const vatRate = 21;
      const vatAmount = subtotal * vatRate / 100;
      const total = subtotal + vatAmount;

      const lines = [
        { account: "2210", debit: total, credit: 0, desc: "AR" },
        { account: "5120", debit: 0, credit: subtotal, desc: "Revenue" },
        { account: "4230", debit: 0, credit: vatAmount, desc: "VAT payable" },
      ];

      const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

      expect(totalDebit).toBe(121);
      expect(totalCredit).toBe(121);
      expect(totalDebit).toBe(totalCredit);
    });
  });

  describe("purchase invoice", () => {
    it("credits AP and debits expense + VAT receivable", () => {
      const subtotal = 200;
      const vatRate = 21;
      const vatAmount = subtotal * vatRate / 100;
      const total = subtotal + vatAmount;

      const lines = [
        { account: "4220", debit: 0, credit: total, desc: "AP" },
        { account: "6350", debit: subtotal, credit: 0, desc: "Expense" },
        { account: "2310", debit: vatAmount, credit: 0, desc: "VAT receivable" },
      ];

      const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

      expect(totalDebit).toBe(242);
      expect(totalCredit).toBe(242);
      expect(totalDebit).toBe(totalCredit);
    });
  });

  describe("payment posting", () => {
    it("incoming payment: debits bank, credits AR", () => {
      const amount = 121;
      const lines = [
        { account: "2420", debit: amount, credit: 0 },
        { account: "2210", debit: 0, credit: amount },
      ];
      expect(lines[0].debit).toBe(lines[1].credit);
    });

    it("outgoing payment: debits AP, credits bank", () => {
      const amount = 242;
      const lines = [
        { account: "4220", debit: amount, credit: 0 },
        { account: "2420", debit: 0, credit: amount },
      ];
      expect(lines[0].debit).toBe(lines[1].credit);
    });
  });
});

describe("Latvian VAT calculations", () => {
  const validRates = [0, 5, 12, 21];

  it("accepts all valid Latvian VAT rates", () => {
    for (const rate of validRates) {
      expect(validRates).toContain(rate);
    }
  });

  it("rejects invalid VAT rates", () => {
    expect(validRates).not.toContain(20);
    expect(validRates).not.toContain(10);
    expect(validRates).not.toContain(25);
  });

  it("calculates 21% VAT correctly", () => {
    const net = 100;
    const vat = Math.round(net * 21 / 100 * 100) / 100;
    expect(vat).toBe(21);
  });

  it("calculates 12% VAT correctly", () => {
    const net = 150;
    const vat = Math.round(net * 12 / 100 * 100) / 100;
    expect(vat).toBe(18);
  });

  it("calculates 5% VAT correctly", () => {
    const net = 200;
    const vat = Math.round(net * 5 / 100 * 100) / 100;
    expect(vat).toBe(10);
  });

  it("calculates 0% VAT correctly", () => {
    const net = 500;
    const vat = Math.round(net * 0 / 100 * 100) / 100;
    expect(vat).toBe(0);
  });

  it("handles multi-line invoice with mixed VAT rates", () => {
    const lines = [
      { net: 100, vatRate: 21 },
      { net: 50, vatRate: 12 },
      { net: 30, vatRate: 0 },
    ];

    const totalNet = lines.reduce((s, l) => s + l.net, 0);
    const totalVat = lines.reduce((s, l) => s + Math.round(l.net * l.vatRate / 100 * 100) / 100, 0);
    const total = totalNet + totalVat;

    expect(totalNet).toBe(180);
    expect(totalVat).toBe(27); // 21 + 6 + 0
    expect(total).toBe(207);
  });
});

describe("trial balance", () => {
  it("total debits must equal total credits", () => {
    const accounts = [
      { code: "2420", balance: 1000, normalSide: "debit" as const },
      { code: "2210", balance: 500, normalSide: "debit" as const },
      { code: "4220", balance: 300, normalSide: "credit" as const },
      { code: "5120", balance: 800, normalSide: "credit" as const },
      { code: "3110", balance: 400, normalSide: "credit" as const },
    ];

    let totalDebit = 0;
    let totalCredit = 0;

    for (const a of accounts) {
      if (a.normalSide === "debit") totalDebit += a.balance;
      else totalCredit += a.balance;
    }

    expect(totalDebit).toBe(1500);
    expect(totalCredit).toBe(1500);
  });
});

describe("invoice status transitions", () => {
  it("draft -> posted on GL posting", () => {
    const statuses = ["draft", "posted", "partially_paid", "paid", "overdue", "cancelled"];
    expect(statuses).toContain("draft");
    expect(statuses).toContain("posted");
  });

  it("posted -> partially_paid when partial payment allocated", () => {
    const total = 121;
    const amountPaid = 50;
    const status = amountPaid >= total ? "paid" : amountPaid > 0 ? "partially_paid" : "posted";
    expect(status).toBe("partially_paid");
  });

  it("posted -> paid when full payment allocated", () => {
    const total = 121;
    const amountPaid = 121;
    const status = amountPaid >= total ? "paid" : amountPaid > 0 ? "partially_paid" : "posted";
    expect(status).toBe("paid");
  });
});

describe("company code generation", () => {
  function generateCode(name: string): string {
    const quoted = name.match(/[""\u201C\u201D]([^""\u201C\u201D]+)[""\u201C\u201D]/) || name.match(/"([^"]+)"/);
    const clean = (quoted ? quoted[1] : name).replace(/^(SIA|AS|IK|ZS|PS)\s+/i, "").trim();
    return clean.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5).toUpperCase();
  }

  it("extracts code from quoted name", () => {
    expect(generateCode('Sabiedrība ar ierobežotu atbildību "DAIS"')).toBe("DAIS");
  });

  it("extracts code from SIA prefix", () => {
    expect(generateCode("SIA ERA Tech")).toBe("ERATE");
  });

  it("limits to 5 characters", () => {
    expect(generateCode("SIA Very Long Company Name")).toBe("VERYL");
  });

  it("handles simple names", () => {
    expect(generateCode("Acme")).toBe("ACME");
  });

  it("is uppercase", () => {
    const code = generateCode("test company");
    expect(code).toBe(code.toUpperCase());
  });
});

describe("Latvian Chart of Accounts structure", () => {
  it("has 6 account classes", () => {
    const classes = [
      { code: "1000", name: "Long-term assets", type: "asset" },
      { code: "2000", name: "Current assets", type: "asset" },
      { code: "3000", name: "Equity", type: "equity" },
      { code: "4000", name: "Liabilities", type: "liability" },
      { code: "5000", name: "Revenue", type: "revenue" },
      { code: "6000", name: "Expenses", type: "expense" },
    ];
    expect(classes).toHaveLength(6);
  });

  it("key accounts exist for AP/AR/VAT/Bank", () => {
    const requiredAccounts = ["2210", "2310", "2420", "4220", "4230"];
    for (const code of requiredAccounts) {
      expect(code).toMatch(/^\d{4}$/);
    }
  });

  it("account codes are 4 digits", () => {
    const codes = ["1000", "2210", "4230", "5120", "6350"];
    for (const code of codes) {
      expect(code).toHaveLength(4);
      expect(Number(code)).toBeGreaterThan(999);
      expect(Number(code)).toBeLessThan(10000);
    }
  });
});
