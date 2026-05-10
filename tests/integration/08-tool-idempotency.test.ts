/**
 * Test #8 — Tool-call-level idempotency.
 *
 * Validates that mutations dispatched through the agent's tool layer are
 * deduped when the caller (or model) supplies a stable `clientToken`. This is
 * a complementary layer to the HTTP-level `X-Idempotency-Key` middleware in
 * `src/backend/middleware/idempotency.ts`:
 *
 *   - HTTP middleware: caches the entire chat response in-memory per replica.
 *   - Tool-level (this test): persists per-tool result in the `idempotency`
 *     Cosmos container, so retries from a *different* replica or after a
 *     restart still dedupe.
 *
 * Two scenarios:
 *   1. Replay with the same args  → second call returns the cached result;
 *      only one invoice exists; no second GL posting is created.
 *   2. Replay with different args  → IdempotencyConflictError is raised
 *      inside the tool layer (the chat handler catches and surfaces it as a
 *      tool-result error). Crucially, no second invoice is created.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── Mock Azure OpenAI client ───────────────────────────────
type ToolCall = {
  id: string;
  function: { name: string; arguments: string };
};
type FakeResponse = { content: string } | { tool_calls: ToolCall[] };
const responseQueue: FakeResponse[] = [];

vi.mock("openai", () => {
  class AzureOpenAI {
    chat = {
      completions: {
        create: async () => {
          const next = responseQueue.shift();
          if (!next) {
            throw new Error(
              "openai mock: response queue exhausted — agent looped further than expected",
            );
          }
          if ("content" in next) {
            return {
              choices: [{ message: { role: "assistant", content: next.content } }],
            };
          }
          return {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: next.tool_calls.map((tc) => ({
                    id: tc.id,
                    type: "function" as const,
                    function: { name: tc.function.name, arguments: tc.function.arguments },
                  })),
                },
              },
            ],
          };
        },
      },
    };
  }
  return { AzureOpenAI };
});

process.env.AZURE_OPENAI_ENDPOINT = "https://fake.openai.azure.com";
process.env.AZURE_OPENAI_API_KEY = "fake-openai-key";

import { getApp, authHeader } from "./_harness/test-server.js";
import { createTestCompany } from "./_harness/factories.js";

interface InvoiceSummary {
  id: string;
  status: string;
  total: number;
  contactName: string;
}

async function preCreateContact(
  app: Awaited<ReturnType<typeof getApp>>,
  companyId: string,
): Promise<string> {
  const res = await request(app as never)
    .post(`/api/companies/${companyId}/contacts`)
    .set(authHeader)
    .send({ name: "ACME SIA", type: "customer", registrationNumber: "40103000060" });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

function createInvoiceArgs(
  companyId: string,
  contactId: string,
  unitPrice: number,
  clientToken: string,
): string {
  return JSON.stringify({
    companyId,
    type: "sales",
    contactId,
    contactName: "ACME SIA",
    date: "2026-04-20",
    dueDate: "2026-05-20",
    lines: [
      {
        description: "Consulting services",
        quantity: 1,
        unitPrice,
        vatRate: 21,
        accountCode: "5120",
      },
    ],
    clientToken,
  });
}

describe("tool-level idempotency (clientToken)", () => {
  beforeEach(() => {
    responseQueue.length = 0;
  });

  it("dedupes a replayed create_invoice with same clientToken + same args", async () => {
    const app = await getApp();
    const company = await createTestCompany(app, { name: "SIA Idempotent" });
    const contactId = await preCreateContact(app, company.id);

    const TOKEN = "tok-create-invoice-001";

    // ─── Phase 1 ───────────────────────────────────────────
    // Model emits create_invoice with clientToken — mutation runs, result is
    // persisted to the idempotency cache.
    responseQueue.push({
      tool_calls: [
        {
          id: "tc-create-1",
          function: {
            name: "create_invoice",
            arguments: createInvoiceArgs(company.id, contactId, 500, TOKEN),
          },
        },
      ],
    });
    responseQueue.push({ content: "Invoice draft created." });

    const phase1 = await request(app as never)
      .post(`/api/chat`)
      .set(authHeader)
      .send({
        companyId: company.id,
        message: "Create an invoice for ACME for €500 consulting.",
        history: [],
      });
    expect(phase1.status).toBe(200);

    const after1 = await request(app as never)
      .get(`/api/companies/${company.id}/invoices`)
      .set(authHeader);
    const invoices1 = after1.body.data as InvoiceSummary[];
    expect(invoices1).toHaveLength(1);
    expect(invoices1[0].total).toBe(605);
    const firstInvoiceId = invoices1[0].id;

    // ─── Phase 2 — replay with identical args + identical clientToken ──
    responseQueue.push({
      tool_calls: [
        {
          id: "tc-create-2",
          function: {
            name: "create_invoice",
            arguments: createInvoiceArgs(company.id, contactId, 500, TOKEN),
          },
        },
      ],
    });
    responseQueue.push({ content: "Already created." });

    const phase2 = await request(app as never)
      .post(`/api/chat`)
      .set(authHeader)
      .send({
        companyId: company.id,
        message: "Create an invoice for ACME for €500 consulting.",
        history: [],
      });
    expect(phase2.status).toBe(200);

    // No duplicate invoice should have been created.
    const after2 = await request(app as never)
      .get(`/api/companies/${company.id}/invoices`)
      .set(authHeader);
    const invoices2 = after2.body.data as InvoiceSummary[];
    expect(invoices2).toHaveLength(1);
    expect(invoices2[0].id).toBe(firstInvoiceId);
  });

  it("rejects clientToken reuse with different args (no duplicate created)", async () => {
    const app = await getApp();
    const company = await createTestCompany(app, { name: "SIA Conflict" });
    const contactId = await preCreateContact(app, company.id);

    const TOKEN = "tok-create-invoice-002";

    // First call — runs at unitPrice=500, caches result for TOKEN.
    responseQueue.push({
      tool_calls: [
        {
          id: "tc-create-a",
          function: {
            name: "create_invoice",
            arguments: createInvoiceArgs(company.id, contactId, 500, TOKEN),
          },
        },
      ],
    });
    responseQueue.push({ content: "Created." });

    const a = await request(app as never)
      .post(`/api/chat`)
      .set(authHeader)
      .send({ companyId: company.id, message: "Create €500 invoice", history: [] });
    expect(a.status).toBe(200);

    // Second call — SAME token, DIFFERENT amount (1000). Dispatcher should
    // throw IdempotencyConflictError; chat handler catches it and produces a
    // tool-result error. No second invoice should be created.
    responseQueue.push({
      tool_calls: [
        {
          id: "tc-create-b",
          function: {
            name: "create_invoice",
            arguments: createInvoiceArgs(company.id, contactId, 1000, TOKEN),
          },
        },
      ],
    });
    responseQueue.push({ content: "Conflict acknowledged." });

    const b = await request(app as never)
      .post(`/api/chat`)
      .set(authHeader)
      .send({ companyId: company.id, message: "Create €1000 invoice", history: [] });
    expect(b.status).toBe(200);

    const after = await request(app as never)
      .get(`/api/companies/${company.id}/invoices`)
      .set(authHeader);
    const invoices = after.body.data as InvoiceSummary[];
    // Only the first €500 invoice exists.
    expect(invoices).toHaveLength(1);
    expect(invoices[0].total).toBe(605);
  });

  it("does NOT dedupe when no clientToken is supplied (current default behavior preserved)", async () => {
    const app = await getApp();
    const company = await createTestCompany(app, { name: "SIA No Token" });
    const contactId = await preCreateContact(app, company.id);

    // Two identical chat runs with identical args but no clientToken — the
    // tool layer cannot dedupe, so two distinct invoices are produced.
    for (let i = 0; i < 2; i++) {
      responseQueue.push({
        tool_calls: [
          {
            id: `tc-create-no-tok-${i}`,
            function: {
              name: "create_invoice",
              arguments: JSON.stringify({
                companyId: company.id,
                type: "sales",
                contactId,
                contactName: "ACME SIA",
                date: "2026-04-20",
                dueDate: "2026-05-20",
                lines: [
                  {
                    description: "Consulting services",
                    quantity: 1,
                    unitPrice: 500,
                    vatRate: 21,
                    accountCode: "5120",
                  },
                ],
              }),
            },
          },
        ],
      });
      responseQueue.push({ content: "Created." });

      const res = await request(app as never)
        .post(`/api/chat`)
        .set(authHeader)
        .send({ companyId: company.id, message: "Create invoice", history: [] });
      expect(res.status).toBe(200);
    }

    const after = await request(app as never)
      .get(`/api/companies/${company.id}/invoices`)
      .set(authHeader);
    const invoices = after.body.data as InvoiceSummary[];
    expect(invoices).toHaveLength(2);
  });
});
