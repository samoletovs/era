/**
 * Test #2 — Month-end run.
 *
 * Validates the autonomous monthly close pipeline:
 *   1. Seed Latvian posting rules (so FX rule lookup succeeds even if it skips).
 *   2. Create a posted sales invoice with a past due date — month-end must
 *      mark it overdue.
 *   3. Register a fixed asset acquired in a prior month — month-end must
 *      run depreciation and post the corresponding journal entry.
 *   4. Create a recurring template due this period — month-end must execute
 *      it and post the corresponding journal entry.
 *   5. Run /api/companies/:cid/run-month-end for period 2026-04.
 *   6. Assert: 5 steps reported with the expected statuses; period is closed;
 *      the right number of journal entries exist with balanced postings.
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { getApp, authHeader } from "./_harness/test-server.js";
import {
  createTestCompany,
  createTestContact,
} from "./_harness/factories.js";

describe("month-end run (Latvia)", () => {
  it("marks overdue invoices, runs depreciation + recurring entries, closes the period", async () => {
    const app = await getApp();
    const period = "2026-04";

    // ─── Setup ──────────────────────────────────────────────
    // Seed LV posting rules so the FX-revaluation step can resolve its rule
    // (even though the step itself will short-circuit with no flagged accounts).
    const seedRes = await request(app as never)
      .post(`/api/rules/seed`)
      .set(authHeader)
      .send({});
    expect(seedRes.status).toBe(200);

    const company = await createTestCompany(app, { name: "SIA Month-End Co" });
    const customer = await createTestContact(app, company.id, {
      name: "Late Payer SIA",
      type: "customer",
    });

    // ─── 1. Posted invoice with a long-past due date ────────
    const invoiceCreate = await request(app as never)
      .post(`/api/companies/${company.id}/invoices`)
      .set(authHeader)
      .send({
        type: "sales",
        contactId: customer.id,
        contactName: customer.name,
        date: "2026-03-01",
        dueDate: "2026-03-15", // well in the past relative to 2026-05-10
        lines: [
          {
            description: "Consulting services",
            quantity: 1,
            unitPrice: 200,
            vatRate: 21,
            accountCode: "5120",
          },
        ],
      });
    expect(invoiceCreate.status).toBe(201);
    const invoice = invoiceCreate.body.data;

    const invoicePost = await request(app as never)
      .post(`/api/companies/${company.id}/invoices/${invoice.id}/post`)
      .set(authHeader);
    expect(invoicePost.status).toBe(200);
    expect(invoicePost.body.data.status).toBe("posted");

    // ─── 2. Fixed asset to depreciate ───────────────────────
    // €1200 over 12 months → €100 / month
    const assetCreate = await request(app as never)
      .post(`/api/companies/${company.id}/fixed-assets`)
      .set(authHeader)
      .send({
        code: "FA-0001",
        name: "Laptop Dell XPS 13",
        assetAccountCode: "1230", // Office equipment
        depreciationAccountCode: "1239", // Accumulated depreciation
        expenseAccountCode: "7170", // Depreciation expense
        acquisitionDate: "2026-01-15",
        acquisitionCost: 1200,
        residualValue: 0,
        usefulLifeMonths: 12,
      });
    expect(assetCreate.status).toBe(201);

    // ─── 3. Recurring template due this period ──────────────
    const templateCreate = await request(app as never)
      .post(`/api/companies/${company.id}/recurring-templates`)
      .set(authHeader)
      .send({
        name: "Monthly office rent",
        description: "DR rent expense, CR bank",
        frequency: "monthly",
        nextRunDate: "2026-04-15", // within the period being closed
        lines: [
          {
            accountCode: "7160",
            accountName: "Rent expense",
            debit: 500,
            credit: 0,
            description: "Office rent",
          },
          {
            accountCode: "2420",
            accountName: "Bank accounts",
            debit: 0,
            credit: 500,
            description: "Office rent",
          },
        ],
      });
    expect(templateCreate.status).toBe(201);

    // ─── Action — run the month-end pipeline ────────────────
    const runRes = await request(app as never)
      .post(`/api/companies/${company.id}/run-month-end`)
      .set(authHeader)
      .send({ period });
    expect(runRes.status).toBe(200);

    const result = runRes.body.data;
    expect(result.companyId).toBe(company.id);
    expect(result.period).toBe(period);
    expect(Array.isArray(result.steps)).toBe(true);
    expect(result.steps).toHaveLength(5);

    // Build a name → step map for easy assertions.
    const byName = new Map<string, { status: string; detail: string }>(
      result.steps.map((s: { name: string; status: string; detail: string }) => [
        s.name,
        { status: s.status, detail: s.detail },
      ]),
    );

    expect(byName.get("Mark overdue invoices")?.status).toBe("completed");
    expect(byName.get("Mark overdue invoices")?.detail).toMatch(/1 invoices? marked overdue/);

    expect(byName.get("Execute recurring entries")?.status).toBe("completed");
    expect(byName.get("Execute recurring entries")?.detail).toMatch(/1 of 1 templates executed/);

    expect(byName.get("Monthly depreciation")?.status).toBe("completed");
    expect(byName.get("Monthly depreciation")?.detail).toMatch(/1 assets, ?€100\.00 total/);

    // No FX-flagged accounts in default LV CoA → step skips.
    expect(byName.get("Currency revaluation")?.status).toBe("skipped");

    expect(byName.get("Close period")?.status).toBe("completed");
    expect(byName.get("Close period")?.detail).toMatch(/2026-04 closed/);

    // ─── Verify side effects ────────────────────────────────
    // a) Invoice status is now "overdue".
    const invoiceAfter = await request(app as never)
      .get(`/api/companies/${company.id}/invoices/${invoice.id}`)
      .set(authHeader);
    expect(invoiceAfter.status).toBe(200);
    expect(invoiceAfter.body.data.status).toBe("overdue");

    // b) Period is marked closed.
    const periodAfter = await request(app as never)
      .get(`/api/companies/${company.id}/periods/${period}`)
      .set(authHeader);
    expect(periodAfter.status).toBe(200);
    expect(periodAfter.body.data.status).toBe("closed");

    // c) Journal entries — invoice posting + asset acquisition + depreciation + recurring = 4.
    const journalRes = await request(app as never)
      .get(`/api/companies/${company.id}/journal-entries`)
      .set(authHeader);
    expect(journalRes.status).toBe(200);
    const entries = journalRes.body.data as Array<{
      description: string;
      lines: Array<{ debit: number; credit: number }>;
      status: string;
    }>;
    expect(entries.length).toBeGreaterThanOrEqual(4);

    // Every JE balances.
    for (const e of entries) {
      const dr = round2(e.lines.reduce((s, l) => s + (l.debit || 0), 0));
      const cr = round2(e.lines.reduce((s, l) => s + (l.credit || 0), 0));
      expect(dr).toBe(cr);
    }

    // Find the depreciation JE specifically.
    const depEntry = entries.find((e) => /Monthly depreciation/i.test(e.description));
    expect(depEntry, "expected a depreciation journal entry").toBeDefined();
    const depDr = round2(depEntry!.lines.reduce((s, l) => s + l.debit, 0));
    expect(depDr).toBe(100);

    // Find the recurring JE — its description ends with "— recurring".
    const rentEntry = entries.find((e) => /office rent.*recurring/i.test(e.description));
    expect(rentEntry, "expected a recurring rent journal entry").toBeDefined();
    const rentDr = round2(rentEntry!.lines.reduce((s, l) => s + l.debit, 0));
    expect(rentDr).toBe(500);
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
