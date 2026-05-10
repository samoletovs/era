/**
 * Test #4 — VAT declaration generation.
 *
 * Validates the Latvian VAT return (PVN deklarācija) report aggregates posted
 * invoices by rate and direction (output / input) over a given month.
 *
 * Setup (April 2026):
 *   - Sales invoice €100 net @ 21% → €21 output VAT  (standard rate)
 *   - Sales invoice €100 net @ 12% → €12 output VAT  (reduced rate)
 *   - Sales invoice €100 net @  5% → € 5 output VAT  (super-reduced rate)
 *   - Sales invoice €100 net @  0% → € 0 output VAT  (zero-rated, e.g. exports)
 *   - Purchase invoice €200 net @ 21% → €42 input VAT
 *
 * Expected:
 *   taxableStandard     = 100   outputVatStandard     = 21
 *   taxableReduced      = 100   outputVatReduced      = 12
 *   taxableSuperReduced = 100   outputVatSuperReduced =  5
 *   totalOutputVat      =  38
 *   totalInputVat       =  42
 *   vatPayable          = -4    (refund)
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { getApp, authHeader } from "./_harness/test-server.js";
import {
  createTestCompany,
  createTestContact,
} from "./_harness/factories.js";

interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  accountCode: string;
}

async function createAndPostInvoice(
  app: unknown,
  companyId: string,
  payload: {
    type: "sales" | "purchase";
    contactId: string;
    contactName: string;
    date: string;
    lines: InvoiceLine[];
  },
): Promise<void> {
  const create = await request(app as never)
    .post(`/api/companies/${companyId}/invoices`)
    .set(authHeader)
    .send({
      ...payload,
      dueDate: payload.date, // due-date irrelevant for VAT report
    });
  if (create.status !== 201) {
    throw new Error(
      `invoice create failed: ${create.status} ${JSON.stringify(create.body)}`,
    );
  }
  const post = await request(app as never)
    .post(`/api/companies/${companyId}/invoices/${create.body.data.id}/post`)
    .set(authHeader);
  if (post.status !== 200) {
    throw new Error(
      `invoice post failed: ${post.status} ${JSON.stringify(post.body)}`,
    );
  }
}

describe("VAT declaration (Latvia)", () => {
  it("aggregates posted invoices by VAT rate and direction for the period", async () => {
    const app = await getApp();

    // ─── Setup ──────────────────────────────────────────────
    const company = await createTestCompany(app, { name: "SIA VAT-Test Co" });
    const customer = await createTestContact(app, company.id, {
      name: "Customer VAT",
      type: "customer",
    });
    const vendor = await createTestContact(app, company.id, {
      name: "Vendor VAT",
      type: "vendor",
      registrationNumber: "40103000099",
    });

    // 4 sales invoices at 21%, 12%, 5%, 0%
    const salesRates = [21, 12, 5, 0];
    for (const rate of salesRates) {
      await createAndPostInvoice(app, company.id, {
        type: "sales",
        contactId: customer.id,
        contactName: customer.name,
        date: "2026-04-10",
        lines: [
          {
            description: `Service @ ${rate}%`,
            quantity: 1,
            unitPrice: 100,
            vatRate: rate,
            accountCode: "5120",
          },
        ],
      });
    }

    // 1 purchase invoice with input VAT @ 21%
    await createAndPostInvoice(app, company.id, {
      type: "purchase",
      contactId: vendor.id,
      contactName: vendor.name,
      date: "2026-04-15",
      lines: [
        {
          description: "Office supplies",
          quantity: 1,
          unitPrice: 200,
          vatRate: 21,
          accountCode: "6310", // Office expenses
        },
      ],
    });

    // ─── Action ─────────────────────────────────────────────
    const declRes = await request(app as never)
      .get(`/api/companies/${company.id}/reports/vat-declaration?year=2026&month=4`)
      .set(authHeader);
    expect(declRes.status).toBe(200);
    const decl = declRes.body.data;

    // ─── Assert headline boxes ──────────────────────────────
    expect(decl.period).toBe("2026-04");
    expect(decl.year).toBe(2026);
    expect(decl.month).toBe(4);

    expect(decl.taxableStandard).toBe(100);
    expect(decl.taxableReduced).toBe(100);
    expect(decl.taxableSuperReduced).toBe(100);
    expect(decl.outputVatStandard).toBe(21);
    expect(decl.outputVatReduced).toBe(12);
    expect(decl.outputVatSuperReduced).toBe(5);

    expect(decl.totalOutputVat).toBe(38);
    expect(decl.totalInputVat).toBe(42);
    expect(decl.vatPayable).toBe(-4); // refund position

    // ─── Assert detailed rate breakdown ─────────────────────
    const lines = decl.lines as Array<{
      type: "output" | "input";
      vatRate: number;
      taxableAmount: number;
      vatAmount: number;
    }>;

    const std = lines.find((l) => l.type === "output" && l.vatRate === 21);
    expect(std).toEqual({
      type: "output",
      vatRate: 21,
      taxableAmount: 100,
      vatAmount: 21,
    });

    const reduced = lines.find((l) => l.type === "output" && l.vatRate === 12);
    expect(reduced?.vatAmount).toBe(12);

    const superReduced = lines.find(
      (l) => l.type === "output" && l.vatRate === 5,
    );
    expect(superReduced?.vatAmount).toBe(5);

    const zero = lines.find((l) => l.type === "output" && l.vatRate === 0);
    expect(zero?.taxableAmount).toBe(100);
    expect(zero?.vatAmount).toBe(0);

    const input = lines.find((l) => l.type === "input" && l.vatRate === 21);
    expect(input?.taxableAmount).toBe(200);
    expect(input?.vatAmount).toBe(42);
  });
});
