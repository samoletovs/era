/**
 * Test #1 — Invoice lifecycle (create → post → pay).
 *
 * Validates the most critical financial path in era:
 *   1. Create company (auto-builds Latvian chart of accounts)
 *   2. Create customer contact
 *   3. Create draft sales invoice
 *   4. Post invoice → GL: AR debited, Revenue credited, VAT credited
 *   5. Record payment with invoice allocation → GL: Bank debited, AR credited
 *   6. Verify invoice status transitions draft → posted → paid
 *   7. Verify the journal entries balance and book to the right accounts
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { getApp, authHeader } from "./_harness/test-server.js";
import {
  createTestCompany,
  createTestContact,
} from "./_harness/factories.js";

describe("invoice lifecycle (Latvia)", () => {
  it("create → post → pay produces balanced GL with correct postings", async () => {
    const app = await getApp();

    // ─── Setup ──────────────────────────────────────────────
    const company = await createTestCompany(app, { name: "SIA Lifecycle Co" });
    const customer = await createTestContact(app, company.id, {
      name: "Customer A",
      type: "customer",
    });

    // ─── 1. Create draft invoice ────────────────────────────
    // 100 EUR net @ 21% LV VAT = 121 EUR total
    const createRes = await request(app as never)
      .post(`/api/companies/${company.id}/invoices`)
      .set(authHeader)
      .send({
        type: "sales",
        contactId: customer.id,
        contactName: customer.name,
        date: "2026-04-01",
        dueDate: "2026-04-30",
        lines: [
          {
            description: "Consulting services",
            quantity: 1,
            unitPrice: 100,
            vatRate: 21,
            accountCode: "5120", // Service revenue
          },
        ],
      });

    expect(createRes.status).toBe(201);
    const invoice = createRes.body.data;
    expect(invoice.status).toBe("draft");
    expect(invoice.subtotal).toBe(100);
    expect(invoice.vatAmount).toBe(21);
    expect(invoice.total).toBe(121);
    expect(invoice.invoiceNumber).toBeDefined();

    // ─── 2. Post invoice ────────────────────────────────────
    const postRes = await request(app as never)
      .post(`/api/companies/${company.id}/invoices/${invoice.id}/post`)
      .set(authHeader);

    expect(postRes.status).toBe(200);
    const posted = postRes.body.data;
    expect(posted.status).toBe("posted");
    expect(posted.journalEntryId).toBeDefined();

    // ─── 3. Verify posted GL entries ────────────────────────
    const postingsRes = await request(app as never)
      .get(`/api/companies/${company.id}/invoices/${invoice.id}/postings`)
      .set(authHeader);
    expect(postingsRes.status).toBe(200);
    const journalEntries: Array<{
      lines: Array<{ accountCode: string; debit?: number; credit?: number }>;
    }> = postingsRes.body.data;
    expect(journalEntries.length).toBeGreaterThan(0);

    // Flatten lines across all journal entries for this invoice (typically just one)
    const allLines = journalEntries.flatMap((je) => je.lines);

    // Sum debits and credits — must balance
    const totalDebits = allLines.reduce(
      (s, l) => s + (l.debit ?? 0),
      0,
    );
    const totalCredits = allLines.reduce(
      (s, l) => s + (l.credit ?? 0),
      0,
    );
    expect(totalDebits).toBeCloseTo(121, 2);
    expect(totalCredits).toBeCloseTo(121, 2);
    expect(totalDebits).toBeCloseTo(totalCredits, 2);

    // AR (2210) debited 121, Revenue (5120) credited 100, VAT Output (4230) credited 21
    const arLine = allLines.find((l) => l.accountCode === "2210");
    const revLine = allLines.find((l) => l.accountCode === "5120");
    const vatLine = allLines.find((l) => l.accountCode === "4230");

    expect(arLine).toBeDefined();
    expect(arLine!.debit).toBeCloseTo(121, 2);
    expect(revLine).toBeDefined();
    expect(revLine!.credit).toBeCloseTo(100, 2);
    expect(vatLine).toBeDefined();
    expect(vatLine!.credit).toBeCloseTo(21, 2);

    // ─── 4. Record payment ──────────────────────────────────
    const payRes = await request(app as never)
      .post(`/api/companies/${company.id}/payments`)
      .set(authHeader)
      .send({
        type: "incoming",
        contactId: customer.id,
        contactName: customer.name,
        date: "2026-04-15",
        amount: 121,
        bankAccountIban: "LV80BANK0000435195001",
        invoiceAllocations: [
          {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            amount: 121,
          },
        ],
      });

    expect(payRes.status).toBe(201);
    const payment = payRes.body.data;
    expect(payment.id).toBeDefined();

    // ─── 5. Verify invoice transitioned to paid ─────────────
    const finalRes = await request(app as never)
      .get(`/api/companies/${company.id}/invoices/${invoice.id}`)
      .set(authHeader);
    expect(finalRes.status).toBe(200);
    expect(finalRes.body.data.status).toBe("paid");
    expect(finalRes.body.data.amountPaid).toBeCloseTo(121, 2);
  });
});
