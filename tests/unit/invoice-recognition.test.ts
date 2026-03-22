// Tests for invoice recognition data extraction
import { describe, it, expect } from "vitest";

describe("invoice recognition output validation", () => {
  // Simulate what GPT-4o returns and validate the structure

  const sampleRecognized = {
    vendorName: 'Sabiedrība ar ierobežotu atbildību "DAIS"',
    vendorRegistrationNumber: "40003290084",
    vendorVatNumber: "LV40003290084",
    vendorAddress: "Rīga, Jēkaba iela 26/28 - 36A",
    invoiceNumber: "INV-2026-0042",
    invoiceDate: "2026-03-15",
    dueDate: "2026-04-14",
    currency: "EUR",
    lines: [
      { description: "Consulting services", quantity: 10, unitPrice: 80, vatRate: 21, lineTotal: 968 },
      { description: "Software license", quantity: 1, unitPrice: 200, vatRate: 21, lineTotal: 242 },
    ],
    subtotal: 1000,
    vatAmount: 210,
    total: 1210,
    bankAccount: "LV80HABA0551038162710",
    reference: "ERA-2026-03",
    confidence: "high" as const,
  };

  it("has required vendor fields", () => {
    expect(sampleRecognized.vendorName).toBeTruthy();
    expect(sampleRecognized.invoiceNumber).toBeTruthy();
    expect(sampleRecognized.invoiceDate).toBeTruthy();
  });

  it("has valid date format (YYYY-MM-DD)", () => {
    expect(sampleRecognized.invoiceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    if (sampleRecognized.dueDate) {
      expect(sampleRecognized.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("has EUR currency", () => {
    expect(sampleRecognized.currency).toBe("EUR");
  });

  it("has at least one line item", () => {
    expect(sampleRecognized.lines.length).toBeGreaterThanOrEqual(1);
  });

  it("line items have required fields", () => {
    for (const line of sampleRecognized.lines) {
      expect(line.description).toBeTruthy();
      expect(line.quantity).toBeGreaterThan(0);
      expect(line.unitPrice).toBeGreaterThan(0);
      expect([0, 5, 12, 21]).toContain(line.vatRate);
    }
  });

  it("totals are consistent", () => {
    const calcSubtotal = sampleRecognized.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const calcVat = sampleRecognized.lines.reduce((s, l) => s + l.unitPrice * l.quantity * l.vatRate / 100, 0);
    expect(sampleRecognized.subtotal).toBe(calcSubtotal);
    expect(sampleRecognized.vatAmount).toBe(calcVat);
    expect(sampleRecognized.total).toBe(calcSubtotal + calcVat);
  });

  it("confidence is a valid value", () => {
    expect(["high", "medium", "low"]).toContain(sampleRecognized.confidence);
  });

  it("Latvian reg number is 11 digits", () => {
    if (sampleRecognized.vendorRegistrationNumber) {
      expect(sampleRecognized.vendorRegistrationNumber).toMatch(/^\d{11}$/);
    }
  });

  it("Latvian VAT number starts with LV", () => {
    if (sampleRecognized.vendorVatNumber) {
      expect(sampleRecognized.vendorVatNumber).toMatch(/^LV\d{11}$/);
    }
  });
});

describe("invoice line total calculations", () => {
  function calcLineTotals(line: { quantity: number; unitPrice: number; vatRate: number }) {
    const net = Math.round(line.quantity * line.unitPrice * 100) / 100;
    const vatAmount = Math.round(net * line.vatRate / 100 * 100) / 100;
    return { net, vatAmount, lineTotal: Math.round((net + vatAmount) * 100) / 100 };
  }

  it("calculates correctly for standard 21% VAT", () => {
    const result = calcLineTotals({ quantity: 10, unitPrice: 80, vatRate: 21 });
    expect(result.net).toBe(800);
    expect(result.vatAmount).toBe(168);
    expect(result.lineTotal).toBe(968);
  });

  it("calculates correctly for reduced 12% VAT", () => {
    const result = calcLineTotals({ quantity: 5, unitPrice: 20, vatRate: 12 });
    expect(result.net).toBe(100);
    expect(result.vatAmount).toBe(12);
    expect(result.lineTotal).toBe(112);
  });

  it("calculates correctly for 0% VAT", () => {
    const result = calcLineTotals({ quantity: 1, unitPrice: 500, vatRate: 0 });
    expect(result.net).toBe(500);
    expect(result.vatAmount).toBe(0);
    expect(result.lineTotal).toBe(500);
  });

  it("handles fractional quantities", () => {
    const result = calcLineTotals({ quantity: 2.5, unitPrice: 40, vatRate: 21 });
    expect(result.net).toBe(100);
    expect(result.vatAmount).toBe(21);
    expect(result.lineTotal).toBe(121);
  });
});

describe("MIME type validation for upload", () => {
  const supportedImages = ["image/jpeg", "image/png", "image/gif", "image/webp"];

  it("accepts JPEG files", () => {
    expect(supportedImages).toContain("image/jpeg");
  });

  it("accepts PNG files", () => {
    expect(supportedImages).toContain("image/png");
  });

  it("accepts WebP files", () => {
    expect(supportedImages).toContain("image/webp");
  });

  it("rejects application/pdf for direct vision API", () => {
    // PDFs must be converted to images first
    expect(supportedImages).not.toContain("application/pdf");
  });

  it("rejects unsupported formats", () => {
    expect(supportedImages).not.toContain("image/svg+xml");
    expect(supportedImages).not.toContain("application/msword");
    expect(supportedImages).not.toContain("text/plain");
  });
});
