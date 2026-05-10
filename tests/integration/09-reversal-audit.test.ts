/**
 * Test #9 — Reversal & audit-trail chain.
 *
 * Validates Phase 2 reversibility + explainability:
 *   1. Create company + customer
 *   2. Create + post a sales invoice — journal entry is stamped with
 *      posting-rule provenance (postingRuleId, version, country, etc.)
 *   3. Fetch audit chain by journal-entry id — expect event + invoice + rule
 *   4. Reverse the entry via POST /journal-entries/:id/reverse
 *   5. Original is marked `reversed`; counter entry has flipped debits/credits
 *   6. Counter entry has NO rule-provenance fields (reversal is not rule-driven)
 *   7. Audit chain for the counter entry resolves but has no rule (sourceType='adjustment')
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { getApp, authHeader } from "./_harness/test-server.js";
import {
  createTestCompany,
  createTestContact,
} from "./_harness/factories.js";

describe("reversal & audit chain (Phase 2)", () => {
  it("posts an invoice, reverses it, and the audit chain reflects both states", async () => {
    const app = await getApp();

    // Seed LV posting rules so the invoice posting goes through
    // evaluateInvoiceRule (which stamps rule provenance).
    const seedRes = await request(app as never)
      .post(`/api/rules/seed`)
      .set(authHeader);
    expect(seedRes.status).toBe(200);

    // ─── Setup ──────────────────────────────────────────────
    const company = await createTestCompany(app, { name: "SIA Reversal Co" });
    const customer = await createTestContact(app, company.id, {
      name: "Customer R",
      type: "customer",
    });

    // ─── 1. Create + post sales invoice ─────────────────────
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
            accountCode: "5120",
          },
        ],
      });
    expect(createRes.status).toBe(201);
    const invoice = createRes.body.data;

    const postRes = await request(app as never)
      .post(`/api/companies/${company.id}/invoices/${invoice.id}/post`)
      .set(authHeader);
    expect(postRes.status).toBe(200);
    const posted = postRes.body.data;
    const journalEntryId: string = posted.journalEntryId;
    expect(journalEntryId).toBeDefined();

    // ─── 2. Audit chain BEFORE reversal — expect rule provenance ───
    const auditRes1 = await request(app as never)
      .get(
        `/api/companies/${company.id}/audit/journal-entry/${journalEntryId}`,
      )
      .set(authHeader);
    expect(auditRes1.status).toBe(200);
    const chain1 = auditRes1.body.data;
    expect(chain1.journalEntry).toBeDefined();
    expect(chain1.journalEntry.id).toBe(journalEntryId);
    expect(chain1.journalEntry.status).toBe("posted");
    // Posting-rule provenance must be stamped on at least one line
    const ruleLine = chain1.journalEntry.lines.find(
      (l: { postingRuleId?: string }) => !!l.postingRuleId,
    );
    expect(ruleLine).toBeDefined();
    expect(ruleLine.postingRuleVersion).toBeGreaterThanOrEqual(1);
    expect(ruleLine.postingRuleCountry).toBe("LV");
    // Source invoice resolved
    expect(chain1.invoice).toBeDefined();
    expect(chain1.invoice.id).toBe(invoice.id);
    // Rule resolved
    expect(chain1.rule).toBeDefined();
    expect(chain1.rule.country).toBe("LV");

    // ─── 3. Reverse the entry ──────────────────────────────
    const revRes = await request(app as never)
      .post(
        `/api/companies/${company.id}/journal-entries/${journalEntryId}/reverse`,
      )
      .set(authHeader);
    expect(revRes.status).toBe(200);
    const counter = revRes.body.data;
    expect(counter.id).toBeDefined();
    expect(counter.id).not.toBe(journalEntryId);
    expect(counter.sourceType).toBe("adjustment");
    expect(counter.sourceId).toBe(journalEntryId);

    // ─── 4. Counter entry has flipped debits/credits ───────
    const totalCounterDebits = counter.lines.reduce(
      (s: number, l: { debit?: number }) => s + (l.debit ?? 0),
      0,
    );
    const totalCounterCredits = counter.lines.reduce(
      (s: number, l: { credit?: number }) => s + (l.credit ?? 0),
      0,
    );
    expect(totalCounterDebits).toBeCloseTo(121, 2);
    expect(totalCounterCredits).toBeCloseTo(121, 2);
    // Specifically: AR (2210) credit, Revenue (5120) debit, VAT (4230) debit
    const arLine = counter.lines.find(
      (l: { accountCode: string }) => l.accountCode === "2210",
    );
    expect(arLine).toBeDefined();
    expect(arLine.credit).toBeCloseTo(121, 2);
    expect(arLine.debit ?? 0).toBe(0);

    // ─── 5. Counter entry must NOT carry rule-provenance ────
    for (const l of counter.lines as Array<{
      postingRuleId?: string;
      agentReasoningExcerpt?: string;
    }>) {
      expect(l.postingRuleId).toBeUndefined();
      expect(l.agentReasoningExcerpt).toBeUndefined();
    }

    // ─── 6. Original entry is now reversed ──────────────────
    const auditRes2 = await request(app as never)
      .get(
        `/api/companies/${company.id}/audit/journal-entry/${journalEntryId}`,
      )
      .set(authHeader);
    expect(auditRes2.status).toBe(200);
    expect(auditRes2.body.data.journalEntry.status).toBe("reversed");

    // ─── 7. Counter entry's audit chain resolves but has no rule ───
    const auditRes3 = await request(app as never)
      .get(`/api/companies/${company.id}/audit/journal-entry/${counter.id}`)
      .set(authHeader);
    expect(auditRes3.status).toBe(200);
    const chain3 = auditRes3.body.data;
    expect(chain3.journalEntry).toBeDefined();
    expect(chain3.journalEntry.id).toBe(counter.id);
    expect(chain3.rule).toBeNull();

    // ─── 8. Double-reversal is rejected ─────────────────────
    const doubleRes = await request(app as never)
      .post(
        `/api/companies/${company.id}/journal-entries/${journalEntryId}/reverse`,
      )
      .set(authHeader);
    expect(doubleRes.status).toBeGreaterThanOrEqual(400);
  });
});
