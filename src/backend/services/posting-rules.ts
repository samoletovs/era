// Posting Rule Engine — evaluates country-specific rules to produce GL journal lines
// Falls back gracefully: if no rule is found, callers use hardcoded logic

import { containers } from './cosmos.js';
import type { PostingRule, JournalLine, Invoice, Payment } from '@shared/types';

// ─── Fetch active rule ──────────────────────────────────────

export async function getActiveRule(
  country: string,
  documentType: PostingRule['documentType'],
): Promise<PostingRule | null> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { resources } = await containers
      .rules()
      .items.query<PostingRule>({
        query: `SELECT * FROM c WHERE c.country = @country AND c.documentType = @docType AND c.isActive = true AND c.effectiveFrom <= @today AND (NOT IS_DEFINED(c.effectiveTo) OR c.effectiveTo = null OR c.effectiveTo >= @today) ORDER BY c.version DESC OFFSET 0 LIMIT 1`,
        parameters: [
          { name: '@country', value: country },
          { name: '@docType', value: documentType },
          { name: '@today', value: today },
        ],
      })
      .fetchAll();
    return resources[0] ?? null;
  } catch {
    return null;
  }
}

// ─── Evaluate rule against a document ───────────────────────

interface InvoiceContext {
  type: 'invoice';
  invoice: Invoice;
}

interface PaymentContext {
  type: 'payment';
  payment: Payment;
}

type DocumentContext = InvoiceContext | PaymentContext;

function resolveAmount(expr: string, ctx: DocumentContext): number {
  if (ctx.type === 'invoice') {
    const inv = ctx.invoice;
    switch (expr) {
      case 'invoice.total':
        return inv.total;
      case 'invoice.subtotal':
        return inv.subtotal;
      case 'invoice.vatAmount':
        return inv.vatAmount;
      default:
        return 0;
    }
  }
  if (ctx.type === 'payment') {
    const pmt = ctx.payment;
    switch (expr) {
      case 'payment.amount':
        return pmt.amount;
      default:
        return 0;
    }
  }
  return 0;
}

function resolveLineAmount(
  expr: string,
  invLine: { quantity: number; unitPrice: number; vatAmount: number; vatRate: number },
): number {
  const net = Math.round(invLine.quantity * invLine.unitPrice * 100) / 100;
  switch (expr) {
    case 'line.netAmount':
      return net;
    case 'line.vatAmount':
      return invLine.vatAmount;
    case 'line.total':
      return Math.round((net + invLine.vatAmount) * 100) / 100;
    default:
      return 0;
  }
}

/**
 * Builds the provenance partial that's spread onto every JournalLine
 * produced by a rule evaluation. Surfaces the rule identity (id /
 * version / country / documentType) so the UI can render the
 * "🤖 Agent · LV-rules-v1.2 · sales-invoice" badge and the audit page
 * can link straight to the rule that produced the line. The optional
 * agent reasoning excerpt is plumbed through from chat-tool callers.
 */
function buildProvenance(
  rule: PostingRule,
  options?: { agentReasoningExcerpt?: string },
): Pick<
  JournalLine,
  | 'postingRuleId'
  | 'postingRuleVersion'
  | 'postingRuleCountry'
  | 'postingRuleDocumentType'
  | 'agentReasoningExcerpt'
> {
  const excerpt = options?.agentReasoningExcerpt?.trim();
  return {
    postingRuleId: rule.id,
    postingRuleVersion: rule.version,
    postingRuleCountry: rule.country,
    postingRuleDocumentType: rule.documentType,
    ...(excerpt ? { agentReasoningExcerpt: excerpt.slice(0, 280) } : {}),
  };
}

export function evaluateInvoiceRule(
  rule: PostingRule,
  invoice: Invoice,
  options?: { agentReasoningExcerpt?: string },
): JournalLine[] | null {
  const ctx: InvoiceContext = { type: 'invoice', invoice };
  const journalLines: JournalLine[] = [];
  const provenance = buildProvenance(rule, options);

  for (const rl of rule.lines) {
    // Check if this rule line uses per-invoice-line expansion
    if (rl.amountExpr.startsWith('line.')) {
      // Expand per invoice line
      for (const invLine of invoice.lines) {
        const amount = resolveLineAmount(rl.amountExpr, invLine);
        if (amount === 0) continue;
        journalLines.push({
          accountCode:
            rl.accountCode === '{{line.accountCode}}' ? invLine.accountCode : rl.accountCode,
          accountName:
            rl.accountCode === '{{line.accountCode}}' ? invLine.description : rl.accountName,
          debit: rl.side === 'debit' ? amount : 0,
          credit: rl.side === 'credit' ? amount : 0,
          description: rl.description || invLine.description,
          contactId: invoice.contactId,
          itemId: invLine.itemId,
          taxCode: rl.taxCode,
          taxAmount: rl.amountExpr === 'line.vatAmount' ? amount : undefined,
          vatCode: rl.taxCode?.includes('output')
            ? 'output'
            : rl.taxCode?.includes('input')
              ? 'input'
              : undefined,
          ...provenance,
        });
      }
    } else {
      // Document-level amount
      const amount = resolveAmount(rl.amountExpr, ctx);
      if (amount === 0) continue;
      journalLines.push({
        accountCode: rl.accountCode,
        accountName: rl.accountName,
        debit: rl.side === 'debit' ? amount : 0,
        credit: rl.side === 'credit' ? amount : 0,
        description: rl.description || rule.name,
        contactId: invoice.contactId,
        taxCode: rl.taxCode,
        taxAmount:
          rl.amountExpr.includes('vat') || rl.amountExpr.includes('Vat') ? amount : undefined,
        vatCode: rl.taxCode?.includes('output')
          ? 'output'
          : rl.taxCode?.includes('input')
            ? 'input'
            : undefined,
        ...provenance,
      });
    }
  }

  // Validate: debits must equal credits
  const totalDebit = Math.round(journalLines.reduce((s, l) => s + l.debit, 0) * 100) / 100;
  const totalCredit = Math.round(journalLines.reduce((s, l) => s + l.credit, 0) * 100) / 100;
  if (totalDebit !== totalCredit || totalDebit === 0) {
    return null; // Rule produced invalid output — fall back to hardcoded
  }

  return journalLines;
}

export function evaluatePaymentRule(
  rule: PostingRule,
  payment: Payment,
  options?: { agentReasoningExcerpt?: string },
): JournalLine[] | null {
  const ctx: PaymentContext = { type: 'payment', payment };
  const journalLines: JournalLine[] = [];
  const provenance = buildProvenance(rule, options);

  for (const rl of rule.lines) {
    const amount = resolveAmount(rl.amountExpr, ctx);
    if (amount === 0) continue;
    journalLines.push({
      accountCode: rl.accountCode,
      accountName: rl.accountName,
      debit: rl.side === 'debit' ? amount : 0,
      credit: rl.side === 'credit' ? amount : 0,
      description: rl.description || rule.name,
      contactId: payment.contactId,
      ...provenance,
    });
  }

  const totalDebit = Math.round(journalLines.reduce((s, l) => s + l.debit, 0) * 100) / 100;
  const totalCredit = Math.round(journalLines.reduce((s, l) => s + l.credit, 0) * 100) / 100;
  if (totalDebit !== totalCredit || totalDebit === 0) {
    return null;
  }

  return journalLines;
}

// ─── Seed rules from TypeScript definitions ─────────────────

export async function seedRules(rules: PostingRule[]): Promise<number> {
  let count = 0;
  for (const rule of rules) {
    try {
      // Check if rule already exists by country + documentType + version
      const { resources } = await containers
        .rules()
        .items.query<PostingRule>({
          query:
            'SELECT c.id FROM c WHERE c.country = @country AND c.documentType = @docType AND c.version = @version',
          parameters: [
            { name: '@country', value: rule.country },
            { name: '@docType', value: rule.documentType },
            { name: '@version', value: rule.version },
          ],
        })
        .fetchAll();

      if (resources.length === 0) {
        await containers.rules().items.create(rule);
        count++;
      }
    } catch {
      // Skip duplicates
    }
  }
  return count;
}
