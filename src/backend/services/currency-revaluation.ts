// Currency revaluation service — month-end foreign currency revaluation
// Follows D365 F&O GL foreign currency revaluation model:
//   - Revalues GL accounts flagged with isForeignCurrencyRevaluation
//   - Posts unrealized gain/loss entries using closing exchange rate
//   - Incremental: posts difference from current balance vs. revalued balance

import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import { postJournalEntry, GLError } from "./ledger.js";
import { emitEvent } from "./events.js";
import { getActiveRule } from "./posting-rules.js";
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from "./cache.js";
import type {
  Account,
  Company,
  ExchangeRate,
  ExchangeRateType,
  JournalLine,
} from "@shared/types";
import type { SystemRateSource } from "@shared/types";

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Exchange Rate Lookup ───────────────────────────────────

/**
 * Get the effective exchange rate for a currency pair on a given date.
 * Falls back to the most recent rate before the given date.
 */
export async function getExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  rateType: ExchangeRateType,
  effectiveDate: string,
  companyId?: string,
): Promise<number> {
  if (fromCurrency === toCurrency) return 1;

  // Check cache first
  const cacheKey = CACHE_KEYS.exchangeRate(
    fromCurrency,
    toCurrency,
    effectiveDate,
  );
  const cached = cacheGet<number>(cacheKey);
  if (cached !== undefined) return cached;

  const { resources } = await containers
    .ledger()
    .items.query<ExchangeRate>({
      query: `SELECT TOP 1 * FROM c
              WHERE c.docType = 'exchange-rate'
                AND c.fromCurrency = @from
                AND c.toCurrency = @to
                AND c.rateType = @rateType
                AND c.effectiveDate <= @date
              ORDER BY c.effectiveDate DESC`,
      parameters: [
        { name: "@from", value: fromCurrency },
        { name: "@to", value: toCurrency },
        { name: "@rateType", value: rateType },
        { name: "@date", value: effectiveDate },
      ],
    })
    .fetchAll();

  if (resources.length > 0) {
    cacheSet(cacheKey, resources[0].rate, CACHE_TTL.EXCHANGE_RATE);
    return resources[0].rate;
  }

  // Fallback: try the reverse direction
  const { resources: reverse } = await containers
    .ledger()
    .items.query<ExchangeRate>({
      query: `SELECT TOP 1 * FROM c
              WHERE c.docType = 'exchange-rate'
                AND c.fromCurrency = @to
                AND c.toCurrency = @from
                AND c.rateType = @rateType
                AND c.effectiveDate <= @date
              ORDER BY c.effectiveDate DESC`,
      parameters: [
        { name: "@to", value: toCurrency },
        { name: "@from", value: fromCurrency },
        { name: "@rateType", value: rateType },
        { name: "@date", value: effectiveDate },
      ],
    })
    .fetchAll();

  if (reverse.length > 0) {
    const rate = roundCurrency(1 / reverse[0].rate);
    cacheSet(cacheKey, rate, CACHE_TTL.EXCHANGE_RATE);
    return rate;
  }

  // Fallback: try "daily" rate type if requested type not found
  if (rateType !== "daily") {
    return getExchangeRate(
      fromCurrency,
      toCurrency,
      "daily",
      effectiveDate,
      companyId,
    );
  }

  throw new GLError(
    "RATE_NOT_FOUND",
    `No exchange rate found for ${fromCurrency}→${toCurrency} (${rateType}) on or before ${effectiveDate}`,
  );
}

// ─── Save Exchange Rate ─────────────────────────────────────

export async function saveExchangeRate(
  rate: Omit<ExchangeRate, "id" | "createdAt">,
): Promise<ExchangeRate> {
  const record: ExchangeRate = {
    id: uuidv4(),
    docType: "exchange-rate",
    ...rate,
    createdAt: new Date().toISOString(),
  };
  await containers.ledger().items.create(record);
  return record;
}

// ─── Import ECB Exchange Rates ──────────────────────────────

/**
 * Import daily exchange rates from the European Central Bank.
 * ECB publishes rates as 1 EUR = X foreign currency.
 */
/**
 * Import daily exchange rates from a system source (ECB or Bank of Latvia).
 * ECB publishes rates at ~16:00 CET. Previous day's rate is used for today (standard practice).
 * Bank of Latvia mirrors ECB rates for EUR-based pairs.
 * System-source rates are shared globally — no companyId needed.
 */
export async function importSystemRates(
  source: SystemRateSource,
  date: string,
): Promise<{ imported: number; date: string; source: string }> {
  if (source === "ecb" || source === "latvian-bank") {
    // Both use the ECB XML feed; Bank of Latvia mirrors ECB since Latvia joined EUR in 2014
    return importEcbXml(date, source);
  }
  throw new GLError("INVALID_SOURCE", `Unknown system rate source: ${source}`);
}

async function importEcbXml(
  date: string,
  source: SystemRateSource,
): Promise<{ imported: number; date: string; source: string }> {
  const url = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
  const response = await fetch(url);
  if (!response.ok)
    throw new GLError(
      "ECB_FETCH_FAILED",
      `ECB rate fetch failed: ${response.status}`,
    );

  const xml = await response.text();
  const rateRegex = /currency='([A-Z]{3})'\s+rate='([\d.]+)'/g;
  let match;
  let imported = 0;

  while ((match = rateRegex.exec(xml)) !== null) {
    const [, currency, rateStr] = match;
    const rate = parseFloat(rateStr);
    if (rate > 0) {
      await saveExchangeRate({
        fromCurrency: "EUR",
        toCurrency: currency,
        rateType: "daily",
        rate,
        effectiveDate: date,
        source,
      });
      imported++;
    }
  }

  return { imported, date, source };
}

/** @deprecated Use importSystemRates("ecb", date) instead */
export async function importEcbRates(
  date: string,
  rateType: ExchangeRateType = "daily",
): Promise<{ imported: number; date: string }> {
  return importSystemRates("ecb", date);
}

// ─── Foreign Currency Revaluation ───────────────────────────

export interface RevaluationResult {
  accountsRevalued: number;
  totalUnrealizedGain: number;
  totalUnrealizedLoss: number;
  journalEntryId?: string;
  details: RevaluationDetail[];
}

export interface RevaluationDetail {
  accountCode: string;
  accountName: string;
  foreignCurrency: string;
  foreignBalance: number;
  currentAccountingBalance: number;
  revaluedAccountingBalance: number;
  adjustmentAmount: number; // positive = gain, negative = loss
  closingRate: number;
}

/**
 * Run foreign currency revaluation for a company at period-end.
 *
 * Process (per D365 F&O model):
 * 1. Find all GL accounts flagged with isForeignCurrencyRevaluation = true
 * 2. For each, determine the foreign currency balance from journal lines
 * 3. Get closing exchange rate for period-end date
 * 4. Calculate what the accounting-currency balance should be at the closing rate
 * 5. Post difference as unrealized gain/loss
 *
 * This is incremental: it only posts the difference, not the full revaluation.
 */
export async function runForeignCurrencyRevaluation(
  companyId: string,
  period: string,
  actor: string,
): Promise<RevaluationResult> {
  // Load company settings
  const { resource: company } = await containers
    .companies()
    .item(companyId, companyId)
    .read<Company>();
  if (!company) throw new GLError("NOT_FOUND", "Company not found");

  const currencySettings = company.settings.currency;
  if (!currencySettings) {
    return {
      accountsRevalued: 0,
      totalUnrealizedGain: 0,
      totalUnrealizedLoss: 0,
      details: [],
    };
  }

  const accountingCurrency = currencySettings.accountingCurrency;

  // Resolve FX gain/loss accounts from posting rules (zero-config: no manual setup needed)
  const fxRule = await getActiveRule(company.country || "LV", "fx-revaluation");
  if (!fxRule) {
    throw new GLError(
      "CONFIG_MISSING",
      `No FX revaluation posting rule found for country ${company.country || "LV"}. Add a rule with documentType 'fx-revaluation'.`,
    );
  }
  const gainLine = fxRule.lines.find(
    (l) => l.amountExpr === "revaluation.gain",
  );
  const lossLine = fxRule.lines.find(
    (l) => l.amountExpr === "revaluation.loss",
  );
  if (!gainLine || !lossLine) {
    throw new GLError(
      "CONFIG_MISSING",
      "FX revaluation posting rule must define lines for 'revaluation.gain' and 'revaluation.loss'",
    );
  }
  const gainAccount = gainLine.accountCode;
  const lossAccount = lossLine.accountCode;

  // 1. Get accounts flagged for revaluation
  const { resources: accounts } = await containers
    .ledger()
    .items.query<Account>({
      query: `SELECT * FROM c
              WHERE c.companyId = @cid
                AND c.docType = 'account'
                AND c.isPostable = true
                AND c.isForeignCurrencyRevaluation = true`,
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();

  if (accounts.length === 0) {
    return {
      accountsRevalued: 0,
      totalUnrealizedGain: 0,
      totalUnrealizedLoss: 0,
      details: [],
    };
  }

  // Calculate period-end date
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const periodEndDate = `${period}-${String(lastDay).padStart(2, "0")}`;

  // 2. For each account, get foreign currency balances from posted journal lines
  const details: RevaluationDetail[] = [];
  const lines: JournalLine[] = [];

  for (const account of accounts) {
    const foreignCurrency = account.currencyCode;
    if (!foreignCurrency || foreignCurrency === accountingCurrency) continue;

    // Get all posted journal lines for this account that have foreign currency
    const { resources: entries } = await containers
      .ledger()
      .items.query<any>({
        query: `SELECT * FROM c
                WHERE c.companyId = @cid
                  AND c.docType = 'journal-entry'
                  AND c.status = 'posted'
                  AND c.date <= @endDate`,
        parameters: [
          { name: "@cid", value: companyId },
          { name: "@endDate", value: periodEndDate },
        ],
      })
      .fetchAll();

    // Sum foreign currency amounts and accounting currency amounts for this account
    let foreignBalance = 0;
    let accountingBalance = 0;

    for (const entry of entries) {
      for (const line of entry.lines || []) {
        if (line.accountCode !== account.code) continue;
        if (line.currencyCode === foreignCurrency) {
          const foreignAmount = line.amountInCurrency || 0;
          const netDebitCredit = line.debit - line.credit;
          // Foreign balance tracks the transaction currency amounts
          foreignBalance +=
            foreignAmount !== 0
              ? line.debit > 0
                ? Math.abs(foreignAmount)
                : -Math.abs(foreignAmount)
              : netDebitCredit;
          accountingBalance += netDebitCredit;
        }
      }
    }

    if (foreignBalance === 0) continue;

    // 3. Get closing exchange rate (= daily rate on period-end date, per IAS 21)
    const closingRate = await getExchangeRate(
      foreignCurrency,
      accountingCurrency,
      "daily",
      periodEndDate,
      companyId,
    );

    // 4. Calculate what accounting balance should be at closing rate
    const revaluedBalance = roundCurrency(foreignBalance * closingRate);
    const adjustment = roundCurrency(revaluedBalance - accountingBalance);

    if (Math.abs(adjustment) < 0.01) continue; // Skip negligible differences

    details.push({
      accountCode: account.code,
      accountName: account.name,
      foreignCurrency,
      foreignBalance: roundCurrency(foreignBalance),
      currentAccountingBalance: roundCurrency(accountingBalance),
      revaluedAccountingBalance: revaluedBalance,
      adjustmentAmount: adjustment,
      closingRate,
    });

    // 5. Build journal lines for the revaluation entry
    if (adjustment > 0) {
      // Unrealized gain: debit account, credit gain
      lines.push({
        accountCode: account.code,
        accountName: account.name,
        debit: adjustment,
        credit: 0,
        description: `FX revaluation ${period}: ${foreignCurrency} ${roundCurrency(foreignBalance)} @ ${closingRate}`,
        currencyCode: foreignCurrency,
      });
      lines.push({
        accountCode: gainAccount,
        accountName: "Unrealized exchange gain",
        debit: 0,
        credit: adjustment,
        description: `FX revaluation ${period}: ${account.code} ${account.name}`,
      });
    } else {
      // Unrealized loss: debit loss, credit account
      const absAdj = Math.abs(adjustment);
      lines.push({
        accountCode: lossAccount,
        accountName: "Unrealized exchange loss",
        debit: absAdj,
        credit: 0,
        description: `FX revaluation ${period}: ${account.code} ${account.name}`,
      });
      lines.push({
        accountCode: account.code,
        accountName: account.name,
        debit: 0,
        credit: absAdj,
        description: `FX revaluation ${period}: ${foreignCurrency} ${roundCurrency(foreignBalance)} @ ${closingRate}`,
        currencyCode: foreignCurrency,
      });
    }
  }

  const result: RevaluationResult = {
    accountsRevalued: details.length,
    totalUnrealizedGain: roundCurrency(
      details
        .filter((d) => d.adjustmentAmount > 0)
        .reduce((s, d) => s + d.adjustmentAmount, 0),
    ),
    totalUnrealizedLoss: roundCurrency(
      details
        .filter((d) => d.adjustmentAmount < 0)
        .reduce((s, d) => s + Math.abs(d.adjustmentAmount), 0),
    ),
    details,
  };

  // 6. Post the revaluation journal entry if there are adjustments
  if (lines.length > 0) {
    const entry = await postJournalEntry({
      companyId,
      date: periodEndDate,
      description: `Foreign currency revaluation — ${period}`,
      lines,
      sourceType: "adjustment",
      createdBy: actor,
    });
    result.journalEntryId = entry.id;

    await emitEvent({
      companyId,
      type: "currency.revaluation",
      actor,
      journalEntryId: entry.id,
      data: {
        period,
        accountsRevalued: result.accountsRevalued,
        totalGain: result.totalUnrealizedGain,
        totalLoss: result.totalUnrealizedLoss,
      },
    });
  }

  return result;
}
