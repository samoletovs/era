// Period management & year-end close
// Handles fiscal period locking and year-end closing journals

import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import { postJournalEntry, GLError } from "./ledger.js";
import { emitEvent } from "./events.js";
import type { Account, JournalLine } from "@shared/types";

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Fiscal Period Management ───────────────────────────────

export interface FiscalPeriod {
  id: string;
  companyId: string;
  period: string;           // "2026-03"
  year: number;
  month: number;
  status: "open" | "closed" | "on-hold";
  closedAt?: string;
  closedBy?: string;
}

export async function getPeriodStatus(companyId: string, period: string): Promise<FiscalPeriod | null> {
  try {
    const { resources } = await containers.ledger().items
      .query<FiscalPeriod>({
        query: "SELECT * FROM c WHERE c.companyId = @cid AND c.period = @period AND IS_DEFINED(c.status) AND NOT IS_DEFINED(c.entryNumber) AND NOT IS_DEFINED(c.code)",
        parameters: [
          { name: "@cid", value: companyId },
          { name: "@period", value: period },
        ],
      })
      .fetchAll();
    return resources[0] ?? null;
  } catch {
    return null;
  }
}

export async function closePeriod(companyId: string, period: string, closedBy: string): Promise<FiscalPeriod> {
  let fp = await getPeriodStatus(companyId, period);
  const now = new Date().toISOString();

  if (fp) {
    if (fp.status === "closed") throw new GLError("ALREADY_CLOSED", `Period ${period} is already closed`);
    fp.status = "closed";
    fp.closedAt = now;
    fp.closedBy = closedBy;
    await containers.ledger().item(fp.id, companyId).replace(fp);
  } else {
    const [y, m] = period.split("-").map(Number);
    fp = {
      id: `${companyId}-period-${period}`,
      companyId,
      period,
      year: y,
      month: m,
      status: "closed",
      closedAt: now,
      closedBy,
    };
    await containers.ledger().items.create(fp);
  }

  await emitEvent({
    companyId,
    type: "period.closed",
    actor: closedBy,
    data: { period },
  });

  return fp;
}

export async function reopenPeriod(companyId: string, period: string, openedBy: string): Promise<FiscalPeriod> {
  const fp = await getPeriodStatus(companyId, period);
  if (!fp) throw new GLError("NOT_FOUND", `Period ${period} not found`);
  if (fp.status === "open") throw new GLError("ALREADY_OPEN", `Period ${period} is already open`);

  fp.status = "open";
  fp.closedAt = undefined;
  fp.closedBy = undefined;
  await containers.ledger().item(fp.id, companyId).replace(fp);

  await emitEvent({
    companyId,
    type: "period.reopened",
    actor: openedBy,
    data: { period },
  });

  return fp;
}

// ─── Year-End Close ─────────────────────────────────────────

export async function yearEndClose(
  companyId: string,
  fiscalYear: number,
  createdBy: string
): Promise<{ closingEntry: any; periodsClosedCount: number }> {
  // 1. Get all revenue and expense accounts with balances
  const { resources: accounts } = await containers.ledger().items
    .query<Account>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND IS_DEFINED(c.code) AND IS_DEFINED(c.normalSide) AND c.isPostable = true AND c.balance != 0 AND (c.type = 'revenue' OR c.type = 'expense')",
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();

  if (accounts.length === 0) {
    throw new GLError("NO_BALANCES", "No revenue or expense balances to close");
  }

  // 2. Build closing journal lines — zero out each revenue/expense account
  const lines: JournalLine[] = [];
  let netResult = 0;

  for (const acct of accounts) {
    const balance = acct.balance;
    if (balance === 0) continue;

    // Revenue accounts (credit-normal): debit to zero out
    // Expense accounts (debit-normal): credit to zero out
    if (acct.type === "revenue") {
      lines.push({
        accountCode: acct.code,
        accountName: acct.name,
        debit: Math.abs(balance),
        credit: 0,
        description: `Year-end close — ${acct.name}`,
      });
      netResult += Math.abs(balance); // Revenue is positive
    } else {
      lines.push({
        accountCode: acct.code,
        accountName: acct.name,
        debit: 0,
        credit: Math.abs(balance),
        description: `Year-end close — ${acct.name}`,
      });
      netResult -= Math.abs(balance); // Expenses reduce result
    }
  }

  // 3. Transfer net result to retained earnings (3310)
  const retainedEarningsCode = "3310";
  if (netResult > 0) {
    // Profit — credit retained earnings
    lines.push({
      accountCode: retainedEarningsCode,
      accountName: "Retained earnings prior years",
      debit: 0,
      credit: roundCurrency(netResult),
      description: `FY${fiscalYear} net profit transferred`,
    });
  } else if (netResult < 0) {
    // Loss — debit retained earnings
    lines.push({
      accountCode: retainedEarningsCode,
      accountName: "Retained earnings prior years",
      debit: roundCurrency(Math.abs(netResult)),
      credit: 0,
      description: `FY${fiscalYear} net loss transferred`,
    });
  }

  // 4. Post closing journal entry
  const lastDay = `${fiscalYear}-12-31`;
  const closingEntry = await postJournalEntry({
    companyId,
    date: lastDay,
    description: `Year-end closing — FY${fiscalYear}`,
    lines,
    sourceType: "closing",
    createdBy,
  });

  // 5. Close all periods for the fiscal year
  let periodsClosedCount = 0;
  for (let m = 1; m <= 12; m++) {
    const period = `${fiscalYear}-${String(m).padStart(2, "0")}`;
    try {
      await closePeriod(companyId, period, createdBy);
      periodsClosedCount++;
    } catch {
      // Already closed — skip
    }
  }

  await emitEvent({
    companyId,
    type: "year-end.closed",
    actor: createdBy,
    journalEntryId: closingEntry.id,
    data: { fiscalYear, netResult: roundCurrency(netResult), periodsClosedCount },
  });

  return { closingEntry, periodsClosedCount };
}
