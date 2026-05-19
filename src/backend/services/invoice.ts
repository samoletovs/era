import { v4 as uuidv4 } from 'uuid';
import { containers } from './cosmos.js';
import { postJournalEntry, GLError } from './ledger.js';
import { emitEvent } from './events.js';
import { getActiveRule, evaluateInvoiceRule } from './posting-rules.js';
import { getNextNumber } from './sequences.js';
import type { Invoice, InvoiceLine, JournalLine, Company } from '@shared/types';
import { VAT_RATES } from '@shared/constants';

// ─── Helpers ────────────────────────────────────────────────

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

function calcLineTotals(line: Omit<InvoiceLine, 'vatAmount' | 'lineTotal'>): InvoiceLine {
  const net = roundCurrency(line.quantity * line.unitPrice);
  const vatAmount = roundCurrency((net * line.vatRate) / 100);
  return {
    ...line,
    vatAmount,
    lineTotal: roundCurrency(net + vatAmount),
  };
}

async function nextInvoiceNumber(company: Company, type: 'sales' | 'purchase'): Promise<string> {
  const seqType = type === 'sales' ? ('salesInvoice' as const) : ('purchaseInvoice' as const);
  return getNextNumber(company.id, seqType);
}

// ─── Create Invoice ─────────────────────────────────────────

interface CreateInvoiceInput {
  companyId: string;
  type: 'sales' | 'purchase';
  contactId: string;
  contactName: string;
  date: string;
  dueDate: string;
  vendorInvoiceNumber?: string;
  recognitionConfidence?: 'high' | 'medium' | 'low';
  currencyCode?: string;
  exchangeRate?: number;
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    accountCode: string;
    itemId?: string;
  }>;
  createdBy: string;
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  // Get company
  const { resource: company } = await containers
    .companies()
    .item(input.companyId, input.companyId)
    .read<Company>();
  if (!company) throw new GLError('COMPANY_NOT_FOUND', 'Company not found');

  // Validate VAT rates
  const validRates: readonly number[] = Object.values(VAT_RATES);
  for (const line of input.lines) {
    if (!validRates.includes(line.vatRate)) {
      throw new GLError(
        'INVALID_VAT_RATE',
        `VAT rate ${line.vatRate}% is not valid. Use: ${validRates.join(', ')}`,
      );
    }
  }

  // Calculate line totals
  const lines = input.lines.map(calcLineTotals);
  const subtotal = roundCurrency(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
  const vatAmount = roundCurrency(lines.reduce((s, l) => s + l.vatAmount, 0));
  const total = roundCurrency(subtotal + vatAmount);

  const invoiceNumber = await nextInvoiceNumber(company, input.type);
  const now = new Date().toISOString();

  const invoice: Invoice = {
    id: uuidv4(),
    docType: 'invoice' as const,
    companyId: input.companyId,
    invoiceNumber,
    type: input.type,
    contactId: input.contactId,
    contactName: input.contactName,
    date: input.date,
    dueDate: input.dueDate,
    lines,
    subtotal,
    vatAmount,
    total,
    amountPaid: 0,
    status: 'draft',
    currency: input.currencyCode || 'EUR',
    exchangeRate: input.exchangeRate,
    documentNumber: invoiceNumber,
    documentDate: input.date,
    vendorInvoiceNumber: input.vendorInvoiceNumber,
    recognitionConfidence: input.recognitionConfidence,
    paymentJournalEntryIds: [],
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  };

  await containers.documents().items.create(invoice);

  await emitEvent({
    companyId: input.companyId,
    type: 'invoice.created',
    actor: input.createdBy,
    documentType: 'invoice',
    documentId: invoice.id,
    data: { invoiceNumber: invoice.invoiceNumber, type: invoice.type, total: invoice.total },
  });

  if (input.exchangeRate && input.exchangeRate !== 1) {
    await emitEvent({
      companyId: input.companyId,
      type: 'invoice.rate_override',
      actor: input.createdBy,
      documentType: 'invoice',
      documentId: invoice.id,
      data: {
        invoiceNumber: invoice.invoiceNumber,
        exchangeRate: input.exchangeRate,
      },
    });
  }

  return invoice;
}

// ─── Pick posting-rule documentType from invoice + vatTreatment ─────

type InvoiceRuleType =
  | 'sales-invoice'
  | 'sales-invoice-intra-eu'
  | 'sales-invoice-export-non-eu'
  | 'sales-invoice-oss'
  | 'purchase-invoice'
  | 'purchase-invoice-reverse-charge-eu'
  | 'purchase-invoice-reverse-charge-domestic';

export function pickRuleType(invoice: Pick<Invoice, 'type' | 'vatTreatment'>): InvoiceRuleType {
  const treatment = invoice.vatTreatment ?? 'standard';
  if (invoice.type === 'sales') {
    switch (treatment) {
      case 'intra-eu-supply':
        return 'sales-invoice-intra-eu';
      case 'export-non-eu':
        return 'sales-invoice-export-non-eu';
      case 'oss':
        return 'sales-invoice-oss';
      // 'reverse-charge-domestic' on a sales invoice = supplier issues
      // invoice with no VAT; falls back to standard rule (the invoice
      // simply has all lines at 0% VAT, so the standard rule produces
      // the correct entries — no separate VAT line).
      case 'reverse-charge-domestic':
      case 'reverse-charge-eu': // not applicable to sales; ignore
      case 'standard':
      default:
        return 'sales-invoice';
    }
  }
  // purchase invoice
  switch (treatment) {
    case 'reverse-charge-eu':
      return 'purchase-invoice-reverse-charge-eu';
    case 'reverse-charge-domestic':
      return 'purchase-invoice-reverse-charge-domestic';
    case 'intra-eu-supply': // not applicable to purchases; ignore
    case 'export-non-eu': // not applicable to purchases; ignore
    case 'oss': // not applicable to purchases; ignore
    case 'standard':
    default:
      return 'purchase-invoice';
  }
}

// ─── Post Invoice (draft → posted, creates GL entries) ──────

export async function postInvoice(
  companyId: string,
  invoiceId: string,
  createdBy: string,
): Promise<Invoice> {
  const { resource: invoice } = await containers
    .documents()
    .item(invoiceId, companyId)
    .read<Invoice>();

  if (!invoice) throw new GLError('NOT_FOUND', 'Invoice not found');
  if (invoice.status !== 'draft')
    throw new GLError('NOT_DRAFT', 'Only draft invoices can be posted');

  // Build GL journal lines — try rule engine first, fall back to hardcoded.
  // Pick rule type from `vatTreatment` (default 'standard'). Each treatment
  // maps to a distinct PostingRule documentType so the rule lookup is a
  // simple country+documentType key — no condition evaluation required.
  const ruleType = pickRuleType(invoice);
  const rule = await getActiveRule('LV', ruleType);
  let journalLines: JournalLine[];
  if (rule) {
    const ruleResult = evaluateInvoiceRule(rule, invoice);
    journalLines = ruleResult ?? buildInvoiceJournalLines(invoice);
  } else {
    journalLines = buildInvoiceJournalLines(invoice);
  }

  // Annotate GL lines with transaction-level exchange rate override (EUR invoices only)
  if (invoice.currency === 'EUR' && invoice.exchangeRate && invoice.exchangeRate !== 1) {
    const rate = invoice.exchangeRate;
    journalLines = journalLines.map((l) => ({
      ...l,
      exchangeRate: rate,
      currencyCode: 'EUR',
      amountInCurrency: ((l.debit || 0) + (l.credit || 0)) / rate,
    }));
  }

  // Post journal entry
  const journalEntry = await postJournalEntry({
    companyId,
    date: invoice.date,
    description: `${invoice.type === 'sales' ? 'Sales' : 'Purchase'} invoice ${invoice.invoiceNumber} — ${invoice.contactName}`,
    lines: journalLines,
    sourceType: 'invoice',
    sourceId: invoiceId,
    createdBy,
  });

  // Update invoice status
  invoice.status = 'posted';
  invoice.journalEntryId = journalEntry.id;
  invoice.updatedAt = new Date().toISOString();
  await containers.documents().item(invoiceId, companyId).replace(invoice);

  await emitEvent({
    companyId,
    type: 'invoice.posted',
    actor: createdBy,
    documentType: 'invoice',
    documentId: invoiceId,
    journalEntryId: journalEntry.id,
    data: { invoiceNumber: invoice.invoiceNumber, type: invoice.type, total: invoice.total },
  });

  return invoice;
}

// ─── Build GL lines for invoice ─────────────────────────────

function buildInvoiceJournalLines(invoice: Invoice): JournalLine[] {
  const lines: JournalLine[] = [];
  const hasFx = invoice.currency !== 'EUR' && invoice.exchangeRate;

  // Helper to add currency metadata to a journal line
  const withCurrency = (line: JournalLine): JournalLine => {
    if (!hasFx) return line;
    const amount = line.debit || line.credit;
    return {
      ...line,
      currencyCode: invoice.currency,
      exchangeRate: invoice.exchangeRate,
      amountInCurrency: amount,
    };
  };

  if (invoice.type === 'sales') {
    // Debit: Accounts Receivable (2210) for total
    lines.push(
      withCurrency({
        accountCode: '2210',
        accountName: 'Accounts receivable',
        debit: invoice.total,
        credit: 0,
        description: `AR — ${invoice.contactName}`,
        contactId: invoice.contactId,
      }),
    );

    // Credit: Revenue accounts per line (skip zero-amount lines)
    for (const invLine of invoice.lines) {
      const net = roundCurrency(invLine.quantity * invLine.unitPrice);
      if (net === 0) continue;
      lines.push(
        withCurrency({
          accountCode: invLine.accountCode,
          accountName: invLine.description,
          debit: 0,
          credit: net,
          description: invLine.description,
          contactId: invoice.contactId,
          itemId: invLine.itemId,
          itemCode: invLine.itemId,
          taxCode: invLine.vatRate > 0 ? `LV-${invLine.vatRate}` : undefined,
        }),
      );
    }

    // Credit: VAT payable (4230) for total VAT
    if (invoice.vatAmount > 0) {
      lines.push(
        withCurrency({
          accountCode: '4230',
          accountName: 'VAT payable',
          debit: 0,
          credit: invoice.vatAmount,
          description: 'Output VAT',
          vatCode: 'output',
          contactId: invoice.contactId,
          taxCode: `LV-${invoice.lines[0]?.vatRate ?? 21}`,
          taxAmount: invoice.vatAmount,
        }),
      );
    }
  } else {
    // Purchase invoice
    // Credit: Trade payables (4220) for total
    lines.push(
      withCurrency({
        accountCode: '4220',
        accountName: 'Trade payables',
        debit: 0,
        credit: invoice.total,
        description: `AP — ${invoice.contactName}`,
        contactId: invoice.contactId,
      }),
    );

    // Debit: Expense/asset accounts per line (skip zero-amount lines)
    for (const invLine of invoice.lines) {
      const net = roundCurrency(invLine.quantity * invLine.unitPrice);
      if (net === 0) continue;
      lines.push(
        withCurrency({
          accountCode: invLine.accountCode,
          accountName: invLine.description,
          debit: net,
          credit: 0,
          description: invLine.description,
          contactId: invoice.contactId,
          itemId: invLine.itemId,
          itemCode: invLine.itemId,
          taxCode: invLine.vatRate > 0 ? `LV-${invLine.vatRate}` : undefined,
        }),
      );
    }

    // Debit: VAT receivable (2310) for total VAT
    if (invoice.vatAmount > 0) {
      lines.push(
        withCurrency({
          accountCode: '2310',
          accountName: 'VAT receivable',
          debit: invoice.vatAmount,
          credit: 0,
          description: 'Input VAT',
          vatCode: 'input',
          contactId: invoice.contactId,
          taxCode: `LV-${invoice.lines[0]?.vatRate ?? 21}`,
          taxAmount: invoice.vatAmount,
        }),
      );
    }
  }

  return lines;
}

// ─── Get invoices ───────────────────────────────────────────

export async function getInvoice(companyId: string, invoiceId: string): Promise<Invoice | null> {
  try {
    const { resource } = await containers.documents().item(invoiceId, companyId).read<Invoice>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export async function listInvoices(
  companyId: string,
  type?: 'sales' | 'purchase',
): Promise<Invoice[]> {
  const typeFilter = type ? 'AND c.type = @type' : '';
  const params: { name: string; value: string }[] = [{ name: '@cid', value: companyId }];
  if (type) params.push({ name: '@type', value: type });

  const { resources } = await containers
    .documents()
    .items.query<Invoice>({
      query: `SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'invoice' OR IS_DEFINED(c.invoiceNumber)) ${typeFilter} ORDER BY c.date DESC`,
      parameters: params,
    })
    .fetchAll();

  return resources;
}

// ─── Duplicate Detection ────────────────────────────────────

export async function findDuplicateInvoice(
  companyId: string,
  contactId: string,
  vendorInvoiceNumber: string,
): Promise<Invoice | null> {
  if (!vendorInvoiceNumber) return null;

  const { resources } = await containers
    .documents()
    .items.query<Invoice>({
      query:
        "SELECT * FROM c WHERE c.companyId = @cid AND c.contactId = @contactId AND c.vendorInvoiceNumber = @vnum AND c.status != 'cancelled'",
      parameters: [
        { name: '@cid', value: companyId },
        { name: '@contactId', value: contactId },
        { name: '@vnum', value: vendorInvoiceNumber },
      ],
    })
    .fetchAll();

  return resources.length > 0 ? resources[0] : null;
}

// ─── Cancel Invoice ─────────────────────────────────────────

export async function cancelInvoice(
  companyId: string,
  invoiceId: string,
  reason: string,
  createdBy: string,
): Promise<Invoice> {
  const { resource: invoice } = await containers
    .documents()
    .item(invoiceId, companyId)
    .read<Invoice>();

  if (!invoice) throw new GLError('NOT_FOUND', 'Invoice not found');
  if (invoice.status === 'cancelled')
    throw new GLError('ALREADY_CANCELLED', 'Invoice is already cancelled');
  if (invoice.amountPaid > 0)
    throw new GLError(
      'HAS_PAYMENTS',
      'Cannot cancel invoice with payments. Reverse payments first.',
    );

  // If posted, create reversing journal entry
  if (invoice.journalEntryId && invoice.status !== 'draft') {
    const { reverseJournalEntry } = await import('./ledger.js');
    const reversalEntry = await reverseJournalEntry(companyId, invoice.journalEntryId, createdBy);
    invoice.reversalJournalEntryId = reversalEntry.id;
  }

  invoice.status = 'cancelled';
  invoice.updatedAt = new Date().toISOString();
  await containers.documents().item(invoiceId, companyId).replace(invoice);

  return invoice;
}

// ─── Get GL entries for invoice ─────────────────────────────

export async function getInvoicePostings(companyId: string, invoiceId: string) {
  const { resources } = await containers
    .ledger()
    .items.query({
      query:
        "SELECT * FROM c WHERE c.companyId = @cid AND c.sourceId = @sid AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber))",
      parameters: [
        { name: '@cid', value: companyId },
        { name: '@sid', value: invoiceId },
      ],
    })
    .fetchAll();
  return resources;
}

// ─── Credit Notes ───────────────────────────────────────────

interface CreateCreditNoteInput {
  companyId: string;
  originalInvoiceId: string;
  reason: string;
  lines?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    accountCode: string;
    itemId?: string;
  }>;
  createdBy: string;
}

export async function createCreditNote(input: CreateCreditNoteInput): Promise<Invoice> {
  const { resource: original } = await containers
    .documents()
    .item(input.originalInvoiceId, input.companyId)
    .read<Invoice>();

  if (!original) throw new GLError('NOT_FOUND', 'Original invoice not found');
  if (original.status === 'draft' || original.status === 'cancelled') {
    throw new GLError('INVALID_STATUS', 'Cannot create credit note for draft or cancelled invoice');
  }

  const { resource: company } = await containers
    .companies()
    .item(input.companyId, input.companyId)
    .read<Company>();
  if (!company) throw new GLError('COMPANY_NOT_FOUND', 'Company not found');

  // Use original lines if none provided (full credit)
  const creditLines = (
    input.lines ||
    original.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      vatRate: l.vatRate,
      accountCode: l.accountCode,
      itemId: l.itemId,
    }))
  ).map(calcLineTotals);

  const subtotal = roundCurrency(creditLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
  const vatAmount = roundCurrency(creditLines.reduce((s, l) => s + l.vatAmount, 0));
  const total = roundCurrency(subtotal + vatAmount);

  const invoiceNumber = await getNextNumber(input.companyId, 'creditNote');
  const now = new Date().toISOString();

  const creditNote: Invoice = {
    id: uuidv4(),
    docType: 'invoice' as const,
    companyId: input.companyId,
    invoiceNumber,
    type: original.type,
    contactId: original.contactId,
    contactName: original.contactName,
    date: now.slice(0, 10),
    dueDate: now.slice(0, 10),
    lines: creditLines,
    subtotal: -subtotal,
    vatAmount: -vatAmount,
    total: -total,
    amountPaid: 0,
    status: 'draft',
    currency: 'EUR',
    documentNumber: invoiceNumber,
    documentDate: now.slice(0, 10),
    paymentJournalEntryIds: [],
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    creditNoteFor: input.originalInvoiceId,
    creditNoteReason: input.reason,
  } as Invoice & { creditNoteFor: string; creditNoteReason: string };

  await containers.documents().items.create(creditNote);

  // Auto-post the credit note (reverses the original GL entries)
  const journalLines = buildInvoiceJournalLines({
    ...creditNote,
    subtotal: Math.abs(subtotal),
    vatAmount: Math.abs(vatAmount),
    total: Math.abs(total),
    lines: creditLines,
  } as Invoice);

  // Flip all debits/credits for the credit note
  const reversedLines = journalLines.map((l) => ({
    ...l,
    debit: l.credit,
    credit: l.debit,
  }));

  const journalEntry = await postJournalEntry({
    companyId: input.companyId,
    date: creditNote.date,
    description: `Credit note ${invoiceNumber} for ${original.invoiceNumber} — ${input.reason}`,
    lines: reversedLines,
    sourceType: 'adjustment',
    sourceId: creditNote.id,
    createdBy: input.createdBy,
  });

  creditNote.status = 'posted';
  (creditNote as any).journalEntryId = journalEntry.id;
  creditNote.updatedAt = new Date().toISOString();
  await containers.documents().item(creditNote.id, input.companyId).replace(creditNote);

  // Update original invoice's amountPaid (credit note reduces outstanding)
  original.amountPaid = roundCurrency(original.amountPaid + total);
  if (original.amountPaid >= original.total) original.status = 'paid';
  else if (original.amountPaid > 0) original.status = 'partially_paid';
  original.updatedAt = new Date().toISOString();
  await containers.documents().item(original.id, input.companyId).replace(original);

  await emitEvent({
    companyId: input.companyId,
    type: 'creditnote.posted',
    actor: input.createdBy,
    documentType: 'invoice',
    documentId: creditNote.id,
    journalEntryId: journalEntry.id,
    data: {
      creditNoteNumber: invoiceNumber,
      originalInvoice: original.invoiceNumber,
      total: -total,
      reason: input.reason,
    },
  });

  return creditNote;
}
