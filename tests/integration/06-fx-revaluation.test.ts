/**
 * Test #6 — Foreign currency revaluation (Latvia).
 *
 * Validates the period-end IAS 21 / Cabinet Regulation No. 775 workflow:
 *   - account flagged for FX revaluation, denominated in a foreign currency,
 *   - posted journal entries leave a non-zero balance in that currency,
 *   - new closing-rate exchange rate is published for period-end,
 *   - revaluation calculates the unrealized FX gain/loss and posts the
 *     adjustment to accounts 5220 (gain) / 6420 (loss) per the LV rule.
 *
 * Setup uses the cosmos fake directly to bypass two limitations of the public
 * API: there is no account-update endpoint that exposes the
 * `isForeignCurrencyRevaluation` flag, and the journal-entry POST schema
 * strips `amountInCurrency` from line items. Both fields are required by the
 * revaluation engine, so we seed them at the storage layer.
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { getApp, authHeader } from "./_harness/test-server.js";
import { createTestCompany } from "./_harness/factories.js";
import { getFakeContainer } from "./_harness/cosmos-fake.js";

describe("foreign currency revaluation (Latvia)", () => {
  it("posts unrealized FX gain to 5220 when the closing rate strengthens against EUR", async () => {
    const app = await getApp();

    // Seed the LV rule library so fx-revaluation rule is available.
    const seedRes = await request(app as never)
      .post(`/api/rules/seed`)
      .set(authHeader)
      .send({ country: "LV" });
    expect(seedRes.status).toBe(200);

    const company = await createTestCompany(app, { name: "SIA FX Test" });

    // ─── Flag account 2420 (Bank) as USD-denominated and revaluable ─
    const ledger = getFakeContainer("ledger");
    const accountId = `${company.id}-acct-2420`;
    const { resource: account } = await ledger
      .item(accountId, company.id)
      .read<Record<string, unknown>>();
    expect(account).toBeDefined();
    await ledger.item(accountId, company.id).replace({
      ...(account as Record<string, unknown>),
      currencyCode: "USD",
      isForeignCurrencyRevaluation: true,
      balance: 900, // Will be set by the seeded JE below.
      updatedAt: new Date().toISOString(),
    });

    // ─── Seed exchange rates ────────────────────────────────
    // Initial rate (April 1): USD→EUR = 0.90.
    // Closing rate (April 30): USD→EUR = 0.95 → unrealized gain on USD assets.
    const now = new Date().toISOString();
    await ledger.items.create({
      id: `rate-usd-eur-2026-04-01`,
      docType: "exchange-rate",
      fromCurrency: "USD",
      toCurrency: "EUR",
      rateType: "daily",
      rate: 0.9,
      effectiveDate: "2026-04-01",
      source: "manual",
      createdAt: now,
    });
    await ledger.items.create({
      id: `rate-usd-eur-2026-04-30`,
      docType: "exchange-rate",
      fromCurrency: "USD",
      toCurrency: "EUR",
      rateType: "daily",
      rate: 0.95,
      effectiveDate: "2026-04-30",
      source: "manual",
      createdAt: now,
    });

    // ─── Seed a balanced journal entry directly ────────────
    // DR 2420 USD 1000 = EUR 900 (USD bank deposit at opening rate)
    // CR 3110 (Equity, EUR-only)        = EUR 900
    // The equity account isn't flagged for revaluation, so it's untouched.
    const equityCode = await pickPostableEquityAccount(ledger, company.id);
    await ledger.items.create({
      id: `je-fx-seed-${company.id}`,
      docType: "journal-entry",
      companyId: company.id,
      entryNumber: "TEST-FX-001",
      date: "2026-04-01",
      description: "USD capital injection (test seed)",
      status: "posted",
      period: "2026-04",
      sourceType: "manual",
      totalDebit: 900,
      totalCredit: 900,
      lines: [
        {
          accountCode: "2420",
          accountName: "Bank — USD",
          debit: 900,
          credit: 0,
          currencyCode: "USD",
          exchangeRate: 0.9,
          amountInCurrency: 1000,
        },
        {
          accountCode: equityCode,
          accountName: "Equity",
          debit: 0,
          credit: 900,
        },
      ],
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: "dev-user",
    });

    // ─── Trigger FX revaluation ─────────────────────────────
    const revalRes = await request(app as never)
      .post(`/api/companies/${company.id}/currency-revaluation`)
      .set(authHeader)
      .send({ period: "2026-04" });
    expect(revalRes.status).toBe(200);

    const result = revalRes.body.data as {
      accountsRevalued: number;
      totalUnrealizedGain: number;
      totalUnrealizedLoss: number;
      journalEntryId?: string;
      details: Array<{
        accountCode: string;
        foreignCurrency: string;
        foreignBalance: number;
        currentAccountingBalance: number;
        revaluedAccountingBalance: number;
        adjustmentAmount: number;
        closingRate: number;
      }>;
    };

    expect(result.accountsRevalued).toBe(1);
    expect(result.totalUnrealizedGain).toBe(50);
    expect(result.totalUnrealizedLoss).toBe(0);
    expect(result.journalEntryId).toBeDefined();

    const detail = result.details[0];
    expect(detail.accountCode).toBe("2420");
    expect(detail.foreignCurrency).toBe("USD");
    expect(detail.foreignBalance).toBe(1000);
    expect(detail.currentAccountingBalance).toBe(900);
    expect(detail.revaluedAccountingBalance).toBe(950);
    expect(detail.adjustmentAmount).toBe(50);
    expect(detail.closingRate).toBe(0.95);

    // ─── Verify the posted FX revaluation journal entry ─────
    const jeRes = await request(app as never)
      .get(`/api/companies/${company.id}/journal-entries`)
      .set(authHeader);
    expect(jeRes.status).toBe(200);
    const entries = jeRes.body.data as Array<{
      id: string;
      sourceType?: string;
      lines: Array<{ accountCode: string; debit: number; credit: number }>;
    }>;
    const fxEntry = entries.find((e) => e.id === result.journalEntryId);
    expect(fxEntry).toBeDefined();
    expect(fxEntry!.sourceType).toBe("adjustment");

    const dr2420 = fxEntry!.lines.find(
      (l) => l.accountCode === "2420" && l.debit > 0,
    );
    expect(dr2420?.debit).toBe(50);

    const cr5220 = fxEntry!.lines.find(
      (l) => l.accountCode === "5220" && l.credit > 0,
    );
    expect(cr5220?.credit).toBe(50);

    const totalDebit = fxEntry!.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = fxEntry!.lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(50);
    expect(totalCredit).toBe(50);
  });
});

/**
 * Look up any postable equity-type account in the company's chart of accounts
 * to use as the contra side of the seeded journal entry. We don't assume a
 * specific code because the LV CoA seeded by `buildAccountsForCompany` may
 * change over time.
 */
async function pickPostableEquityAccount(
  ledger: ReturnType<typeof getFakeContainer>,
  companyId: string,
): Promise<string> {
  // The fake supports SELECT * with WHERE on docType and companyId.
  const { resources } = await ledger.items
    .query<{ code: string; type: string; isPostable: boolean }>({
      query: `SELECT * FROM c
              WHERE c.companyId = @cid
                AND c.docType = 'account'
                AND c.type = 'equity'
                AND c.isPostable = true`,
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();
  if (resources.length === 0) {
    throw new Error("No postable equity account found in seeded LV CoA");
  }
  return resources[0].code;
}
