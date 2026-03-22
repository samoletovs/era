import { AzureOpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { AGENT_TOOLS } from "./agent-tools.js";
import { createCompany } from "./company.js";
import { createContact, listContacts } from "./contact.js";
import { createInvoice, postInvoice, listInvoices } from "./invoice.js";
import { createAndPostPayment } from "./payment.js";
import { postJournalEntry, getTrialBalance, getAccountBalance } from "./ledger.js";
import { createItem, listItems } from "./inventory.js";
import { generateVatReturn, getBalanceSheet, getProfitAndLoss } from "./reporting.js";
import { searchCompanyByName, searchCompanyByRegNumber } from "./company-lookup.js";

// ─── OpenAI Client ──────────────────────────────────────────

let client: AzureOpenAI;

function getClient(): AzureOpenAI {
  if (!client) {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    if (!endpoint || !apiKey) throw new Error("Azure OpenAI not configured");

    client = new AzureOpenAI({
      endpoint,
      apiKey,
      apiVersion: "2024-10-21",
    });
  }
  return client;
}

const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o";

// ─── System Prompt ──────────────────────────────────────────

const SYSTEM_PROMPT = `You are ERA, an AI-powered Enterprise Resource Agent for Latvian SIA companies.

Your role is to autonomously manage accounting, invoicing, payments, and financial reporting — asking the user only for the minimum information needed.

## Key facts
- Currency: EUR only
- Country: Latvia (LV)
- VAT rates: 21% (standard), 12% (reduced), 5% (super-reduced), 0% (exports/exempt)
- Corporate tax: 20% on distributed profit only (0% on reinvested)
- Accounting: Double-entry, Latvian Chart of Accounts (Classes 1-6)
- Reporting language: Latvian for official documents

## How you work
1. **COMPANY CREATION**: When the user wants to create a company, ALWAYS call lookup_company FIRST. If found, present results and ask to confirm. If NOT found but the user already provided details (name, reg number, address) in their message, proceed to create directly with those details — don't ask again for what they already told you.
2. **CONTACT CREATION**: When the user mentions a company name for a customer/vendor, call lookup_company first. If found, use official data. If not found but user provided details, create with those.
3. When the user asks to create an invoice, record a payment, or perform any financial operation — DO IT immediately. Don't ask for unnecessary details.
4. Use sensible defaults: today's date, 30-day payment terms, standard 21% VAT for services, account codes based on transaction type.
5. After completing an action, summarize what you did with the key numbers.
6. If the registry lookup returns no results AND the user didn't provide enough details, ask only for what's missing — not everything. If they said "in Riga" you have the city. If they gave a reg number you have it.

## Default account codes
- 5110: Product sales revenue
- 5120: Service revenue
- 6110: Cost of goods sold
- 6310: Salaries
- 6330: Rent and utilities
- 6340: Office supplies
- 6350: Professional services
- 6430: Bank fees
- 2420: Bank accounts
- 2210: Accounts receivable
- 4220: Trade payables
- 2310: VAT receivable (input)
- 4230: VAT payable (output)

Be concise, professional, and action-oriented. Latvian accounting compliance is your top priority.`;

// ─── Tool Executor ──────────────────────────────────────────

async function executeTool(name: string, args: Record<string, unknown>, userId: string): Promise<unknown> {
  switch (name) {
    case "lookup_company": {
      const query = args.query as string;
      // Detect if query looks like a registration number (all digits, 11 chars)
      const isRegNumber = /^\d{11}$/.test(query.replace(/\s/g, ""));
      if (isRegNumber) {
        return searchCompanyByRegNumber(query.replace(/\s/g, ""));
      }
      return searchCompanyByName(query);
    }

    case "create_company":
      return createCompany({
        name: args.name as string,
        registrationNumber: args.registrationNumber as string,
        vatNumber: args.vatNumber as string | undefined,
        legalAddress: args.address as { line1: string; city: string; postalCode: string; country: string },
        createdBy: userId,
      });

    case "create_contact":
      return createContact({
        companyId: args.companyId as string,
        type: args.type as "customer" | "vendor" | "both",
        name: args.name as string,
        registrationNumber: args.registrationNumber as string | undefined,
        vatNumber: args.vatNumber as string | undefined,
        email: args.email as string | undefined,
        phone: args.phone as string | undefined,
        address: args.address as { line1: string; city: string; postalCode: string; country: string },
        createdBy: userId,
      });

    case "create_invoice":
      return createInvoice({
        companyId: args.companyId as string,
        type: args.type as "sales" | "purchase",
        contactId: args.contactId as string,
        contactName: args.contactName as string,
        date: args.date as string,
        dueDate: args.dueDate as string,
        lines: args.lines as Array<{ description: string; quantity: number; unitPrice: number; vatRate: number; accountCode: string }>,
        createdBy: userId,
      });

    case "post_invoice":
      return postInvoice(args.companyId as string, args.invoiceId as string, userId);

    case "record_payment":
      return createAndPostPayment({
        companyId: args.companyId as string,
        type: args.type as "incoming" | "outgoing",
        contactId: args.contactId as string,
        contactName: args.contactName as string,
        date: args.date as string,
        amount: args.amount as number,
        bankAccountIban: (args.bankAccountIban as string) || "LV00HABA0000000000000",
        reference: args.reference as string,
        invoiceAllocations: args.invoiceAllocations as Array<{ invoiceId: string; invoiceNumber: string; amount: number }>,
        createdBy: userId,
      });

    case "get_trial_balance":
      return getTrialBalance(args.companyId as string);

    case "list_invoices":
      return listInvoices(args.companyId as string, args.type as "sales" | "purchase" | undefined);

    case "list_contacts":
      return listContacts(args.companyId as string, args.type as "customer" | "vendor" | "both" | undefined);

    case "post_journal_entry":
      return postJournalEntry({
        companyId: args.companyId as string,
        date: args.date as string,
        description: args.description as string,
        lines: args.lines as Array<{ accountCode: string; accountName: string; debit: number; credit: number; description?: string }>,
        sourceType: "manual",
        createdBy: userId,
      });

    case "get_account_balance": {
      const balance = await getAccountBalance(args.companyId as string, args.accountCode as string);
      return { accountCode: args.accountCode, balance };
    }

    case "create_item":
      return createItem({
        companyId: args.companyId as string,
        code: args.code as string,
        name: args.name as string,
        description: args.description as string | undefined,
        type: args.type as "product" | "service",
        unitOfMeasure: args.unitOfMeasure as string,
        costPrice: args.costPrice as number,
        sellingPrice: args.sellingPrice as number,
        vatRate: (args.vatRate as number) ?? 21,
        purchaseAccountCode: (args.purchaseAccountCode as string) || "6350",
        salesAccountCode: (args.salesAccountCode as string) || "5120",
        createdBy: userId,
      });

    case "list_items":
      return listItems(args.companyId as string);

    case "generate_vat_return":
      return generateVatReturn(
        args.companyId as string,
        args.year as number,
        args.month as number,
        userId
      );

    case "get_balance_sheet":
      return getBalanceSheet(args.companyId as string);

    case "get_profit_and_loss":
      return getProfitAndLoss(args.companyId as string);

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Chat Handler ───────────────────────────────────────────

export interface ChatInput {
  companyId?: string;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userId: string;
}

export async function handleChat(input: ChatInput): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  // Add context about current company if available
  if (input.companyId) {
    messages.push({
      role: "system",
      content: `Current active company ID: ${input.companyId}. Use this companyId for all operations unless the user specifies otherwise.`,
    });
  }

  // Add conversation history (last 20 messages max to stay within token limits)
  const recentHistory = input.history.slice(-20);
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add current user message
  messages.push({ role: "user", content: input.message });

  // Agent loop — keep calling tools until we get a final text response
  const maxIterations = 10;
  for (let i = 0; i < maxIterations; i++) {
    const response = await getClient().chat.completions.create({
      model: DEPLOYMENT,
      messages,
      tools: AGENT_TOOLS,
      temperature: 0.1,
      max_tokens: 2000,
    });

    const choice = response.choices[0];
    if (!choice) return "I couldn't generate a response. Please try again.";

    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    // If no tool calls, return the text response
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return assistantMessage.content || "Done.";
    }

    // Execute tool calls
    for (const toolCall of assistantMessage.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments);
      let result: unknown;

      try {
        result = await executeTool(toolCall.function.name, args, input.userId);
      } catch (err) {
        result = { error: String(err) };
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result, null, 2),
      });
    }
  }

  return "I performed multiple operations. Let me know if you need anything else.";
}
