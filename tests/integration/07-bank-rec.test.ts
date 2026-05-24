/**
 * Test #7 — Bank reconciliation: import statement & match to invoice.
 *
 * Validates the bank-rec workflow end-to-end:
 *   - import a bank statement with one deposit line,
 *   - match that line to an outstanding sales invoice,
 *   - complete the reconciliation, and
 *   - confirm the invoice is marked paid, a settlement journal entry is
 *     posted (DR Bank / CR AR), and the bank account balance updates.
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { getApp, authHeader } from "./_harness/test-server.js";
import { createTestCompany } from "./_harness/factories.js";

describe("bank reconciliation — import & match", () => {
  it("matches a deposit line to a posted sales invoice and settles AR", async () => {
    const app = await getApp();
    const seed = await request(app as never)
      .post(`/api/rules/seed`)
      .set(authHeader)
      .send({ country: "LV" });
    expect(seed.status).toBe(200);

    const company = await createTestCompany(app, { name: "SIA Bank Rec" });

    // ─── Create + post a sales invoice (€500 + 21% VAT = €605) ──
    const customer = await request(app as never)
      .post(`/api/companies/${company.id}/contacts`)
      .set(authHeader)
      .send({
        name: "Acme Customer",
        type: "customer",
        registrationNumber: "40103000060",
      });
    expect(customer.status).toBe(201);
    const customerId = customer.body.data.id as string;

    const invoiceCreate = await request(app as never)
      .post(`/api/companies/${company.id}/invoices`)
      .set(authHeader)
      .send({
        type: "sales",
        contactId: customerId,
        contactName: "Acme Customer",
        date: "2026-04-10",
        dueDate: "2026-05-10",
        lines: [
          {
            description: "Consulting",
            quantity: 1,
            unitPrice: 500,
            vatRate: 21,
            accountCode: "5120",
          },
        ],
      });
    expect(invoiceCreate.status).toBe(201);
    const invoiceId = invoiceCreate.body.data.id as string;
    const invoiceNumber = invoiceCreate.body.data.invoiceNumber as string;

    const invoicePost = await request(app as never)
      .post(`/api/companies/${company.id}/invoices/${invoiceId}/post`)
      .set(authHeader)
      .send();
    expect(invoicePost.status).toBe(200);

    // Bank balance should be 0 before the deposit settles AR.
    const balBefore = await getAccountBalance(app, company.id, "2420");
    expect(balBefore).toBe(0);

    // ─── Import a bank statement with a single matching deposit ─
    const importRes = await request(app as never)
      .post(`/api/companies/${company.id}/bank-reconciliations`)
      .set(authHeader)
      .send({
        bankAccountCode: "2420",
        bankIban: "LV80HABA0551000000001",
        statementDate: "2026-04-30",
        statementBalance: 605,
        lines: [
          {
            date: "2026-04-15",
            description: `Payment from Acme Customer ${invoiceNumber}`,
            reference: invoiceNumber,
            amount: 605,
            counterparty: "Acme Customer",
          },
        ],
      });
    expect(importRes.status).toBe(201);
    const recon = importRes.body.data as {
      id: string;
      status: string;
      lines: Array<{ id: string; status: string; amount: number }>;
    };
    expect(recon.status).toBe("in-progress");
    expect(recon.lines).toHaveLength(1);
    const lineId = recon.lines[0].id;
    expect(recon.lines[0].amount).toBe(605);

    const listRes = await request(app as never)
      .get(`/api/companies/${company.id}/bank-reconciliations`)
      .set(authHeader);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.data.some((r: { id: string }) => r.id === recon.id)).toBe(true);

    // ─── Match the line to the invoice ─────────────────────
    const matchRes = await request(app as never)
      .post(`/api/companies/${company.id}/bank-reconciliations/${recon.id}/match-invoice`)
      .set(authHeader)
      .send({
        lineId,
        invoiceId,
        invoiceNumber,
        allocatedAmount: 605,
      });
    expect(matchRes.status).toBe(200);
    const matched = matchRes.body.data as {
      lines: Array<{
        id: string;
        status: string;
        matchedInvoiceId?: string;
        matchedJournalEntryId?: string;
        differenceType?: string;
      }>;
    };
    const matchedLine = matched.lines.find((l) => l.id === lineId)!;
    expect(matchedLine.status).toBe("posted");
    expect(matchedLine.matchedInvoiceId).toBe(invoiceId);
    expect(matchedLine.differenceType).toBe("exact");
    const settlementEntryId = matchedLine.matchedJournalEntryId!;
    expect(settlementEntryId).toBeDefined();

    // ─── Complete the reconciliation ────────────────────────
    const completeRes = await request(app as never)
      .post(`/api/companies/${company.id}/bank-reconciliations/${recon.id}/complete`)
      .set(authHeader)
      .send();
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.status).toBe("reconciled");
    expect(completeRes.body.data.reconciledAt).toBeDefined();

    // ─── Verify invoice + GL state ─────────────────────────
    const invoiceAfter = await request(app as never)
      .get(`/api/companies/${company.id}/invoices/${invoiceId}`)
      .set(authHeader);
    expect(invoiceAfter.status).toBe(200);
    expect(invoiceAfter.body.data.status).toBe("paid");
    expect(invoiceAfter.body.data.amountPaid).toBe(605);

    // Bank balance = +605 (deposit). AR (2210) net effect: +605 from posting,
    // -605 from settlement → 0.
    const balAfter = await getAccountBalance(app, company.id, "2420");
    expect(balAfter).toBe(605);
    const arAfter = await getAccountBalance(app, company.id, "2210");
    expect(arAfter).toBe(0);

    // Inspect the settlement journal entry directly.
    const jeRes = await request(app as never)
      .get(`/api/companies/${company.id}/journal-entries`)
      .set(authHeader);
    expect(jeRes.status).toBe(200);
    const settlement = (jeRes.body.data as Array<{ id: string; lines: Array<{ accountCode: string; debit: number; credit: number }> }>).find(
      (e) => e.id === settlementEntryId,
    );
    expect(settlement).toBeDefined();
    const drBank = settlement!.lines.find(
      (l) => l.accountCode === "2420" && l.debit > 0,
    );
    const crAR = settlement!.lines.find(
      (l) => l.accountCode === "2210" && l.credit > 0,
    );
    expect(drBank?.debit).toBe(605);
    expect(crAR?.credit).toBe(605);
  });
});

async function getAccountBalance(
  app: unknown,
  companyId: string,
  code: string,
): Promise<number> {
  const res = await request(app as never)
    .get(`/api/companies/${companyId}/accounts`)
    .set(authHeader);
  if (res.status !== 200) {
    throw new Error(
      `getAccountBalance: list accounts returned ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }
  const accounts = res.body.data as Array<{ code: string; balance: number }>;
  const a = accounts.find((x) => x.code === code);
  if (!a) throw new Error(`getAccountBalance: account ${code} not found`);
  return a.balance;
}
