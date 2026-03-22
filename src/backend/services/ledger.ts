import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import { emitEvent } from "./events.js";
import type { JournalEntry, JournalLine, Account } from "@shared/types";

// ─── Validation ─────────────────────────────────────────────

export class GLError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "GLError";
  }
}

function validateEntry(entry: { lines: JournalLine[]; date: string; description: string }) {
  if (!entry.lines || entry.lines.length < 2) {
    throw new GLError("MIN_LINES", "Journal entry must have at least 2 lines");
  }
  if (!entry.date) {
    throw new GLError("MISSING_DATE", "Journal entry must have a date");
  }
  if (!entry.description?.trim()) {
    throw new GLError("MISSING_DESC", "Journal entry must have a description");
  }

  const totalDebit = roundCurrency(entry.lines.reduce((sum, l) => sum + l.debit, 0));
  const totalCredit = roundCurrency(entry.lines.reduce((sum, l) => sum + l.credit, 0));

  if (totalDebit !== totalCredit) {
    throw new GLError(
      "UNBALANCED",
      `Debits (${totalDebit}) must equal credits (${totalCredit})`
    );
  }
  if (totalDebit === 0) {
    throw new GLError("ZERO_ENTRY", "Journal entry total must be greater than zero");
  }

  for (const line of entry.lines) {
    if (line.debit < 0 || line.credit < 0) {
      throw new GLError("NEGATIVE_AMOUNT", "Amounts must be non-negative");
    }
    if (line.debit > 0 && line.credit > 0) {
      throw new GLError("BOTH_SIDES", "A line cannot have both debit and credit");
    }
    if (line.debit === 0 && line.credit === 0) {
      throw new GLError("ZERO_LINE", "A line must have either a debit or credit amount");
    }
    if (!line.accountCode) {
      throw new GLError("MISSING_ACCOUNT", "Each line must reference an account code");
    }
  }
}

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Generate entry number ──────────────────────────────────

async function nextEntryNumber(companyId: string, period: string): Promise<string> {
  const { resources } = await containers.ledger().items
    .query<{ entryNumber: string }>({
      query: "SELECT c.entryNumber FROM c WHERE c.companyId = @cid AND c.period = @period AND IS_DEFINED(c.entryNumber) ORDER BY c.entryNumber DESC OFFSET 0 LIMIT 1",
      parameters: [
        { name: "@cid", value: companyId },
        { name: "@period", value: period },
      ],
    })
    .fetchAll();

  if (resources.length === 0) {
    return `${period}-0001`;
  }
  const lastNum = parseInt(resources[0].entryNumber.split("-").pop()!, 10);
  return `${period}-${String(lastNum + 1).padStart(4, "0")}`;
}

// ─── Post journal entry ─────────────────────────────────────

interface PostEntryInput {
  companyId: string;
  date: string;
  description: string;
  lines: JournalLine[];
  sourceType?: JournalEntry["sourceType"];
  sourceId?: string;
  createdBy: string;
}

export async function postJournalEntry(input: PostEntryInput): Promise<JournalEntry> {
  validateEntry(input);

  const period = input.date.slice(0, 7); // "2026-03"
  const entryNumber = await nextEntryNumber(input.companyId, period);
  const now = new Date().toISOString();

  const totalDebit = roundCurrency(input.lines.reduce((sum, l) => sum + l.debit, 0));
  const totalCredit = roundCurrency(input.lines.reduce((sum, l) => sum + l.credit, 0));

  const entry: JournalEntry = {
    id: uuidv4(),
    companyId: input.companyId,
    entryNumber,
    date: input.date,
    description: input.description,
    lines: input.lines,
    status: "posted",
    period,
    sourceType: input.sourceType || "manual",
    sourceId: input.sourceId,
    totalDebit,
    totalCredit,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  };

  // Save journal entry
  await containers.ledger().items.create(entry);

  // Update account balances
  await updateAccountBalances(input.companyId, input.lines);

  // Emit event
  await emitEvent({
    companyId: input.companyId,
    type: "entry.posted",
    actor: input.createdBy,
    documentType: "journal-entry",
    documentId: entry.id,
    journalEntryId: entry.id,
    data: { entryNumber: entry.entryNumber, sourceType: entry.sourceType, totalDebit: entry.totalDebit },
  });

  return entry;
}

// ─── Update account balances ────────────────────────────────

async function updateAccountBalances(companyId: string, lines: JournalLine[]) {
  // Group by account code (a single entry might have multiple lines for the same account)
  const deltas = new Map<string, number>();
  for (const line of lines) {
    const current = deltas.get(line.accountCode) || 0;
    deltas.set(line.accountCode, current + line.debit - line.credit);
  }

  for (const [accountCode, delta] of deltas) {
    const accountId = `${companyId}-acct-${accountCode}`;
    try {
      const { resource: account, etag } = await containers.ledger()
        .item(accountId, companyId)
        .read<Account>();

      if (account) {
        // For accounts with credit normal side, flip the sign
        const signedDelta = account.normalSide === "credit" ? -delta : delta;
        account.balance = roundCurrency(account.balance + signedDelta);
        account.updatedAt = new Date().toISOString();
        await containers.ledger().item(accountId, companyId).replace(account, {
          accessCondition: { type: "IfMatch", condition: etag! },
        });
      }
    } catch {
      // Account not found or etag conflict — skip (validation should catch this upstream)
    }
  }
}

// ─── Reverse journal entry ──────────────────────────────────

export async function reverseJournalEntry(
  companyId: string,
  entryId: string,
  createdBy: string
): Promise<JournalEntry> {
  const { resource: original } = await containers.ledger()
    .item(entryId, companyId)
    .read<JournalEntry>();

  if (!original) throw new GLError("NOT_FOUND", "Journal entry not found");
  if (original.status === "reversed") throw new GLError("ALREADY_REVERSED", "Entry already reversed");

  // Mark original as reversed
  original.status = "reversed";
  original.updatedAt = new Date().toISOString();
  await containers.ledger().item(entryId, companyId).replace(original);

  // Emit reversal event
  await emitEvent({
    companyId,
    type: "entry.reversed",
    actor: createdBy,
    documentType: "journal-entry",
    documentId: entryId,
    journalEntryId: entryId,
    data: { entryNumber: original.entryNumber },
  });

  // Create reversing entry with flipped debits/credits
  const reversedLines: JournalLine[] = original.lines.map((l) => ({
    ...l,
    debit: l.credit,
    credit: l.debit,
  }));

  return postJournalEntry({
    companyId,
    date: new Date().toISOString().slice(0, 10),
    description: `Reversal of ${original.entryNumber}: ${original.description}`,
    lines: reversedLines,
    sourceType: "adjustment",
    sourceId: entryId,
    createdBy,
  });
}

// ─── Trial Balance ──────────────────────────────────────────

export interface TrialBalanceLine {
  accountCode: string;
  accountName: string;
  accountType: string;
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  closingBalance: number;
}

export async function getTrialBalance(companyId: string, from?: string, to?: string): Promise<{
  lines: TrialBalanceLine[];
  periodStart: string;
  periodEnd: string;
  totalOpeningBalance: number;
  totalPeriodDebit: number;
  totalPeriodCredit: number;
  totalClosingBalance: number;
}> {
  const periodStart = from || `${new Date().getFullYear()}-01-01`;
  const periodEnd = to || new Date().toISOString().slice(0, 10);

  // Get all postable accounts
  const { resources: accounts } = await containers.ledger().items
    .query<Account>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND IS_DEFINED(c.code) AND IS_DEFINED(c.normalSide) AND (c.isPostable = true OR NOT IS_DEFINED(c.isPostable)) ORDER BY c.code",
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();

  // Get all posted journal entries
  const { resources: allEntries } = await containers.ledger().items
    .query<any>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND IS_DEFINED(c.entryNumber) AND c.status = 'posted'",
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();

  // Calculate opening balances (entries before period start) and period movements
  const openingDebits = new Map<string, number>();
  const openingCredits = new Map<string, number>();
  const periodDebits = new Map<string, number>();
  const periodCredits = new Map<string, number>();

  for (const entry of allEntries) {
    const isBefore = entry.date < periodStart;
    const isInPeriod = entry.date >= periodStart && entry.date <= periodEnd;

    for (const line of (entry.lines || [])) {
      const code = line.accountCode;
      if (!code) continue;

      if (isBefore) {
        openingDebits.set(code, (openingDebits.get(code) || 0) + (line.debit || 0));
        openingCredits.set(code, (openingCredits.get(code) || 0) + (line.credit || 0));
      } else if (isInPeriod) {
        periodDebits.set(code, (periodDebits.get(code) || 0) + (line.debit || 0));
        periodCredits.set(code, (periodCredits.get(code) || 0) + (line.credit || 0));
      }
    }
  }

  const lines: TrialBalanceLine[] = [];
  let totalOpeningBalance = 0;
  let totalPeriodDebit = 0;
  let totalPeriodCredit = 0;
  let totalClosingBalance = 0;

  for (const account of accounts) {
    const od = roundCurrency(openingDebits.get(account.code) || 0);
    const oc = roundCurrency(openingCredits.get(account.code) || 0);
    const pd = roundCurrency(periodDebits.get(account.code) || 0);
    const pc = roundCurrency(periodCredits.get(account.code) || 0);

    // Opening balance: net of all entries before period
    const openingNet = account.normalSide === "credit" ? (oc - od) : (od - oc);
    const periodNet = account.normalSide === "credit" ? (pc - pd) : (pd - pc);
    const closingBalance = roundCurrency(openingNet + periodNet);

    // Skip accounts with no activity and no balance
    if (od === 0 && oc === 0 && pd === 0 && pc === 0) continue;

    lines.push({
      accountCode: account.code,
      accountName: account.name,
      accountType: account.type,
      openingBalance: roundCurrency(openingNet),
      periodDebit: pd,
      periodCredit: pc,
      closingBalance,
    });

    totalOpeningBalance += openingNet;
    totalPeriodDebit += pd;
    totalPeriodCredit += pc;
    totalClosingBalance += closingBalance;
  }

  return {
    lines,
    periodStart,
    periodEnd,
    totalOpeningBalance: roundCurrency(totalOpeningBalance),
    totalPeriodDebit: roundCurrency(totalPeriodDebit),
    totalPeriodCredit: roundCurrency(totalPeriodCredit),
    totalClosingBalance: roundCurrency(totalClosingBalance),
  };
}

// ─── Account balance query ──────────────────────────────────

export async function getAccountBalance(companyId: string, accountCode: string): Promise<number> {
  const accountId = `${companyId}-acct-${accountCode}`;
  try {
    const { resource } = await containers.ledger()
      .item(accountId, companyId)
      .read<Account>();
    return resource?.balance ?? 0;
  } catch {
    return 0;
  }
}
