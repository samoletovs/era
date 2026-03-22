import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import { postJournalEntry, GLError } from "./ledger.js";
import { emitEvent } from "./events.js";
import { getActiveRule, evaluatePaymentRule } from "./posting-rules.js";
import type { Payment, PaymentAllocation, Invoice, JournalLine } from "@shared/types";

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Create & Post Payment ──────────────────────────────────

interface CreatePaymentInput {
  companyId: string;
  type: "incoming" | "outgoing";
  contactId: string;
  contactName: string;
  date: string;
  amount: number;
  bankAccountIban: string;
  reference: string;
  invoiceAllocations: Array<{
    invoiceId: string;
    invoiceNumber: string;
    amount: number;
  }>;
  createdBy: string;
}

export async function createAndPostPayment(input: CreatePaymentInput): Promise<Payment> {
  if (input.amount <= 0) {
    throw new GLError("INVALID_AMOUNT", "Payment amount must be positive");
  }

  // Validate allocations don't exceed payment
  const totalAllocated = roundCurrency(
    input.invoiceAllocations.reduce((s, a) => s + a.amount, 0)
  );
  if (totalAllocated > input.amount) {
    throw new GLError(
      "OVER_ALLOCATED",
      `Allocated ${totalAllocated} exceeds payment ${input.amount}`
    );
  }

  const now = new Date().toISOString();
  const payment: Payment = {
    id: uuidv4(),
    docType: "payment" as const,
    companyId: input.companyId,
    type: input.type,
    contactId: input.contactId,
    contactName: input.contactName,
    date: input.date,
    amount: input.amount,
    currency: "EUR",
    bankAccountIban: input.bankAccountIban,
    reference: input.reference,
    invoiceAllocations: input.invoiceAllocations,
    status: "posted",
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  };

  // Build GL journal lines — try rule engine first, fall back to hardcoded
  const ruleType = input.type === "incoming" ? "incoming-payment" as const : "outgoing-payment" as const;
  const rule = await getActiveRule("LV", ruleType);
  let journalLines: JournalLine[];
  if (rule) {
    const ruleResult = evaluatePaymentRule(rule, payment);
    journalLines = ruleResult ?? buildPaymentJournalLines(payment);
  } else {
    journalLines = buildPaymentJournalLines(payment);
  }

  // Post journal entry
  const journalEntry = await postJournalEntry({
    companyId: input.companyId,
    date: input.date,
    description: `${input.type === "incoming" ? "Payment received from" : "Payment to"} ${input.contactName} — ${input.reference}`,
    lines: journalLines,
    sourceType: "payment",
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
    type: "payment.posted",
    actor: input.createdBy,
    documentType: "payment",
    documentId: payment.id,
    journalEntryId: journalEntry.id,
    data: { type: payment.type, amount: payment.amount, contactName: payment.contactName },
  });

  return payment;
}

// ─── Build GL lines ─────────────────────────────────────────

function buildPaymentJournalLines(payment: Payment): JournalLine[] {
  if (payment.type === "incoming") {
    // Customer payment received
    return [
      {
        accountCode: "2420",       // Bank accounts
        accountName: "Bank accounts",
        debit: payment.amount,
        credit: 0,
        description: `Received from ${payment.contactName}`,
        contactId: payment.contactId,
      },
      {
        accountCode: "2210",       // Accounts receivable
        accountName: "Accounts receivable",
        debit: 0,
        credit: payment.amount,
        description: `AR settlement — ${payment.reference}`,
        contactId: payment.contactId,
      },
    ];
  } else {
    // Vendor payment sent
    return [
      {
        accountCode: "4220",       // Trade payables
        accountName: "Trade payables",
        debit: payment.amount,
        credit: 0,
        description: `AP settlement — ${payment.reference}`,
        contactId: payment.contactId,
      },
      {
        accountCode: "2420",       // Bank accounts
        accountName: "Bank accounts",
        debit: 0,
        credit: payment.amount,
        description: `Paid to ${payment.contactName}`,
        contactId: payment.contactId,
      },
    ];
  }
}

// ─── Update invoices after payment ──────────────────────────

async function updateInvoicesForPayment(
  companyId: string,
  allocations: PaymentAllocation[],
  journalEntryId: string
) {
  for (const alloc of allocations) {
    try {
      const { resource: invoice } = await containers.documents()
        .item(alloc.invoiceId, companyId)
        .read<Invoice>();

      if (!invoice) continue;

      invoice.amountPaid = roundCurrency(invoice.amountPaid + alloc.amount);
      invoice.paymentJournalEntryIds.push(journalEntryId);

      if (invoice.amountPaid >= invoice.total) {
        invoice.status = "paid";
      } else if (invoice.amountPaid > 0) {
        invoice.status = "partially_paid";
      }

      invoice.updatedAt = new Date().toISOString();
      await containers.documents().item(alloc.invoiceId, companyId).replace(invoice);
    } catch {
      // Invoice not found — skip
    }
  }
}

// ─── List payments ──────────────────────────────────────────

export async function listPayments(
  companyId: string,
  type?: "incoming" | "outgoing"
): Promise<Payment[]> {
  const typeFilter = type ? "AND c.type = @type" : "";
  const params: { name: string; value: string }[] = [
    { name: "@cid", value: companyId },
  ];
  if (type) params.push({ name: "@type", value: type });

  const { resources } = await containers.documents().items
    .query<Payment>({
      query: `SELECT * FROM c WHERE c.companyId = @cid AND c.docType = 'payment' ${typeFilter} ORDER BY c.date DESC`,
      parameters: params,
    })
    .fetchAll();

  return resources;
}
