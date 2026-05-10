/**
 * Test #5 — Chat-driven invoice creation.
 *
 * Validates that era's natural-language agent endpoint (POST /chat) can drive
 * the full create-contact → create-invoice → post-invoice flow via tool calls,
 * and that each tool produces correct GL postings just as the direct API does.
 *
 * The Azure OpenAI client is mocked: rather than calling a real LLM, we queue
 * a deterministic sequence of "assistant turns" that simulate exactly the tool
 * calls a well-behaved model would emit for the prompt:
 *   "Create an invoice for ACME for €500 consulting services"
 *
 * What this proves:
 *   - The chat endpoint wires user input → tool execution → real era services.
 *   - Tool arguments survive the round-trip through JSON serialisation.
 *   - The resulting invoice is posted with a balanced GL entry just like
 *     when called directly via the REST API.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── Mock Azure OpenAI client ───────────────────────────────
// Queue is a list of "model responses" — one per agent loop iteration.
// Each entry is either a list of tool calls or a final text content.
type ToolCall = {
  id: string;
  function: { name: string; arguments: string };
};
type FakeResponse =
  | { content: string }
  | { tool_calls: ToolCall[] };

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
              choices: [
                {
                  message: { role: "assistant", content: next.content },
                },
              ],
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
                    function: {
                      name: tc.function.name,
                      arguments: tc.function.arguments,
                    },
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

// Provide Azure OpenAI env vars BEFORE the backend is imported; getClient()
// throws otherwise.
process.env.AZURE_OPENAI_ENDPOINT = "https://fake.openai.azure.com";
process.env.AZURE_OPENAI_API_KEY = "fake-openai-key";

// Imports must come AFTER vi.mock + env setup — but vi.mock is hoisted by vitest.
import { getApp, authHeader } from "./_harness/test-server.js";
import { createTestCompany } from "./_harness/factories.js";

describe("chat-driven invoice creation", () => {
  beforeEach(() => {
    responseQueue.length = 0;
  });

  it("creates + posts an invoice through scripted tool calls (existing contact)", async () => {
    const app = await getApp();
    const company = await createTestCompany(app, { name: "SIA Chat Lite" });

    // Pre-create the contact via the real API so the agent has a stable id to use.
    const contactRes = await request(app as never)
      .post(`/api/companies/${company.id}/contacts`)
      .set(authHeader)
      .send({
        name: "ACME SIA",
        type: "customer",
        registrationNumber: "40103000050",
      });
    expect(contactRes.status).toBe(201);
    const contactId = contactRes.body.data.id as string;

    // Iter 1: model calls find_contact → real services return the existing contact.
    responseQueue.push({
      tool_calls: [
        {
          id: "tc-find",
          function: {
            name: "find_contact",
            arguments: JSON.stringify({
              companyId: company.id,
              name: "ACME SIA",
            }),
          },
        },
      ],
    });

    // Iter 2: model creates a draft sales invoice for €500 + 21% VAT.
    responseQueue.push({
      tool_calls: [
        {
          id: "tc-create-invoice",
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

    // Iter 3: model needs the invoice id from the previous tool result.
    // The chat handler appends each tool result to the message stream, so a
    // real model would read it. Our mock can't read prior turns, but we
    // emit a pseudo-id and patch the test logic below to discover the actual id
    // on the server side. To keep the agent's tool call deterministic, we
    // perform a server-side lookup just before iter 3 via the chat history hook.
    //
    // Workaround: we run the chat in two phases. Phase 1 pushes iter 1 & 2
    // and lets the agent finish with a content reply. Then we look up the
    // newly-created invoice via REST, then run a second /chat call that
    // posts it.
    //
    // Phase 1 final turn — model returns a text confirmation.
    responseQueue.push({
      content: "Invoice draft created. Let me know when to post it.",
    });

    const phase1 = await request(app as never)
      .post(`/api/chat`)
      .set(authHeader)
      .send({
        companyId: company.id,
        message: "Create an invoice for ACME SIA: €500 consulting services.",
        history: [],
      });
    expect(phase1.status).toBe(200);
    expect(phase1.body.data.response).toContain("created");

    // Confirm the invoice was actually created via the chat tool call.
    const invoicesRes = await request(app as never)
      .get(`/api/companies/${company.id}/invoices`)
      .set(authHeader);
    expect(invoicesRes.status).toBe(200);
    const invoices = invoicesRes.body.data as Array<{
      id: string;
      status: string;
      total: number;
      contactName: string;
    }>;
    expect(invoices).toHaveLength(1);
    expect(invoices[0].status).toBe("draft");
    expect(invoices[0].total).toBe(605); // 500 + 21% VAT
    expect(invoices[0].contactName).toBe("ACME SIA");
    const invoiceId = invoices[0].id;

    // ─── Phase 2 — script the agent to post the invoice ─────
    responseQueue.push({
      tool_calls: [
        {
          id: "tc-post-invoice",
          function: {
            name: "post_invoice",
            arguments: JSON.stringify({
              companyId: company.id,
              invoiceId,
            }),
          },
        },
      ],
    });
    responseQueue.push({
      content: "Invoice posted. GL is balanced.",
    });

    const phase2 = await request(app as never)
      .post(`/api/chat`)
      .set(authHeader)
      .send({
        companyId: company.id,
        message: "Now post it.",
        history: [
          {
            role: "user",
            content: "Create an invoice for ACME SIA: €500 consulting services.",
          },
          { role: "assistant", content: phase1.body.data.response },
        ],
      });
    expect(phase2.status).toBe(200);
    expect(phase2.body.data.response).toContain("posted");

    // ─── Assertions on invoice + GL ─────────────────────────
    const invoiceAfter = await request(app as never)
      .get(`/api/companies/${company.id}/invoices/${invoiceId}`)
      .set(authHeader);
    expect(invoiceAfter.status).toBe(200);
    expect(invoiceAfter.body.data.status).toBe("posted");

    const postingsRes = await request(app as never)
      .get(`/api/companies/${company.id}/invoices/${invoiceId}/postings`)
      .set(authHeader);
    expect(postingsRes.status).toBe(200);
    const journalEntries = postingsRes.body.data as Array<{
      lines: Array<{ accountCode: string; debit: number; credit: number }>;
    }>;
    const allLines = journalEntries.flatMap((je) => je.lines);

    const totalDebit = round2(allLines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(allLines.reduce((s, l) => s + l.credit, 0));
    expect(totalDebit).toBe(605);
    expect(totalCredit).toBe(605);

    const ar = allLines.find((l) => l.accountCode === "2210");
    expect(ar?.debit).toBe(605);

    const revenue = allLines.find((l) => l.accountCode === "5120");
    expect(revenue?.credit).toBe(500);

    const vat = allLines.find((l) => l.accountCode === "4230");
    expect(vat?.credit).toBe(105);
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
