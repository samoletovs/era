import { describe, it, expect } from "vitest";
import {
  assembleAuditChain,
  AuditChainError,
  type AuditChainLoaders,
} from "../../src/backend/services/audit-trail.js";
import type {
  BusinessEvent,
  ChatMessage,
  Invoice,
  JournalEntry,
  Payment,
  PostingRule,
} from "@shared/types";

const COMPANY = "co-1";

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: "je-1",
    companyId: COMPANY,
    docType: "journal-entry",
    isActive: true,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    createdBy: "user-1",
    entryNumber: "JE-00001",
    date: "2026-05-01",
    description: "Sales invoice",
    lines: [
      {
        accountCode: "2210",
        accountName: "Trade debtors",
        debit: 121,
        credit: 0,
        postingRuleId: "lv-sales-invoice-v1",
        postingRuleVersion: 1,
        postingRuleCountry: "LV",
        postingRuleDocumentType: "sales-invoice",
        agentReasoningExcerpt: "Sales invoice — net + VAT split.",
      },
      {
        accountCode: "6110",
        accountName: "Sales revenue",
        debit: 0,
        credit: 100,
      },
      {
        accountCode: "4230",
        accountName: "VAT payable",
        debit: 0,
        credit: 21,
      },
    ],
    status: "posted",
    period: "2026-05",
    sourceType: "invoice",
    sourceId: "inv-1",
    totalDebit: 121,
    totalCredit: 121,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<BusinessEvent> = {}): BusinessEvent {
  return {
    id: "evt-1",
    companyId: COMPANY,
    type: "invoice.posted",
    timestamp: "2026-05-01T00:00:00.000Z",
    actor: "user-1",
    documentType: "invoice",
    documentId: "inv-1",
    journalEntryId: "je-1",
    data: { chatMessageId: "msg-1" },
    ...overrides,
  };
}

function makeInvoice(): Invoice {
  return {
    id: "inv-1",
    companyId: COMPANY,
    docType: "invoice",
    isActive: true,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    createdBy: "user-1",
    invoiceNumber: "INV-00001",
    type: "sales",
    contactId: "c-1",
    contactName: "ACME",
    date: "2026-05-01",
    dueDate: "2026-05-31",
    lines: [],
    subtotal: 100,
    vatAmount: 21,
    total: 121,
    amountPaid: 0,
    status: "posted",
    currency: "EUR",
    documentNumber: "INV-00001",
    documentDate: "2026-05-01",
    paymentJournalEntryIds: [],
  };
}

function makeRule(): PostingRule {
  return {
    id: "lv-sales-invoice-v1",
    country: "LV",
    documentType: "sales-invoice",
    name: "LV sales invoice",
    description: "",
    version: 1,
    conditions: [],
    lines: [],
    effectiveFrom: "2026-01-01",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdBy: "system",
  };
}

function makeChat(): ChatMessage {
  return {
    id: "msg-1",
    companyId: COMPANY,
    role: "user",
    content: "Post a sales invoice for €100 to ACME",
    timestamp: "2026-05-01T00:00:00.000Z",
  };
}

function loaders(overrides: Partial<AuditChainLoaders> = {}): AuditChainLoaders {
  return {
    event: async () => null,
    eventByEntry: async () => null,
    journalEntry: async () => null,
    chatMessage: async () => null,
    invoice: async () => null,
    payment: async () => null,
    rule: async () => null,
    ...overrides,
  };
}

describe("assembleAuditChain — anchor by eventId", () => {
  it("resolves the full chain when every link exists", async () => {
    const event = makeEvent();
    const entry = makeEntry();
    const invoice = makeInvoice();
    const rule = makeRule();
    const chat = makeChat();

    const chain = await assembleAuditChain(
      { companyId: COMPANY, eventId: "evt-1" },
      loaders({
        event: async () => event,
        journalEntry: async () => entry,
        invoice: async () => invoice,
        rule: async () => rule,
        chatMessage: async () => chat,
      }),
    );

    expect(chain.event).toBe(event);
    expect(chain.journalEntry).toBe(entry);
    expect(chain.invoice).toBe(invoice);
    expect(chain.payment).toBeNull();
    expect(chain.rule).toBe(rule);
    expect(chain.chatMessage).toBe(chat);
  });

  it("throws EVENT_NOT_FOUND when the event is missing", async () => {
    await expect(
      assembleAuditChain({ companyId: COMPANY, eventId: "evt-x" }, loaders()),
    ).rejects.toThrowError(/Event evt-x not found/);
  });

  it("returns a partial chain when JE is missing (degrades gracefully)", async () => {
    const chain = await assembleAuditChain(
      { companyId: COMPANY, eventId: "evt-1" },
      loaders({ event: async () => makeEvent() }),
    );
    expect(chain.event).not.toBeNull();
    expect(chain.journalEntry).toBeNull();
    expect(chain.rule).toBeNull();
  });

  it("resolves payment source when documentType=payment", async () => {
    const event = makeEvent({
      type: "payment.posted",
      documentType: "payment",
      documentId: "pmt-1",
    });
    const payment: Payment = {
      id: "pmt-1",
      companyId: COMPANY,
      docType: "payment",
      isActive: true,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      createdBy: "user-1",
      type: "incoming",
      contactId: "c-1",
      contactName: "ACME",
      date: "2026-05-01",
      amount: 121,
      currency: "EUR",
      bankAccountIban: "LV00000",
      reference: "INV-00001",
      invoiceAllocations: [],
      status: "posted",
    };

    const chain = await assembleAuditChain(
      { companyId: COMPANY, eventId: "evt-1" },
      loaders({
        event: async () => event,
        payment: async () => payment,
      }),
    );

    expect(chain.payment).toBe(payment);
    expect(chain.invoice).toBeNull();
  });

  it("falls back to journalEntry.sourceType when event has no documentType", async () => {
    const event = makeEvent({ documentType: undefined, documentId: undefined });
    const entry = makeEntry();
    const invoice = makeInvoice();

    const chain = await assembleAuditChain(
      { companyId: COMPANY, eventId: "evt-1" },
      loaders({
        event: async () => event,
        journalEntry: async () => entry,
        invoice: async () => invoice,
      }),
    );

    expect(chain.invoice).toBe(invoice);
  });

  it("does not load chatMessage when no candidate id is on event.data", async () => {
    const event = makeEvent({ data: undefined });
    let chatCalls = 0;
    const chain = await assembleAuditChain(
      { companyId: COMPANY, eventId: "evt-1" },
      loaders({
        event: async () => event,
        chatMessage: async () => {
          chatCalls += 1;
          return null;
        },
      }),
    );
    expect(chatCalls).toBe(0);
    expect(chain.chatMessage).toBeNull();
  });

  it("recognises alternate chat-id keys (messageId, originMessageId)", async () => {
    const event = makeEvent({ data: { originMessageId: "msg-9" } });
    const chain = await assembleAuditChain(
      { companyId: COMPANY, eventId: "evt-1" },
      loaders({
        event: async () => event,
        chatMessage: async (_cid, id) =>
          id === "msg-9" ? { ...makeChat(), id: "msg-9" } : null,
      }),
    );
    expect(chain.chatMessage?.id).toBe("msg-9");
  });

  it("does not load rule when no line carries provenance", async () => {
    const event = makeEvent();
    const entry = makeEntry({
      lines: [
        { accountCode: "2210", accountName: "AR", debit: 121, credit: 0 },
        { accountCode: "6110", accountName: "Rev", debit: 0, credit: 121 },
      ],
    });
    let ruleCalls = 0;
    const chain = await assembleAuditChain(
      { companyId: COMPANY, eventId: "evt-1" },
      loaders({
        event: async () => event,
        journalEntry: async () => entry,
        rule: async () => {
          ruleCalls += 1;
          return null;
        },
      }),
    );
    expect(ruleCalls).toBe(0);
    expect(chain.rule).toBeNull();
  });
});

describe("assembleAuditChain — anchor by journalEntryId", () => {
  it("resolves chain when there is a matching event", async () => {
    const event = makeEvent();
    const entry = makeEntry();
    const chain = await assembleAuditChain(
      { companyId: COMPANY, journalEntryId: "je-1" },
      loaders({
        eventByEntry: async () => event,
        journalEntry: async () => entry,
      }),
    );
    expect(chain.event).toBe(event);
    expect(chain.journalEntry).toBe(entry);
  });

  it("returns the entry even when there is no matching event (manual posting)", async () => {
    const entry = makeEntry();
    const chain = await assembleAuditChain(
      { companyId: COMPANY, journalEntryId: "je-1" },
      loaders({
        eventByEntry: async () => null,
        journalEntry: async () => entry,
      }),
    );
    expect(chain.event).toBeNull();
    expect(chain.journalEntry).toBe(entry);
  });

  it("throws ENTRY_NOT_FOUND when neither event nor entry exists", async () => {
    await expect(
      assembleAuditChain(
        { companyId: COMPANY, journalEntryId: "je-x" },
        loaders(),
      ),
    ).rejects.toThrowError(/Journal entry je-x not found/);
  });
});

describe("assembleAuditChain — input validation", () => {
  it("throws MISSING_KEY when neither id is supplied", async () => {
    await expect(
      assembleAuditChain({ companyId: COMPANY }, loaders()),
    ).rejects.toBeInstanceOf(AuditChainError);
    await expect(
      assembleAuditChain({ companyId: COMPANY }, loaders()),
    ).rejects.toThrowError(/eventId or journalEntryId/);
  });

  it("AuditChainError carries a stable code", async () => {
    try {
      await assembleAuditChain({ companyId: COMPANY }, loaders());
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AuditChainError);
      expect((err as AuditChainError).code).toBe("MISSING_KEY");
    }
  });
});
