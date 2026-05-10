// Pure trial-balance reconciliation logic for the Cosmos DB restore drill.
// Lives outside src/backend so it can be exercised by both the CLI verifier
// (scripts/verify-restore.ts) and unit tests without touching network or env.
//
// The contract is intentionally narrow: we compare two sets of posted
// JournalEntry rows (primary vs restored) for a single company and report
// whether the totals reconcile to the cent. This is the concrete deliverable
// the production roadmap calls for: "verify GL balances reconcile".
//
// Why per-account *and* per-period? A point-in-time restore that quietly
// drops or duplicates a single entry will still tie out at the account
// level if the missing rows offset; bucketing by period catches it.

import type { JournalEntry, JournalLine } from '@shared/types/entities';

/** A reconciliation-relevant slice of a JournalEntry. Lets us reuse the logic
 * with restored data that may have only the columns we need. */
export interface ReconcilableEntry {
  id: string;
  companyId: string;
  status: JournalEntry['status'];
  period: string;
  date: string;
  totalDebit: number;
  totalCredit: number;
  lines: ReconcilableLine[];
}

export interface ReconcilableLine {
  accountCode: string;
  debit: number;
  credit: number;
}

export interface AccountPeriodBalance {
  accountCode: string;
  period: string;
  debit: number;
  credit: number;
  net: number; // debit - credit
}

export interface BalanceDiff {
  accountCode: string;
  period: string;
  primary: { debit: number; credit: number; net: number };
  restored: { debit: number; credit: number; net: number };
  delta: { debit: number; credit: number; net: number };
}

export interface ReconciliationReport {
  companyId: string;
  primaryEntryCount: number;
  restoredEntryCount: number;
  primaryTotalDebit: number;
  primaryTotalCredit: number;
  restoredTotalDebit: number;
  restoredTotalCredit: number;
  /** True when both sides balance internally AND match each other. */
  isReconciled: boolean;
  /** Entries present in primary but missing from restored (by id). */
  missingFromRestored: string[];
  /** Entries present in restored but missing from primary (by id). */
  extraInRestored: string[];
  /** Per (accountCode, period) cells where debit/credit/net differ. */
  diffs: BalanceDiff[];
}

/** Smallest amount we treat as "not zero" — accounting currency is rounded
 * to cents, so anything below 0.005 is a float-noise artefact, not a real
 * discrepancy. */
const EPSILON = 0.005;

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function isZero(value: number): boolean {
  return Math.abs(value) < EPSILON;
}

/** Sum posted entries' totals. Draft / reversed are excluded — a restore
 * drill needs to verify the *posted* GL ties, not in-flight work. */
export function summarizeEntries(entries: ReconcilableEntry[]): {
  count: number;
  totalDebit: number;
  totalCredit: number;
} {
  let totalDebit = 0;
  let totalCredit = 0;
  let count = 0;
  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    count += 1;
    totalDebit += entry.totalDebit;
    totalCredit += entry.totalCredit;
  }
  return {
    count,
    totalDebit: roundCents(totalDebit),
    totalCredit: roundCents(totalCredit),
  };
}

/** Group posted entries' lines by (accountCode, period) into a balance grid. */
export function buildBalanceGrid(entries: ReconcilableEntry[]): Map<string, AccountPeriodBalance> {
  const grid = new Map<string, AccountPeriodBalance>();
  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    for (const line of entry.lines) {
      const key = `${line.accountCode}::${entry.period}`;
      const cell = grid.get(key) ?? {
        accountCode: line.accountCode,
        period: entry.period,
        debit: 0,
        credit: 0,
        net: 0,
      };
      cell.debit += line.debit;
      cell.credit += line.credit;
      cell.net = cell.debit - cell.credit;
      grid.set(key, cell);
    }
  }
  // Round at the end so accumulated float drift doesn't masquerade as a
  // genuine variance.
  for (const cell of grid.values()) {
    cell.debit = roundCents(cell.debit);
    cell.credit = roundCents(cell.credit);
    cell.net = roundCents(cell.net);
  }
  return grid;
}

/** Compare two grids. Returns one entry per (accountCode, period) cell that
 * differs by more than a cent on debit, credit, or net. */
export function diffBalanceGrids(
  primary: Map<string, AccountPeriodBalance>,
  restored: Map<string, AccountPeriodBalance>,
): BalanceDiff[] {
  const diffs: BalanceDiff[] = [];
  const keys = new Set<string>([...primary.keys(), ...restored.keys()]);

  // Stable order for human review and snapshot tests.
  const sortedKeys = [...keys].sort();

  for (const key of sortedKeys) {
    const p = primary.get(key);
    const r = restored.get(key);
    const primaryCell = p ?? zeroCellFromKey(key);
    const restoredCell = r ?? zeroCellFromKey(key);

    const dDebit = roundCents(primaryCell.debit - restoredCell.debit);
    const dCredit = roundCents(primaryCell.credit - restoredCell.credit);
    const dNet = roundCents(primaryCell.net - restoredCell.net);

    if (isZero(dDebit) && isZero(dCredit) && isZero(dNet)) continue;

    diffs.push({
      accountCode: primaryCell.accountCode,
      period: primaryCell.period,
      primary: {
        debit: primaryCell.debit,
        credit: primaryCell.credit,
        net: primaryCell.net,
      },
      restored: {
        debit: restoredCell.debit,
        credit: restoredCell.credit,
        net: restoredCell.net,
      },
      delta: { debit: dDebit, credit: dCredit, net: dNet },
    });
  }

  return diffs;
}

function zeroCellFromKey(key: string): AccountPeriodBalance {
  const [accountCode, period] = key.split('::');
  return { accountCode, period, debit: 0, credit: 0, net: 0 };
}

/** Top-level reconciliation: combines entry-level and balance-level checks. */
export function reconcile(
  companyId: string,
  primary: ReconcilableEntry[],
  restored: ReconcilableEntry[],
): ReconciliationReport {
  const primarySummary = summarizeEntries(primary);
  const restoredSummary = summarizeEntries(restored);

  const primaryIds = new Set(primary.filter((e) => e.status === 'posted').map((e) => e.id));
  const restoredIds = new Set(restored.filter((e) => e.status === 'posted').map((e) => e.id));
  const missingFromRestored = [...primaryIds].filter((id) => !restoredIds.has(id));
  const extraInRestored = [...restoredIds].filter((id) => !primaryIds.has(id));

  const primaryGrid = buildBalanceGrid(primary);
  const restoredGrid = buildBalanceGrid(restored);
  const diffs = diffBalanceGrids(primaryGrid, restoredGrid);

  const totalsTie =
    isZero(primarySummary.totalDebit - primarySummary.totalCredit) &&
    isZero(restoredSummary.totalDebit - restoredSummary.totalCredit) &&
    isZero(primarySummary.totalDebit - restoredSummary.totalDebit) &&
    isZero(primarySummary.totalCredit - restoredSummary.totalCredit);

  return {
    companyId,
    primaryEntryCount: primarySummary.count,
    restoredEntryCount: restoredSummary.count,
    primaryTotalDebit: primarySummary.totalDebit,
    primaryTotalCredit: primarySummary.totalCredit,
    restoredTotalDebit: restoredSummary.totalDebit,
    restoredTotalCredit: restoredSummary.totalCredit,
    isReconciled:
      totalsTie &&
      missingFromRestored.length === 0 &&
      extraInRestored.length === 0 &&
      diffs.length === 0,
    missingFromRestored,
    extraInRestored,
    diffs,
  };
}

/** Project a full JournalEntry into the reconcilable subset. Lets the CLI
 * pass real Cosmos rows in directly. */
export function toReconcilable(entry: JournalEntry): ReconcilableEntry {
  return {
    id: entry.id,
    companyId: entry.companyId,
    status: entry.status,
    period: entry.period,
    date: entry.date,
    totalDebit: entry.totalDebit,
    totalCredit: entry.totalCredit,
    lines: entry.lines.map((l: JournalLine) => ({
      accountCode: l.accountCode,
      debit: l.debit,
      credit: l.credit,
    })),
  };
}
