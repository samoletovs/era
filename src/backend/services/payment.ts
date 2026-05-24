import { v4 as uuidv4 } from 'uuid';
import { containers } from './cosmos.js';
import { postJournalEntry, GLError } from './ledger.js';
import { emitEvent } from './events.js';
import { getActiveRule, evaluatePaymentRule } from './posting-rules.js';
import { getNextNumber } from './sequences.js';
import { DEFAULT_GL_ACCOUNTS } from '@shared/constants';
import type { Payment, PaymentAllocation, Invoice, JournalLine } from '@shared/types';
import { resolveBankLedgerAccountCode } from './bank-accounts.js';

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Create & Post Payment ──────────────────────────────────

interface CreatePaymentInput {
  companyId: string;
  type: 'incoming' | 'outgoing';
  contactId: string;
  contactName: string;
  date: string;
  amount: number;
  bankAccountIban: string;
  reference: string;
  currencyCode?: string;
  exchangeRate?: number;
  invoiceAllocations: Array<{
    invoiceId: string;
    invoiceNumber: string;
    amount: number;
  }>;
  createdBy: string;
}

export async function createAndPostPayment(input: CreatePaymentInput): Promise<Payment> {
  if (input.amount <= 0) {
    throw new GLError('INVALID_AMOUNT', 'Payment amount must be positive');
  }

  // Validate allocations don't exceed payment
  const totalAllocated = roundCurrency(input.invoiceAllocations.reduce((s, a) => s + a.amount, 0));
  if (totalAllocated > input.amount) {
    throw new GLError(
      'OVER_ALLOCATED',
      `Allocated ${totalAllocated} exceeds payment ${input.amount}`,
    );
  }

  const paymentNumber = await getNextNumber(input.companyId, 'payment');
  const now = new Date().toISOString();
  const payment: Payment = {
    id: uuidv4(),
    docType: 'payment' as const,
    companyId: input.companyId,
    paymentNumber,
    type: input.type,
    contactId: input.contactId,
    contactName: input.contactName,
    date: input.date,
    amount: input.amount,
    currency: input.currencyCode || 'EUR',
    exchangeRate: input.exchangeRate,
    bankAccountIban: input.bankAccountIban,
    reference: input.reference,
    invoiceAllocations: input.invoiceAllocations,
    status: 'posted',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  };
  const bankAccountCode = await resolveBankLedgerAccountCode(
    input.companyId,
    input.bankAccountIban,
  );

  // Build GL journal lines — try rule engine first, fall back to hardcoded
  const ruleType =
    input.type === 'incoming' ? ('incoming-payment' as const) : ('outgoing-payment' as const);
  const rule = await getActiveRule('LV', ruleType);
  let journalLines: JournalLine[];
  if (rule) {
    const ruleResult = evaluatePaymentRule(rule, payment);
    journalLines = ruleResult ?? buildPaymentJournalLines(payment, bankAccountCode);
  } else {
    journalLines = buildPaymentJournalLines(payment, bankAccountCode);
  }

  journalLines = journalLines.map((line) =>
    line.accountCode === DEFAULT_GL_ACCOUNTS.BANK
      ? { ...line, accountCode: bankAccountCode, accountName: 'Bank accounts' }
      : line,
  );

  // Annotate GL lines with transaction-level exchange rate override (EUR payments only)
  if (payment.currency === 'EUR' && payment.exchangeRate && payment.exchangeRate !== 1) {
    const rate = payment.exchangeRate;
    journalLines = journalLines.map((l) => ({
      ...l,
      exchangeRate: rate,
      currencyCode: 'EUR',
      amountInCurrency: ((l.debit || 0) + (l.credit || 0)) / rate,
    }));
  }

  // Post journal entry
  const journalEntry = await postJournalEntry({
    companyId: input.companyId,
    date: input.date,
    description: `${input.type === 'incoming' ? 'Payment received from' : 'Payment to'} ${input.contactName} — ${input.reference}`,
    lines: journalLines,
    sourceType: 'payment',
    sourceId: payment.id,
    createdBy: input.createdBy,
  });

  payment.journalEntryId = journalEntry.id;

  // Save payment
  await containers.documents().items.create(payment);

  // Update invoice paid amounts and statuses
  await updateInvoicesForPayment(input.companyId, input.invoiceAllocations, journalEntry.id);

  await emitEvent({
    companyId: input.companyId,
    type: 'payment.posted',
    actor: input.createdBy,
    documentType: 'payment',
    documentId: payment.id,
    journalEntryId: journalEntry.id,
    data: {
      type: payment.type,
      amount: payment.amount,
      contactName: payment.contactName,
    },
  });

  if (input.exchangeRate && input.exchangeRate !== 1) {
    await emitEvent({
      companyId: input.companyId,
      type: 'payment.rate_override',
      actor: input.createdBy,
      documentType: 'payment',
      documentId: payment.id,
      data: {
        paymentNumber: payment.paymentNumber,
        exchangeRate: input.exchangeRate,
      },
    });
  }

  return payment;
}

// ─── Build GL lines ─────────────────────────────────────────

function buildPaymentJournalLines(payment: Payment, bankAccountCode: string): JournalLine[] {
  const hasFx = payment.currency !== 'EUR' && payment.exchangeRate;

  const withCurrency = (line: JournalLine): JournalLine => {
    if (!hasFx) return line;
    const amount = line.debit || line.credit;
    return {
      ...line,
      currencyCode: payment.currency,
      exchangeRate: payment.exchangeRate,
      amountInCurrency: amount,
    };
  };

  if (payment.type === 'incoming') {
    // Customer payment received
    return [
      withCurrency({
        accountCode: bankAccountCode,
        accountName: 'Bank accounts',
        debit: payment.amount,
        credit: 0,
        description: `Received from ${payment.contactName}`,
        contactId: payment.contactId,
      }),
      withCurrency({
        accountCode: DEFAULT_GL_ACCOUNTS.ACCOUNTS_RECEIVABLE, // Accounts receivable
        accountName: 'Accounts receivable',
        debit: 0,
        credit: payment.amount,
        description: `AR settlement — ${payment.reference}`,
        contactId: payment.contactId,
      }),
    ];
  } else {
    // Vendor payment sent
    return [
      withCurrency({
        accountCode: DEFAULT_GL_ACCOUNTS.ACCOUNTS_PAYABLE, // Trade payables
        accountName: 'Trade payables',
        debit: payment.amount,
        credit: 0,
        description: `AP settlement — ${payment.reference}`,
        contactId: payment.contactId,
      }),
      withCurrency({
        accountCode: bankAccountCode,
        accountName: 'Bank accounts',
        debit: 0,
        credit: payment.amount,
        description: `Paid to ${payment.contactName}`,
        contactId: payment.contactId,
      }),
    ];
  }
}

// ─── Update invoices after payment ──────────────────────────

async function updateInvoicesForPayment(
  companyId: string,
  allocations: PaymentAllocation[],
  journalEntryId: string,
) {
  if (allocations.length === 0) {
    return;
  }

  const allocationMap = new Map(allocations.map((a) => [a.invoiceId, a.amount]));
  const invoiceIds = [...allocationMap.keys()];

  const { resources: invoices } = await containers
    .documents()
    .items.query<Invoice>({
      query: 'SELECT * FROM c WHERE c.companyId = @cid AND ARRAY_CONTAINS(@invoiceIds, c.id)',
      parameters: [
        { name: '@cid', value: companyId },
        { name: '@invoiceIds', value: invoiceIds },
      ],
    })
    .fetchAll();

  await Promise.all(
    invoices.map(async (invoice) => {
      const allocatedAmount = allocationMap.get(invoice.id);
      if (!allocatedAmount) {
        return;
      }

      invoice.amountPaid = roundCurrency(invoice.amountPaid + allocatedAmount);
      if (!invoice.paymentJournalEntryIds.includes(journalEntryId)) {
        invoice.paymentJournalEntryIds.push(journalEntryId);
      }

      if (invoice.amountPaid >= invoice.total) {
        invoice.status = 'paid';
      } else if (invoice.amountPaid > 0) {
        invoice.status = 'partially_paid';
      }

      invoice.updatedAt = new Date().toISOString();
      await containers.documents().item(invoice.id, companyId).replace(invoice);
    }),
  );
}

// ─── List payments ──────────────────────────────────────────

export async function listPayments(
  companyId: string,
  type?: 'incoming' | 'outgoing',
): Promise<Payment[]> {
  const typeFilter = type ? 'AND c.type = @type' : '';
  const params: { name: string; value: string }[] = [{ name: '@cid', value: companyId }];
  if (type) params.push({ name: '@type', value: type });

  const { resources } = await containers
    .documents()
    .items.query<Payment>({
      query: `SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'payment' OR IS_DEFINED(c.bankAccountIban)) ${typeFilter} ORDER BY c.date DESC`,
      parameters: params,
    })
    .fetchAll();

  return resources;
}
