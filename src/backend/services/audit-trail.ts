// Audit-trail chain assembler.
//
// Phase 2 explainability — given any anchor in the chain (a BusinessEvent
// id or a JournalEntry id), assemble the full provenance tree the UI
// needs to answer "where did this row come from?":
//
//   ChatMessage  →  BusinessEvent  →  JournalEntry (+lines)
//                                   →  Source document (Invoice / Payment)
//                                   →  Posting rule (dereferenced from line provenance)
//
// All lookups are best-effort: any link that can't be resolved degrades
// to `null` rather than throwing, so the audit page can render a partial
// tree even for hand-posted manual entries that have no rule provenance
// or no originating chat message.

import { containers } from './cosmos.js';
import type {
  BusinessEvent,
  ChatMessage,
  Invoice,
  JournalEntry,
  Payment,
  PostingRule,
} from '@shared/types';

export interface AuditChain {
  /** Always present; the anchor for the rest of the chain. */
  event: BusinessEvent | null;
  /** Originating user chat message, if the event was emitted from a chat tool. */
  chatMessage: ChatMessage | null;
  /** Posted GL entry referenced by the event (or matched by id when the entry was the anchor). */
  journalEntry: JournalEntry | null;
  /** Source document for the posting (sales/purchase invoice or payment), when applicable. */
  invoice: Invoice | null;
  payment: Payment | null;
  /** Posting rule dereferenced from the first line that carries provenance. */
  rule: PostingRule | null;
}

interface AuditChainKey {
  companyId: string;
  /** Provide exactly one of these. */
  eventId?: string;
  journalEntryId?: string;
}

export class AuditChainError extends Error {
  constructor(
    public readonly code: 'MISSING_KEY' | 'EVENT_NOT_FOUND' | 'ENTRY_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'AuditChainError';
  }
}

/**
 * Loads a BusinessEvent by id within a company partition.
 *
 * BusinessEvents are partitioned by companyId, but their stored id is a
 * UUID, so a point read needs both. We fall back to a query if the
 * point read misses (older test fixtures sometimes store with a
 * different partition key path, and we'd rather degrade gracefully than
 * 500 the audit page).
 */
async function loadEvent(companyId: string, eventId: string): Promise<BusinessEvent | null> {
  try {
    const { resource } = await containers.events().item(eventId, companyId).read<BusinessEvent>();
    if (resource) return resource;
  } catch {
    // fall through to query
  }
  try {
    const { resources } = await containers
      .events()
      .items.query<BusinessEvent>({
        query: 'SELECT * FROM c WHERE c.companyId = @cid AND c.id = @id',
        parameters: [
          { name: '@cid', value: companyId },
          { name: '@id', value: eventId },
        ],
      })
      .fetchAll();
    return resources[0] ?? null;
  } catch {
    return null;
  }
}

async function loadJournalEntry(companyId: string, entryId: string): Promise<JournalEntry | null> {
  try {
    const { resources } = await containers
      .ledger()
      .items.query<JournalEntry>({
        query:
          "SELECT * FROM c WHERE c.companyId = @cid AND c.id = @id AND c.docType = 'journal-entry'",
        parameters: [
          { name: '@cid', value: companyId },
          { name: '@id', value: entryId },
        ],
      })
      .fetchAll();
    return resources[0] ?? null;
  } catch {
    return null;
  }
}

async function loadEventByJournalEntry(
  companyId: string,
  entryId: string,
): Promise<BusinessEvent | null> {
  try {
    const { resources } = await containers
      .events()
      .items.query<BusinessEvent>({
        query:
          'SELECT * FROM c WHERE c.companyId = @cid AND c.journalEntryId = @jid ORDER BY c.timestamp DESC OFFSET 0 LIMIT 1',
        parameters: [
          { name: '@cid', value: companyId },
          { name: '@jid', value: entryId },
        ],
      })
      .fetchAll();
    return resources[0] ?? null;
  } catch {
    return null;
  }
}

async function loadChatMessage(companyId: string, messageId: string): Promise<ChatMessage | null> {
  try {
    const { resources } = await containers
      .chat()
      .items.query<ChatMessage>({
        query: 'SELECT * FROM c WHERE c.companyId = @cid AND c.id = @id',
        parameters: [
          { name: '@cid', value: companyId },
          { name: '@id', value: messageId },
        ],
      })
      .fetchAll();
    return resources[0] ?? null;
  } catch {
    return null;
  }
}

async function loadInvoice(companyId: string, invoiceId: string): Promise<Invoice | null> {
  try {
    const { resources } = await containers
      .documents()
      .items.query<Invoice>({
        query: "SELECT * FROM c WHERE c.companyId = @cid AND c.id = @id AND c.docType = 'invoice'",
        parameters: [
          { name: '@cid', value: companyId },
          { name: '@id', value: invoiceId },
        ],
      })
      .fetchAll();
    return resources[0] ?? null;
  } catch {
    return null;
  }
}

async function loadPayment(companyId: string, paymentId: string): Promise<Payment | null> {
  try {
    const { resources } = await containers
      .documents()
      .items.query<Payment>({
        query: "SELECT * FROM c WHERE c.companyId = @cid AND c.id = @id AND c.docType = 'payment'",
        parameters: [
          { name: '@cid', value: companyId },
          { name: '@id', value: paymentId },
        ],
      })
      .fetchAll();
    return resources[0] ?? null;
  } catch {
    return null;
  }
}

async function loadRule(ruleId: string): Promise<PostingRule | null> {
  try {
    // Posting rules are partitioned by country in our schema, but the
    // simplest cross-partition read is a single-row query by id.
    const { resources } = await containers
      .rules()
      .items.query<PostingRule>({
        query: 'SELECT * FROM c WHERE c.id = @id',
        parameters: [{ name: '@id', value: ruleId }],
      })
      .fetchAll();
    return resources[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Pure-function loader interface. Tests inject a mock loader to drive
 * the assembler without standing up Cosmos. The HTTP route uses
 * `defaultLoaders()` which wraps the real Cosmos containers.
 */
export interface AuditChainLoaders {
  event: (companyId: string, eventId: string) => Promise<BusinessEvent | null>;
  eventByEntry: (companyId: string, entryId: string) => Promise<BusinessEvent | null>;
  journalEntry: (companyId: string, entryId: string) => Promise<JournalEntry | null>;
  chatMessage: (companyId: string, messageId: string) => Promise<ChatMessage | null>;
  invoice: (companyId: string, invoiceId: string) => Promise<Invoice | null>;
  payment: (companyId: string, paymentId: string) => Promise<Payment | null>;
  rule: (ruleId: string) => Promise<PostingRule | null>;
}

export function defaultLoaders(): AuditChainLoaders {
  return {
    event: loadEvent,
    eventByEntry: loadEventByJournalEntry,
    journalEntry: loadJournalEntry,
    chatMessage: loadChatMessage,
    invoice: loadInvoice,
    payment: loadPayment,
    rule: loadRule,
  };
}

/**
 * Assemble the full audit chain starting from either an event id or a
 * journal-entry id. Pure orchestration over `loaders` — no Cosmos
 * dependencies leak in here, which keeps unit tests simple.
 */
export async function assembleAuditChain(
  key: AuditChainKey,
  loaders: AuditChainLoaders = defaultLoaders(),
): Promise<AuditChain> {
  if (!key.eventId && !key.journalEntryId) {
    throw new AuditChainError('MISSING_KEY', 'Either eventId or journalEntryId is required');
  }

  // Resolve the event first — it's the spine of the chain.
  let event: BusinessEvent | null = null;
  if (key.eventId) {
    event = await loaders.event(key.companyId, key.eventId);
    if (!event) {
      throw new AuditChainError(
        'EVENT_NOT_FOUND',
        `Event ${key.eventId} not found in company ${key.companyId}`,
      );
    }
  } else if (key.journalEntryId) {
    event = await loaders.eventByEntry(key.companyId, key.journalEntryId);
    // No event is OK — entry may have been hand-posted without an
    // emitted business event. We still continue and resolve the entry.
  }

  // Pick the JE id either from the event or from the explicit key.
  const journalEntryId =
    event?.journalEntryId ??
    (event?.documentType === 'journal-entry' ? event.documentId : undefined) ??
    key.journalEntryId;

  const journalEntry = journalEntryId
    ? await loaders.journalEntry(key.companyId, journalEntryId)
    : null;

  if (key.journalEntryId && !journalEntry && !event) {
    throw new AuditChainError(
      'ENTRY_NOT_FOUND',
      `Journal entry ${key.journalEntryId} not found in company ${key.companyId}`,
    );
  }

  // Originating chat message (best-effort).
  const chatMessageId = pickChatMessageId(event);
  const chatMessage = chatMessageId
    ? await loaders.chatMessage(key.companyId, chatMessageId)
    : null;

  // Source document — invoice or payment, depending on event documentType.
  let invoice: Invoice | null = null;
  let payment: Payment | null = null;
  if (event?.documentType === 'invoice' && event.documentId) {
    invoice = await loaders.invoice(key.companyId, event.documentId);
  } else if (event?.documentType === 'payment' && event.documentId) {
    payment = await loaders.payment(key.companyId, event.documentId);
  } else if (journalEntry?.sourceType === 'invoice' && journalEntry.sourceId) {
    invoice = await loaders.invoice(key.companyId, journalEntry.sourceId);
  } else if (journalEntry?.sourceType === 'payment' && journalEntry.sourceId) {
    payment = await loaders.payment(key.companyId, journalEntry.sourceId);
  }

  // Posting rule — pick the first line that carries provenance.
  const ruleId = pickRuleId(journalEntry);
  const rule = ruleId ? await loaders.rule(ruleId) : null;

  return { event, chatMessage, journalEntry, invoice, payment, rule };
}

function pickChatMessageId(event: BusinessEvent | null): string | undefined {
  if (!event?.data) return undefined;
  const data = event.data as Record<string, unknown>;
  const candidates = ['chatMessageId', 'messageId', 'originMessageId'];
  for (const key of candidates) {
    const v = data[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function pickRuleId(entry: JournalEntry | null): string | undefined {
  if (!entry?.lines?.length) return undefined;
  for (const line of entry.lines) {
    if (line.postingRuleId) return line.postingRuleId;
  }
  return undefined;
}
