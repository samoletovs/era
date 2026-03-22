// Bank reconciliation service
// Import bank statements, auto-match, manual match, reconcile

import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import { postJournalEntry, GLError } from "./ledger.js";
import { emitEvent } from "./events.js";
import type { JournalLine } from "@shared/types";

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Types ──────────────────────────────────────────────────

export interface BankStatementLine {
  id: string;
  date: string;
  description: string;
  reference?: string;
  amount: number;           // positive = credit (deposit), negative = debit (payment)
  counterparty?: string;
  status: "unmatched" | "matched" | "posted";
  matchedJournalEntryId?: string;
}

export interface BankReconciliation {
  id: string;
  companyId: string;
  bankAccountCode: string;  // GL account code (e.g. "2420")
  bankIban?: string;
  statementDate: string;
  statementBalance: number;
  bookBalance: number;
  lines: BankStatementLine[];
  status: "in-progress" | "reconciled";
  reconciledAt?: string;
  reconciledBy?: string;
  createdAt: string;
  createdBy: string;
}

// ─── Import Bank Statement ──────────────────────────────────

interface ImportStatementInput {
  companyId: string;
  bankAccountCode: string;
  bankIban?: string;
  statementDate: string;
  statementBalance: number;
  lines: Array<{
    date: string;
    description: string;
    reference?: string;
    amount: number;
    counterparty?: string;
  }>;
  createdBy: string;
}

export async function importBankStatement(input: ImportStatementInput): Promise<BankReconciliation> {
  // Get current book balance for the bank account
  const accountId = `${input.companyId}-acct-${input.bankAccountCode}`;
  let bookBalance = 0;
  try {
    const { resource } = await containers.ledger().item(accountId, input.companyId).read<any>();
    bookBalance = resource?.balance ?? 0;
  } catch { /* account not found */ }

  const now = new Date().toISOString();
  const recon: BankReconciliation = {
    id: uuidv4(),
    companyId: input.companyId,
    bankAccountCode: input.bankAccountCode,
    bankIban: input.bankIban,
    statementDate: input.statementDate,
    statementBalance: input.statementBalance,
    bookBalance,
    lines: input.lines.map(l => ({
      id: uuidv4(),
      ...l,
      status: "unmatched" as const,
    })),
    status: "in-progress",
    createdAt: now,
    createdBy: input.createdBy,
  };

  await containers.documents().items.create(recon);

  // Auto-match: try to find GL entries matching statement lines
  await autoMatchStatementLines(recon);

  await emitEvent({
    companyId: input.companyId,
    type: "bank.statement.imported",
    actor: input.createdBy,
    documentType: "bank-reconciliation",
    documentId: recon.id,
    data: { lineCount: recon.lines.length, bankAccount: input.bankAccountCode },
  });

  return recon;
}

// ─── Auto-match ─────────────────────────────────────────────

async function autoMatchStatementLines(recon: BankReconciliation): Promise<void> {
  // Get recent GL entries for the bank account
  const { resources: glEntries } = await containers.ledger().items
    .query<any>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) AND c.status = 'posted' ORDER BY c.date DESC OFFSET 0 LIMIT 200",
      parameters: [{ name: "@cid", value: recon.companyId }],
    })
    .fetchAll();

  // Build a map of GL amounts for the bank account
  const glAmounts: Array<{ entryId: string; amount: number; date: string; description: string }> = [];
  for (const entry of glEntries) {
    for (const line of entry.lines || []) {
      if (line.accountCode === recon.bankAccountCode) {
        const amount = roundCurrency(line.debit - line.credit); // positive = debit (deposit in bank account)
        glAmounts.push({ entryId: entry.id, amount, date: entry.date, description: entry.description });
      }
    }
  }

  // Match by amount + date
  for (const stLine of recon.lines) {
    if (stLine.status !== "unmatched") continue;
    const match = glAmounts.find(gl =>
      gl.amount === stLine.amount &&
      gl.date === stLine.date &&
      !recon.lines.some(sl => sl.matchedJournalEntryId === gl.entryId && sl.id !== stLine.id)
    );
    if (match) {
      stLine.status = "matched";
      stLine.matchedJournalEntryId = match.entryId;
    }
  }

  await containers.documents().item(recon.id, recon.companyId).replace(recon);
}

// ─── Post Unmatched Lines ───────────────────────────────────

export async function postUnmatchedLine(
  companyId: string,
  reconciliationId: string,
  lineId: string,
  expenseAccountCode: string,
  expenseAccountName: string,
  createdBy: string
): Promise<void> {
  const { resource: recon } = await containers.documents()
    .item(reconciliationId, companyId).read<BankReconciliation>();
  if (!recon) throw new GLError("NOT_FOUND", "Reconciliation not found");

  const line = recon.lines.find(l => l.id === lineId);
  if (!line) throw new GLError("NOT_FOUND", "Statement line not found");
  if (line.status === "posted") throw new GLError("ALREADY_POSTED", "Line already posted");

  const amount = Math.abs(line.amount);
  const journalLines: JournalLine[] = line.amount > 0
    ? [
        { accountCode: recon.bankAccountCode, accountName: "Bank accounts", debit: amount, credit: 0, description: line.description },
        { accountCode: expenseAccountCode, accountName: expenseAccountName, debit: 0, credit: amount, description: line.description },
      ]
    : [
        { accountCode: expenseAccountCode, accountName: expenseAccountName, debit: amount, credit: 0, description: line.description },
        { accountCode: recon.bankAccountCode, accountName: "Bank accounts", debit: 0, credit: amount, description: line.description },
      ];

  const entry = await postJournalEntry({
    companyId,
    date: line.date,
    description: `Bank: ${line.description}`,
    lines: journalLines,
    sourceType: "adjustment",
    createdBy,
  });

  line.status = "posted";
  line.matchedJournalEntryId = entry.id;
  await containers.documents().item(reconciliationId, companyId).replace(recon);
}

// ─── Complete Reconciliation ────────────────────────────────

export async function completeReconciliation(
  companyId: string,
  reconciliationId: string,
  completedBy: string
): Promise<BankReconciliation> {
  const { resource: recon } = await containers.documents()
    .item(reconciliationId, companyId).read<BankReconciliation>();
  if (!recon) throw new GLError("NOT_FOUND", "Reconciliation not found");

  const unmatched = recon.lines.filter(l => l.status === "unmatched").length;
  if (unmatched > 0) {
    throw new GLError("UNMATCHED_LINES", `${unmatched} lines are still unmatched`);
  }

  recon.status = "reconciled";
  recon.reconciledAt = new Date().toISOString();
  recon.reconciledBy = completedBy;
  await containers.documents().item(reconciliationId, companyId).replace(recon);

  await emitEvent({
    companyId,
    type: "bank.reconciled",
    actor: completedBy,
    documentType: "bank-reconciliation",
    documentId: recon.id,
    data: { bankAccount: recon.bankAccountCode, statementDate: recon.statementDate },
  });

  return recon;
}

// ─── List Reconciliations ───────────────────────────────────

export async function listReconciliations(companyId: string): Promise<BankReconciliation[]> {
  const { resources } = await containers.documents().items
    .query<BankReconciliation>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND c.docType = 'bank-reconciliation' ORDER BY c.statementDate DESC",
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();
  return resources;
}
