import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import { postJournalEntry, GLError } from "./ledger.js";
import { emitEvent } from "./events.js";
import { getActiveRule, evaluateInvoiceRule } from "./posting-rules.js";
import type { Invoice, InvoiceLine, JournalLine, Company } from "@shared/types";
import { VAT_RATES } from "@shared/constants";

// ─── Helpers ────────────────────────────────────────────────

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

function calcLineTotals(line: Omit<InvoiceLine, "vatAmount" | "lineTotal">): InvoiceLine {
  const net = roundCurrency(line.quantity * line.unitPrice);
  const vatAmount = roundCurrency(net * line.vatRate / 100);
  return {
    ...line,
    vatAmount,
    lineTotal: roundCurrency(net + vatAmount),
  };
}

async function nextInvoiceNumber(company: Company, type: "sales" | "purchase"): Promise<string> {
  const prefix = type === "sales" ? company.settings.invoiceNumberPrefix : "PINV";
  const num = company.settings.nextInvoiceNumber;

  // Increment counter
  company.settings.nextInvoiceNumber = num + 1;
  company.updatedAt = new Date().toISOString();
  await containers.companies().item(company.id, company.id).replace(company);

  return `${prefix}-${String(num).padStart(5, "0")}`;
}

// ─── Create Invoice ─────────────────────────────────────────

interface CreateInvoiceInput {
  companyId: string;
  type: "sales" | "purchase";
  contactId: string;
  contactName: string;
  date: string;
  dueDate: string;
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
  const { resource: company } = await containers.companies()
    .item(input.companyId, input.companyId)
    .read<Company>();
  if (!company) throw new GLError("COMPANY_NOT_FOUND", "Company not found");

  // Validate VAT rates
  const validRates: readonly number[] = Object.values(VAT_RATES);
  for (const line of input.lines) {
    if (!validRates.includes(line.vatRate)) {
      throw new GLError("INVALID_VAT_RATE", `VAT rate ${line.vatRate}% is not valid. Use: ${validRates.join(", ")}`);
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
    status: "draft",
    currency: "EUR",
    documentNumber: invoiceNumber,
    documentDate: input.date,
    paymentJournalEntryIds: [],
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  };

  await containers.documents().items.create(invoice);

  await emitEvent({
    companyId: input.companyId,
    type: "invoice.created",
    actor: input.createdBy,
    documentType: "invoice",
    documentId: invoice.id,
    data: { invoiceNumber: invoice.invoiceNumber, type: invoice.type, total: invoice.total },
  });

  return invoice;
}

// ─── Post Invoice (draft → posted, creates GL entries) ──────

export async function postInvoice(
  companyId: string,
  invoiceId: string,
  createdBy: string
): Promise<Invoice> {
  const { resource: invoice } = await containers.documents()
    .item(invoiceId, companyId)
    .read<Invoice>();

  if (!invoice) throw new GLError("NOT_FOUND", "Invoice not found");
  if (invoice.status !== "draft") throw new GLError("NOT_DRAFT", "Only draft invoices can be posted");

  // Build GL journal lines — try rule engine first, fall back to hardcoded
  const ruleType = invoice.type === "sales" ? "sales-invoice" as const : "purchase-invoice" as const;
  const rule = await getActiveRule("LV", ruleType);
  let journalLines: JournalLine[];
  if (rule) {
    const ruleResult = evaluateInvoiceRule(rule, invoice);
    journalLines = ruleResult ?? buildInvoiceJournalLines(invoice);
  } else {
    journalLines = buildInvoiceJournalLines(invoice);
  }

  // Post journal entry
  const journalEntry = await postJournalEntry({
    companyId,
    date: invoice.date,
    description: `${invoice.type === "sales" ? "Sales" : "Purchase"} invoice ${invoice.invoiceNumber} — ${invoice.contactName}`,
    lines: journalLines,
    sourceType: "invoice",
    sourceId: invoiceId,
    createdBy,
  });

  // Update invoice status
  invoice.status = "posted";
  invoice.journalEntryId = journalEntry.id;
  invoice.updatedAt = new Date().toISOString();
  await containers.documents().item(invoiceId, companyId).replace(invoice);

  await emitEvent({
    companyId,
    type: "invoice.posted",
    actor: createdBy,
    documentType: "invoice",
    documentId: invoiceId,
    journalEntryId: journalEntry.id,
    data: { invoiceNumber: invoice.invoiceNumber, type: invoice.type, total: invoice.total },
  });

  return invoice;
}

// ─── Build GL lines for invoice ─────────────────────────────

function buildInvoiceJournalLines(invoice: Invoice): JournalLine[] {
  const lines: JournalLine[] = [];

  if (invoice.type === "sales") {
    // Debit: Accounts Receivable (2210) for total
    lines.push({
      accountCode: "2210",
      accountName: "Accounts receivable",
      debit: invoice.total,
      credit: 0,
      description: `AR — ${invoice.contactName}`,
      contactId: invoice.contactId,
    });

    // Credit: Revenue accounts per line (skip zero-amount lines)
    for (const invLine of invoice.lines) {
      const net = roundCurrency(invLine.quantity * invLine.unitPrice);
      if (net === 0) continue;
      lines.push({
        accountCode: invLine.accountCode,
        accountName: invLine.description,
        debit: 0,
        credit: net,
        description: invLine.description,
        contactId: invoice.contactId,
        itemId: invLine.itemId,
        taxCode: invLine.vatRate > 0 ? `LV-${invLine.vatRate}` : undefined,
      });
    }

    // Credit: VAT payable (4230) for total VAT
    if (invoice.vatAmount > 0) {
      lines.push({
        accountCode: "4230",
        accountName: "VAT payable",
        debit: 0,
        credit: invoice.vatAmount,
        description: "Output VAT",
        vatCode: "output",
        contactId: invoice.contactId,
        taxCode: `LV-${invoice.lines[0]?.vatRate ?? 21}`,
        taxAmount: invoice.vatAmount,
      });
    }
  } else {
    // Purchase invoice
    // Credit: Trade payables (4220) for total
    lines.push({
      accountCode: "4220",
      accountName: "Trade payables",
      debit: 0,
      credit: invoice.total,
      description: `AP — ${invoice.contactName}`,
      contactId: invoice.contactId,
    });

    // Debit: Expense/asset accounts per line (skip zero-amount lines)
    for (const invLine of invoice.lines) {
      const net = roundCurrency(invLine.quantity * invLine.unitPrice);
      if (net === 0) continue;
      lines.push({
        accountCode: invLine.accountCode,
        accountName: invLine.description,
        debit: net,
        credit: 0,
        description: invLine.description,
        contactId: invoice.contactId,
        itemId: invLine.itemId,
        taxCode: invLine.vatRate > 0 ? `LV-${invLine.vatRate}` : undefined,
      });
    }

    // Debit: VAT receivable (2310) for total VAT
    if (invoice.vatAmount > 0) {
      lines.push({
        accountCode: "2310",
        accountName: "VAT receivable",
        debit: invoice.vatAmount,
        credit: 0,
        description: "Input VAT",
        vatCode: "input",
        contactId: invoice.contactId,
        taxCode: `LV-${invoice.lines[0]?.vatRate ?? 21}`,
        taxAmount: invoice.vatAmount,
      });
    }
  }

  return lines;
}

// ─── Get invoices ───────────────────────────────────────────

export async function getInvoice(companyId: string, invoiceId: string): Promise<Invoice | null> {
  try {
    const { resource } = await containers.documents()
      .item(invoiceId, companyId)
      .read<Invoice>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export async function listInvoices(
  companyId: string,
  type?: "sales" | "purchase"
): Promise<Invoice[]> {
  const typeFilter = type ? "AND c.type = @type" : "";
  const params: { name: string; value: string }[] = [
    { name: "@cid", value: companyId },
  ];
  if (type) params.push({ name: "@type", value: type });

  const { resources } = await containers.documents().items
    .query<Invoice>({
      query: `SELECT * FROM c WHERE c.companyId = @cid AND IS_DEFINED(c.invoiceNumber) ${typeFilter} ORDER BY c.date DESC`,
      parameters: params,
    })
    .fetchAll();

  return resources;
}
