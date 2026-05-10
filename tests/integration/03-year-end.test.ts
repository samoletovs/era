/**
 * Test #3 — Year-end close.
 *
 * Validates:
 *   1. P&L accounts are zeroed out via a closing journal entry.
 *   2. Net result is transferred to retained earnings (3310).
 *   3. All 12 fiscal periods for the year are closed.
 *
 * Setup:
 *   - Sales invoice posted in 2026 → revenue account 5120 holds €1,000.
 *   - Run /year-end-close for fiscal year 2026.
 *
 * Expected closing JE:
 *   DR 5120 (Service revenue) €1,000   ← zero out revenue
 *   CR 3310 (Retained earnings)  €1,000  ← transfer net profit
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { getApp, authHeader } from "./_harness/test-server.js";
import {
  createTestCompany,
  createTestContact,
} from "./_harness/factories.js";

describe("year-end close (Latvia)", () => {
  it("zeroes P&L accounts, books retained earnings, closes all 12 periods", async () => {
    const app = await getApp();
    const fiscalYear = 2026;

    // ─── Setup ──────────────────────────────────────────────
    const company = await createTestCompany(app, { name: "SIA Year-End Co" });
    const customer = await createTestContact(app, company.id, {
      name: "Customer Z",
      type: "customer",
    });

    // Post a sales invoice → 5120 (revenue) gets a €1,000 credit.
    const invoiceCreate = await request(app as never)
      .post(`/api/companies/${company.id}/invoices`)
      .set(authHeader)
      .send({
        type: "sales",
        contactId: customer.id,
        contactName: customer.name,
        date: "2026-06-15",
        dueDate: "2026-07-15",
        lines: [
          {
            description: "Annual subscription",
            quantity: 1,
            unitPrice: 1000,
            vatRate: 21,
            accountCode: "5120",
          },
        ],
      });
    expect(invoiceCreate.status).toBe(201);
    const invoiceId = invoiceCreate.body.data.id;

    const invoicePost = await request(app as never)
      .post(`/api/companies/${company.id}/invoices/${invoiceId}/post`)
      .set(authHeader);
    expect(invoicePost.status).toBe(200);

    // Sanity: revenue balance is €1,000 before year-end close.
    // Trial balance defaults to current year, so 2026-06-15 invoice is included.
    const tbBefore = await request(app as never)
      .get(`/api/companies/${company.id}/trial-balance?from=2026-01-01&to=2026-12-31`)
      .set(authHeader);
    expect(tbBefore.status).toBe(200);
    const revenueBefore = (tbBefore.body.data.lines as Array<{
      accountCode: string;
      closingBalance: number;
    }>).find((a) => a.accountCode === "5120");
    expect(revenueBefore?.closingBalance).toBe(1000);

    // ─── Action — year-end close ────────────────────────────
    const yearEndRes = await request(app as never)
      .post(`/api/companies/${company.id}/year-end-close`)
      .set(authHeader)
      .send({ fiscalYear });
    expect(yearEndRes.status).toBe(200);
    const result = yearEndRes.body.data;
    expect(result.periodsClosedCount).toBe(12);
    expect(result.closingEntry).toBeDefined();

    // ─── Verify closing journal entry ───────────────────────
    const journalRes = await request(app as never)
      .get(`/api/companies/${company.id}/journal-entries`)
      .set(authHeader);
    expect(journalRes.status).toBe(200);
    const entries = journalRes.body.data as Array<{
      id: string;
      description: string;
      sourceType?: string;
      lines: Array<{ accountCode: string; debit: number; credit: number }>;
    }>;

    const closingEntry = entries.find(
      (e) => e.sourceType === "closing" || /year-end closing/i.test(e.description),
    );
    expect(closingEntry, "expected a closing journal entry").toBeDefined();

    const closingByAccount = new Map<string, { debit: number; credit: number }>();
    for (const l of closingEntry!.lines) {
      const cur = closingByAccount.get(l.accountCode) ?? { debit: 0, credit: 0 };
      cur.debit += l.debit;
      cur.credit += l.credit;
      closingByAccount.set(l.accountCode, cur);
    }

    // Revenue 5120 is debited (zeroed out) for €1,000.
    expect(closingByAccount.get("5120")?.debit).toBe(1000);
    expect(closingByAccount.get("5120")?.credit).toBe(0);

    // Retained earnings 3310 is credited for €1,000 (net profit).
    expect(closingByAccount.get("3310")?.credit).toBe(1000);
    expect(closingByAccount.get("3310")?.debit).toBe(0);

    // The closing entry balances.
    const dr = round2(
      closingEntry!.lines.reduce((s, l) => s + l.debit, 0),
    );
    const cr = round2(
      closingEntry!.lines.reduce((s, l) => s + l.credit, 0),
    );
    expect(dr).toBe(cr);

    // ─── Verify trial balance after close ───────────────────
    const tbAfter = await request(app as never)
      .get(`/api/companies/${company.id}/trial-balance?from=2026-01-01&to=2026-12-31`)
      .set(authHeader);
    expect(tbAfter.status).toBe(200);
    const accountsAfter = tbAfter.body.data.lines as Array<{
      accountCode: string;
      closingBalance: number;
    }>;

    // Revenue is zero (1000 in, 1000 out via closing entry).
    const revAfter = accountsAfter.find((a) => a.accountCode === "5120");
    expect(revAfter?.closingBalance ?? 0).toBe(0);

    // Retained earnings carries the profit.
    const reAfter = accountsAfter.find((a) => a.accountCode === "3310");
    expect(reAfter?.closingBalance).toBe(1000);

    // ─── Verify all 12 periods are closed ───────────────────
    for (let m = 1; m <= 12; m++) {
      const period = `${fiscalYear}-${String(m).padStart(2, "0")}`;
      const pRes = await request(app as never)
        .get(`/api/companies/${company.id}/periods/${period}`)
        .set(authHeader);
      expect(pRes.status).toBe(200);
      expect(pRes.body.data.status, `period ${period}`).toBe("closed");
    }
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
