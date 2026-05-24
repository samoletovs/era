// Bank reconciliation service
// Import bank statements, auto-match, manual match, reconcile

import { v4 as uuidv4 } from 'uuid';
import { containers } from './cosmos.js';
import { postJournalEntry, GLError } from './ledger.js';
import { emitEvent } from './events.js';
import type { JournalLine, Invoice } from '@shared/types';

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Types ──────────────────────────────────────────────────

export interface BankStatementLine {
  id: string;
  date: string;
  description: string;
  reference?: string;
  amount: number; // positive = credit (deposit), negative = debit (payment)
  counterparty?: string;
  status: 'unmatched' | 'matched' | 'posted';
  matchedJournalEntryId?: string;
  matchedInvoiceId?: string;
  matchedInvoiceNumber?: string;
  allocatedAmount?: number; // amount applied to invoice
  differenceAmount?: number; // over/underpayment amount (positive = overpayment)
  differenceType?: 'overpayment' | 'underpayment' | 'exact';
  differenceAccountCode?: string; // GL account for the difference
  differenceAccountName?: string;
  suggestedAccountCode?: string; // auto-suggested GL account
  suggestedAccountName?: string;
  accountCode?: string; // GL account for direct posting (fees, commissions)
  accountName?: string;
  isManual?: boolean; // true if manually added (fee/commission)
}

export interface BankReconciliation {
  id: string;
  docType: 'bank-reconciliation';
  companyId: string;
  bankAccountCode: string; // GL account code (e.g. "2420")
  bankIban?: string;
  statementDate: string;
  statementBalance: number;
  bookBalance: number;
  lines: BankStatementLine[];
  status: 'in-progress' | 'reconciled';
  reconciledAt?: string;
  reconciledBy?: string;
  createdAt: string;
  createdBy: string;
}

// ─── Account Suggestion Map ─────────────────────────────────

const ACCOUNT_SUGGESTIONS: Array<{ keywords: string[]; accountCode: string; accountName: string }> =
  [
    {
      keywords: [
        'bank fee',
        'bank charge',
        'commission',
        'service fee',
        'account fee',
        'bank commission',
        'fee',
      ],
      accountCode: '6430',
      accountName: 'Bank fees',
    },
    {
      keywords: ['interest paid', 'interest expense', 'loan interest'],
      accountCode: '6410',
      accountName: 'Interest expense',
    },
    {
      keywords: ['interest received', 'interest income', 'interest earned'],
      accountCode: '5210',
      accountName: 'Interest income',
    },
    {
      keywords: ['rent', 'lease', 'office rent'],
      accountCode: '6330',
      accountName: 'Rent and utilities',
    },
    {
      keywords: ['salary', 'wage', 'payroll'],
      accountCode: '6310',
      accountName: 'Salaries and wages',
    },
    {
      keywords: ['social security', 'social tax', 'soc. contrib'],
      accountCode: '6320',
      accountName: 'Social security contributions',
    },
    { keywords: ['insurance'], accountCode: '6370', accountName: 'Insurance' },
    {
      keywords: ['office supplies', 'stationery', 'supplies'],
      accountCode: '6340',
      accountName: 'Office supplies',
    },
    {
      keywords: ['telecom', 'phone', 'internet', 'mobile', 'communication'],
      accountCode: '6360',
      accountName: 'Communication expenses',
    },
    {
      keywords: ['transport', 'fuel', 'parking', 'delivery'],
      accountCode: '6220',
      accountName: 'Transport and delivery',
    },
    {
      keywords: ['marketing', 'advertising', 'ads'],
      accountCode: '6210',
      accountName: 'Marketing and advertising',
    },
    {
      keywords: ['tax', 'income tax', 'cit'],
      accountCode: '6510',
      accountName: 'CIT on distributed profit',
    },
    {
      keywords: ['professional', 'consulting', 'legal', 'audit', 'accounting'],
      accountCode: '6350',
      accountName: 'Professional services',
    },
    { keywords: ['depreciation'], accountCode: '6380', accountName: 'Depreciation' },
    {
      keywords: ['fx loss', 'exchange loss', 'currency loss'],
      accountCode: '6420',
      accountName: 'Foreign exchange losses',
    },
    {
      keywords: ['fx gain', 'exchange gain', 'currency gain'],
      accountCode: '5220',
      accountName: 'Foreign exchange gains',
    },
  ];

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

export async function importBankStatement(
  input: ImportStatementInput,
): Promise<BankReconciliation> {
  // Get current book balance for the bank account
  const accountId = `${input.companyId}-acct-${input.bankAccountCode}`;
  let bookBalance = 0;
  try {
    const { resource } = await containers.ledger().item(accountId, input.companyId).read<any>();
    bookBalance = resource?.balance ?? 0;
  } catch {
    /* account not found */
  }

  const now = new Date().toISOString();
  const recon: BankReconciliation = {
    id: uuidv4(),
    docType: 'bank-reconciliation',
    companyId: input.companyId,
    bankAccountCode: input.bankAccountCode,
    bankIban: input.bankIban,
    statementDate: input.statementDate,
    statementBalance: input.statementBalance,
    bookBalance,
    lines: input.lines.map((l) => {
      const suggestion = suggestLedgerAccount(l.description);
      return {
        id: uuidv4(),
        ...l,
        status: 'unmatched' as const,
        suggestedAccountCode: suggestion?.accountCode,
        suggestedAccountName: suggestion?.accountName,
      };
    }),
    status: 'in-progress',
    createdAt: now,
    createdBy: input.createdBy,
  };

  await containers.documents().items.create(recon);

  // Auto-match: try to find GL entries matching statement lines
  await autoMatchStatementLines(recon);

  await emitEvent({
    companyId: input.companyId,
    type: 'bank.statement.imported',
    actor: input.createdBy,
    documentType: 'bank-reconciliation',
    documentId: recon.id,
    data: { lineCount: recon.lines.length, bankAccount: input.bankAccountCode },
  });

  return recon;
}

// ─── Auto-match ─────────────────────────────────────────────

async function autoMatchStatementLines(recon: BankReconciliation): Promise<void> {
  // Get recent GL entries for the bank account
  const { resources: glEntries } = await containers
    .ledger()
    .items.query<any>({
      query:
        "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) AND c.status = 'posted' ORDER BY c.date DESC OFFSET 0 LIMIT 200",
      parameters: [{ name: '@cid', value: recon.companyId }],
    })
    .fetchAll();

  // Build a map of GL amounts for the bank account
  const glAmounts: Array<{ entryId: string; amount: number; date: string; description: string }> =
    [];
  for (const entry of glEntries) {
    for (const line of entry.lines || []) {
      if (line.accountCode === recon.bankAccountCode) {
        const amount = roundCurrency(line.debit - line.credit); // positive = debit (deposit in bank account)
        glAmounts.push({
          entryId: entry.id,
          amount,
          date: entry.date,
          description: entry.description,
        });
      }
    }
  }

  // Match by amount + date
  for (const stLine of recon.lines) {
    if (stLine.status !== 'unmatched') continue;
    const match = glAmounts.find(
      (gl) =>
        gl.amount === stLine.amount &&
        gl.date === stLine.date &&
        !recon.lines.some((sl) => sl.matchedJournalEntryId === gl.entryId && sl.id !== stLine.id),
    );
    if (match) {
      stLine.status = 'matched';
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
  createdBy: string,
): Promise<void> {
  const { resource: recon } = await containers
    .documents()
    .item(reconciliationId, companyId)
    .read<BankReconciliation>();
  if (!recon) throw new GLError('NOT_FOUND', 'Reconciliation not found');

  const line = recon.lines.find((l) => l.id === lineId);
  if (!line) throw new GLError('NOT_FOUND', 'Statement line not found');
  if (line.status === 'posted') throw new GLError('ALREADY_POSTED', 'Line already posted');

  const amount = Math.abs(line.amount);
  const journalLines: JournalLine[] =
    line.amount > 0
      ? [
          {
            accountCode: recon.bankAccountCode,
            accountName: 'Bank accounts',
            debit: amount,
            credit: 0,
            description: line.description,
          },
          {
            accountCode: expenseAccountCode,
            accountName: expenseAccountName,
            debit: 0,
            credit: amount,
            description: line.description,
          },
        ]
      : [
          {
            accountCode: expenseAccountCode,
            accountName: expenseAccountName,
            debit: amount,
            credit: 0,
            description: line.description,
          },
          {
            accountCode: recon.bankAccountCode,
            accountName: 'Bank accounts',
            debit: 0,
            credit: amount,
            description: line.description,
          },
        ];

  const entry = await postJournalEntry({
    companyId,
    date: line.date,
    description: `Bank: ${line.description}`,
    lines: journalLines,
    sourceType: 'adjustment',
    createdBy,
  });

  line.status = 'posted';
  line.matchedJournalEntryId = entry.id;
  await containers.documents().item(reconciliationId, companyId).replace(recon);
}

// ─── Complete Reconciliation ────────────────────────────────

export async function completeReconciliation(
  companyId: string,
  reconciliationId: string,
  completedBy: string,
): Promise<BankReconciliation> {
  const { resource: recon } = await containers
    .documents()
    .item(reconciliationId, companyId)
    .read<BankReconciliation>();
  if (!recon) throw new GLError('NOT_FOUND', 'Reconciliation not found');

  const unmatched = recon.lines.filter((l) => l.status === 'unmatched').length;
  if (unmatched > 0) {
    throw new GLError('UNMATCHED_LINES', `${unmatched} lines are still unmatched`);
  }

  recon.status = 'reconciled';
  recon.reconciledAt = new Date().toISOString();
  recon.reconciledBy = completedBy;
  await containers.documents().item(reconciliationId, companyId).replace(recon);

  await emitEvent({
    companyId,
    type: 'bank.reconciled',
    actor: completedBy,
    documentType: 'bank-reconciliation',
    documentId: recon.id,
    data: { bankAccount: recon.bankAccountCode, statementDate: recon.statementDate },
  });

  return recon;
}

// ─── List Reconciliations ───────────────────────────────────

export async function listReconciliations(companyId: string): Promise<BankReconciliation[]> {
  // Legacy compatibility: early records were created without docType.
  // Backfill strategy: patch historical reconciliation docs with docType,
  // then remove the fallback branch to restore index-only filtering.
  const { resources } = await containers
    .documents()
    .items.query<BankReconciliation>({
      query:
        "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'bank-reconciliation' OR (IS_DEFINED(c.bankAccountCode) AND IS_DEFINED(c.statementDate) AND IS_DEFINED(c.lines))) ORDER BY c.statementDate DESC",
      parameters: [{ name: '@cid', value: companyId }],
    })
    .fetchAll();
  return resources;
}

// ─── Get Single Reconciliation ──────────────────────────────

export async function getReconciliation(
  companyId: string,
  reconciliationId: string,
): Promise<BankReconciliation> {
  const { resource: recon } = await containers
    .documents()
    .item(reconciliationId, companyId)
    .read<BankReconciliation>();
  if (!recon) throw new GLError('NOT_FOUND', 'Reconciliation not found');
  return recon;
}

// ─── Get Open Invoices ──────────────────────────────────────

export async function getOpenInvoices(companyId: string): Promise<
  Array<{
    id: string;
    invoiceNumber: string;
    type: string;
    contactName: string;
    date: string;
    dueDate: string;
    total: number;
    amountPaid: number;
    amountDue: number;
  }>
> {
  const { resources: invoices } = await containers
    .documents()
    .items.query<Invoice>({
      query:
        "SELECT * FROM c WHERE c.companyId = @cid AND c.docType = 'invoice' AND c.status IN ('posted', 'partially_paid', 'overdue')",
      parameters: [{ name: '@cid', value: companyId }],
    })
    .fetchAll();

  return invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    type: inv.type,
    contactName: inv.contactName,
    date: inv.date,
    dueDate: inv.dueDate,
    total: inv.total,
    amountPaid: inv.amountPaid,
    amountDue: roundCurrency(inv.total - inv.amountPaid),
  }));
}

// ─── Suggest Ledger Account ─────────────────────────────────

export function suggestLedgerAccount(
  description: string,
): { accountCode: string; accountName: string } | null {
  const lower = description.toLowerCase();
  for (const entry of ACCOUNT_SUGGESTIONS) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return { accountCode: entry.accountCode, accountName: entry.accountName };
    }
  }
  return null;
}

// ─── Match Statement Line to Invoice ────────────────────────

interface MatchInvoiceInput {
  companyId: string;
  reconciliationId: string;
  lineId: string;
  invoiceId: string;
  invoiceNumber: string;
  allocatedAmount: number;
  differenceAccountCode?: string;
  differenceAccountName?: string;
  createdBy: string;
}

export async function matchLineToInvoice(input: MatchInvoiceInput): Promise<BankReconciliation> {
  const { resource: recon } = await containers
    .documents()
    .item(input.reconciliationId, input.companyId)
    .read<BankReconciliation>();
  if (!recon) throw new GLError('NOT_FOUND', 'Reconciliation not found');

  const line = recon.lines.find((l) => l.id === input.lineId);
  if (!line) throw new GLError('NOT_FOUND', 'Statement line not found');
  if (line.status === 'posted') throw new GLError('ALREADY_POSTED', 'Line already posted');

  // Read the invoice to validate
  const { resource: invoice } = await containers
    .documents()
    .item(input.invoiceId, input.companyId)
    .read<Invoice>();
  if (!invoice) throw new GLError('NOT_FOUND', 'Invoice not found');

  const absAmount = Math.abs(line.amount);
  const allocated = roundCurrency(input.allocatedAmount);
  const _invoiceDue = roundCurrency(invoice.total - invoice.amountPaid);

  // Calculate difference
  const difference = roundCurrency(absAmount - allocated);
  let differenceType: 'overpayment' | 'underpayment' | 'exact' = 'exact';
  if (difference > 0.005) differenceType = 'overpayment';
  else if (difference < -0.005) differenceType = 'underpayment';

  // If there's a difference, we need a GL account for it
  if (differenceType !== 'exact' && !input.differenceAccountCode) {
    throw new GLError(
      'MISSING_ACCOUNT',
      'A GL account is required for over/underpayment differences',
    );
  }

  // Determine GL accounts based on invoice type
  const isIncoming = invoice.type === 'sales';
  const arApCode = isIncoming ? '2210' : '4220';
  const arApName = isIncoming ? 'Accounts receivable' : 'Trade payables';

  // Build journal lines
  const journalLines: JournalLine[] = [];

  if (isIncoming) {
    // Customer payment received: Dr Bank, Cr AR
    journalLines.push(
      {
        accountCode: recon.bankAccountCode,
        accountName: 'Bank accounts',
        debit: absAmount,
        credit: 0,
        description: `Received from ${invoice.contactName} — ${input.invoiceNumber}`,
        contactId: invoice.contactId,
      },
      {
        accountCode: arApCode,
        accountName: arApName,
        debit: 0,
        credit: allocated,
        description: `AR settlement — ${input.invoiceNumber}`,
        contactId: invoice.contactId,
      },
    );
    if (differenceType === 'overpayment' && input.differenceAccountCode) {
      journalLines.push({
        accountCode: input.differenceAccountCode,
        accountName: input.differenceAccountName || '',
        debit: 0,
        credit: roundCurrency(Math.abs(difference)),
        description: `Overpayment — ${input.invoiceNumber}`,
        contactId: invoice.contactId,
      });
    } else if (differenceType === 'underpayment' && input.differenceAccountCode) {
      journalLines.push(
        {
          accountCode: arApCode,
          accountName: arApName,
          debit: 0,
          credit: roundCurrency(Math.abs(difference)),
          description: `Write-off underpayment — ${input.invoiceNumber}`,
          contactId: invoice.contactId,
        },
        {
          accountCode: input.differenceAccountCode,
          accountName: input.differenceAccountName || '',
          debit: roundCurrency(Math.abs(difference)),
          credit: 0,
          description: `Underpayment write-off — ${input.invoiceNumber}`,
          contactId: invoice.contactId,
        },
      );
    }
  } else {
    // Vendor payment sent: Dr AP, Cr Bank
    journalLines.push(
      {
        accountCode: arApCode,
        accountName: arApName,
        debit: allocated,
        credit: 0,
        description: `AP settlement — ${input.invoiceNumber}`,
        contactId: invoice.contactId,
      },
      {
        accountCode: recon.bankAccountCode,
        accountName: 'Bank accounts',
        debit: 0,
        credit: absAmount,
        description: `Paid to ${invoice.contactName} — ${input.invoiceNumber}`,
        contactId: invoice.contactId,
      },
    );
    if (differenceType === 'overpayment' && input.differenceAccountCode) {
      journalLines.push({
        accountCode: input.differenceAccountCode,
        accountName: input.differenceAccountName || '',
        debit: roundCurrency(Math.abs(difference)),
        credit: 0,
        description: `Overpayment — ${input.invoiceNumber}`,
        contactId: invoice.contactId,
      });
    } else if (differenceType === 'underpayment' && input.differenceAccountCode) {
      journalLines.push(
        {
          accountCode: input.differenceAccountCode,
          accountName: input.differenceAccountName || '',
          debit: 0,
          credit: roundCurrency(Math.abs(difference)),
          description: `Write-off underpayment — ${input.invoiceNumber}`,
          contactId: invoice.contactId,
        },
        {
          accountCode: arApCode,
          accountName: arApName,
          debit: roundCurrency(Math.abs(difference)),
          credit: 0,
          description: `Underpayment write-off — ${input.invoiceNumber}`,
          contactId: invoice.contactId,
        },
      );
    }
  }

  const entry = await postJournalEntry({
    companyId: input.companyId,
    date: line.date,
    description: `Bank recon: ${isIncoming ? 'received from' : 'paid to'} ${invoice.contactName} — ${input.invoiceNumber}`,
    lines: journalLines,
    sourceType: 'payment',
    createdBy: input.createdBy,
  });

  // Update invoice paid amount
  invoice.amountPaid = roundCurrency(invoice.amountPaid + allocated);
  if (invoice.amountPaid >= invoice.total) {
    invoice.status = 'paid';
  } else if (invoice.amountPaid > 0) {
    invoice.status = 'partially_paid';
  }
  invoice.paymentJournalEntryIds.push(entry.id);
  await containers.documents().item(invoice.id, input.companyId).replace(invoice);

  // Update statement line
  line.status = 'posted';
  line.matchedJournalEntryId = entry.id;
  line.matchedInvoiceId = input.invoiceId;
  line.matchedInvoiceNumber = input.invoiceNumber;
  line.allocatedAmount = allocated;
  line.differenceAmount = difference;
  line.differenceType = differenceType;
  line.differenceAccountCode = input.differenceAccountCode;
  line.differenceAccountName = input.differenceAccountName;

  await containers.documents().item(recon.id, input.companyId).replace(recon);

  await emitEvent({
    companyId: input.companyId,
    type: 'bank.line.matched',
    actor: input.createdBy,
    documentType: 'bank-reconciliation',
    documentId: recon.id,
    journalEntryId: entry.id,
    data: { invoiceNumber: input.invoiceNumber, amount: absAmount, difference, differenceType },
  });

  return recon;
}

// ─── Add Manual Transaction ─────────────────────────────────

interface AddManualTransactionInput {
  companyId: string;
  reconciliationId: string;
  date: string;
  description: string;
  amount: number;
  accountCode: string;
  accountName: string;
  createdBy: string;
}

export async function addManualTransaction(
  input: AddManualTransactionInput,
): Promise<BankReconciliation> {
  const { resource: recon } = await containers
    .documents()
    .item(input.reconciliationId, input.companyId)
    .read<BankReconciliation>();
  if (!recon) throw new GLError('NOT_FOUND', 'Reconciliation not found');
  if (recon.status === 'reconciled')
    throw new GLError('ALREADY_RECONCILED', 'Cannot add to a reconciled statement');

  const amount = Math.abs(input.amount);
  const journalLines: JournalLine[] =
    input.amount < 0
      ? [
          // Expense/fee (negative = money out)
          {
            accountCode: input.accountCode,
            accountName: input.accountName,
            debit: amount,
            credit: 0,
            description: input.description,
          },
          {
            accountCode: recon.bankAccountCode,
            accountName: 'Bank accounts',
            debit: 0,
            credit: amount,
            description: input.description,
          },
        ]
      : [
          // Income (positive = money in)
          {
            accountCode: recon.bankAccountCode,
            accountName: 'Bank accounts',
            debit: amount,
            credit: 0,
            description: input.description,
          },
          {
            accountCode: input.accountCode,
            accountName: input.accountName,
            debit: 0,
            credit: amount,
            description: input.description,
          },
        ];

  const entry = await postJournalEntry({
    companyId: input.companyId,
    date: input.date,
    description: `Bank: ${input.description}`,
    lines: journalLines,
    sourceType: 'adjustment',
    createdBy: input.createdBy,
  });

  const newLine: BankStatementLine = {
    id: uuidv4(),
    date: input.date,
    description: input.description,
    amount: input.amount,
    status: 'posted',
    matchedJournalEntryId: entry.id,
    accountCode: input.accountCode,
    accountName: input.accountName,
    isManual: true,
  };

  recon.lines.push(newLine);
  await containers.documents().item(recon.id, input.companyId).replace(recon);

  return recon;
}
