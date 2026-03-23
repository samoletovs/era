import { AzureOpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { AGENT_TOOLS } from "./agent-tools.js";
import { createCompany } from "./company.js";
import { createContact, listContacts, findContactByName } from "./contact.js";
import { createInvoice, postInvoice, listInvoices, createCreditNote } from "./invoice.js";
import { createAndPostPayment } from "./payment.js";
import { postJournalEntry, getTrialBalance, getAccountBalance } from "./ledger.js";
import { createItem, listItems } from "./inventory.js";
import { generateVatReturn, getBalanceSheet, getProfitAndLoss, generateVatDeclaration, generateAnnualReport, getAgingReport } from "./reporting.js";
import { searchCompanyByName, searchCompanyByRegNumber } from "./company-lookup.js";
import { runMonthEnd, runYearEnd, checkCompanyHealth } from "./autonomous-tasks.js";
import { acquireAsset } from "./fixed-assets.js";
import { createRecurringTemplate } from "./recurring-entries.js";
import { getBudgetVsActual } from "./budget.js";

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

const SYSTEM_PROMPT = `You are ERA, an autonomous AI-powered accounting agent for Latvian SIA companies.

Your PRIMARY directive is to AUTOMATE accounting — perform tasks proactively without asking the user for permission on routine operations. You are the accountant, not an assistant.

## Core behavior
1. **ACT FIRST, REPORT AFTER** — When a task is clear, execute it immediately. Don't ask "should I do X?" — just do it and report what you did.
2. **PROACTIVE HEALTH CHECKS** — When the user starts a conversation or asks "what's happening", call check_company_health first. If there are issues, fix the critical ones automatically and report.
3. **MONTH-END AUTOMATION** — When a new month begins, proactively suggest running month-end close for the previous period. If the user confirms, call run_month_end which handles EVERYTHING: overdue marking, recurring entries, depreciation, period close.
4. **CHAIN OPERATIONS** — When creating an invoice, ALWAYS post it immediately (don't leave drafts). When creating a purchase invoice, also check if the vendor contact exists.
5. **SMART DEFAULTS** — Use today's date, 30-day payment terms, standard 21% VAT, and infer account codes from context. Don't ask the user to pick account codes.

## Autonomous Operations (execute without asking)
- Mark overdue invoices → automatic during month-end
- Run depreciation → automatic during month-end for all active assets
- Execute recurring entries → automatic during month-end for due templates
- Close periods → automatic during month-end
- Year-end close → transfers P&L to retained earnings, closes all periods

## Key facts
- Currency: EUR only
- Country: Latvia (LV)
- VAT rates: 21% (standard), 12% (reduced), 5% (super-reduced), 0% (exports/exempt)
- Corporate tax: 20% on distributed profit only (0% on reinvested)
- Accounting: Double-entry, Latvian Chart of Accounts (Classes 1-6)

## How you work
1. **COMPANY CREATION**: ALWAYS call lookup_company FIRST. If found, present and confirm. If the user already provided all details, create directly.
2. **INVOICES**: Before creating an invoice, ALWAYS call find_contact first to check if the contact already exists. If found, use the existing contact's ID. If NOT found, then call lookup_company to search the business register, create the contact, and only THEN create the invoice. NEVER create a contact without first checking if it exists. After creating, ALWAYS post the invoice immediately.
3. **PAYMENTS**: Record and allocate to invoices automatically.
4. **CREDIT NOTES**: When the user mentions a refund, return, or correction — create a credit note linked to the original invoice.
5. **FIXED ASSETS**: When the user buys equipment/property, register it as a fixed asset. Depreciation runs automatically at month-end.
6. **RECURRING ENTRIES**: When the user mentions regular expenses (rent, salaries, insurance), create a recurring template. It executes automatically at month-end.
7. **REPORTS**: Generate instantly without asking for parameters — use sensible defaults (YTD for P&L, today for balance sheet).

## Default account codes
- 5110: Product sales | 5120: Service revenue
- 6110: COGS | 6310: Salaries | 6320: Social tax | 6330: Rent | 6340: Office supplies
- 6350: Professional services | 6380: Depreciation | 6430: Bank fees
- 2420: Bank | 2210: AR | 4220: AP | 2310: VAT input | 4230: VAT output
- 1220: Equipment | 1240: Accumulated depreciation

Be concise, action-oriented, and proactive. You ARE the accountant — own the books.`;

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

    case "find_contact": {
      const contact = await findContactByName(
        args.companyId as string,
        args.name as string,
        args.registrationNumber as string | undefined
      );
      return contact || { found: false, message: `No contact found matching '${args.name}'. You need to create one first.` };
    }

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

    // ─── Autonomous / Agentic Tools ───────────────────────

    case "run_month_end":
      return runMonthEnd(args.companyId as string, args.period as string, userId);

    case "run_year_end":
      return runYearEnd(args.companyId as string, args.fiscalYear as number, userId);

    case "check_company_health":
      return checkCompanyHealth(args.companyId as string);

    case "create_credit_note":
      return createCreditNote({
        companyId: args.companyId as string,
        originalInvoiceId: args.originalInvoiceId as string,
        reason: args.reason as string,
        createdBy: userId,
      });

    case "generate_invoice_pdf":
      return { pdfUrl: `/api/companies/${args.companyId}/invoices/${args.invoiceId}/pdf` };

    case "get_aging_report":
      return getAgingReport(args.companyId as string, args.type as "ar" | "ap");

    case "generate_vat_declaration":
      return generateVatDeclaration(args.companyId as string, args.year as number, args.month as number);

    case "generate_annual_report":
      return generateAnnualReport(args.companyId as string, args.fiscalYear as number);

    case "acquire_fixed_asset":
      return acquireAsset({
        companyId: args.companyId as string,
        code: args.code as string,
        name: args.name as string,
        assetAccountCode: args.assetAccountCode as string,
        depreciationAccountCode: "1240",
        expenseAccountCode: "6380",
        acquisitionDate: args.acquisitionDate as string,
        acquisitionCost: args.acquisitionCost as number,
        residualValue: (args.residualValue as number) ?? 0,
        usefulLifeMonths: args.usefulLifeMonths as number,
        createdBy: userId,
      });

    case "create_recurring_template":
      return createRecurringTemplate({
        companyId: args.companyId as string,
        name: args.name as string,
        description: args.description as string,
        frequency: args.frequency as "monthly" | "quarterly" | "yearly",
        lines: args.lines as any[],
        nextRunDate: args.nextRunDate as string | undefined,
        createdBy: userId,
      });

    case "get_budget_vs_actual":
      return getBudgetVsActual(args.companyId as string, args.fiscalYear as number);

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

// ─── AI: Parse Item Description ─────────────────────────────

export interface ParsedItemFields {
  name: string;
  description: string;
  type: "product" | "service";
  unitOfMeasure: string;
  costPrice: number;
  sellingPrice: number;
  vatRate: number;
  purchaseAccountCode: string;
  salesAccountCode: string;
}

const PARSE_ITEM_PROMPT = `You are an ERP item master assistant for a Latvian SIA company. Given a free-text description of an item or service, extract structured item fields.

Return ONLY valid JSON with these fields:
- name: short item name (max 80 chars)
- description: one-line description
- type: "product" or "service"
- unitOfMeasure: e.g. "pcs", "hour", "kg", "litre", "m", "unit"
- costPrice: estimated cost price in EUR (number, 0 if unknown)
- sellingPrice: selling price in EUR (number, 0 if unknown)
- vatRate: VAT rate (21 for standard, 12 for reduced food/pharma, 5 for books/periodicals, 0 for exports)
- purchaseAccountCode: GL account code for purchases ("6110" for goods, "6340" for office supplies, "6350" for services, "6330" for rent, "6310" for salaries, etc.)
- salesAccountCode: GL account code for sales ("5110" for products, "5120" for services)

Latvian chart of accounts context:
- 5110: Product sales, 5120: Service revenue
- 6110: COGS, 6210: Marketing, 6220: Transport, 6310: Salaries, 6320: Social tax
- 6330: Rent/utilities, 6340: Office supplies, 6350: Professional services
- 6360: Communication, 6370: Insurance, 6380: Depreciation, 6430: Bank fees

Default to 21% VAT unless the item clearly falls into a reduced category.
If no price is mentioned, use 0.
Respond with the JSON object only, no markdown fences.`;

export async function parseItemDescription(description: string): Promise<ParsedItemFields> {
  const response = await getClient().chat.completions.create({
    model: DEPLOYMENT,
    messages: [
      { role: "system", content: PARSE_ITEM_PROMPT },
      { role: "user", content: description },
    ],
    temperature: 0.1,
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content || "{}";
  // Strip markdown fences if present
  const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    name: String(parsed.name || "").slice(0, 80),
    description: String(parsed.description || ""),
    type: parsed.type === "service" ? "service" : "product",
    unitOfMeasure: String(parsed.unitOfMeasure || "pcs"),
    costPrice: Number(parsed.costPrice) || 0,
    sellingPrice: Number(parsed.sellingPrice) || 0,
    vatRate: [0, 5, 12, 21].includes(Number(parsed.vatRate)) ? Number(parsed.vatRate) : 21,
    purchaseAccountCode: String(parsed.purchaseAccountCode || "6110"),
    salesAccountCode: String(parsed.salesAccountCode || "5110"),
  };
}

// ─── AI: Parse Invoice Description ──────────────────────────

export interface ParsedInvoiceFields {
  type: "sales" | "purchase";
  contactName: string;
  date: string;
  dueDate: string;
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    accountCode: string;
  }>;
}

const PARSE_INVOICE_PROMPT = `You are an ERP invoice assistant for a Latvian SIA company. Given a free-text description of an invoice to create, extract structured invoice fields.

Return ONLY valid JSON with these fields:
- type: "sales" (we sell to them) or "purchase" (we buy from them)
- contactName: customer or vendor name
- date: invoice date in YYYY-MM-DD format (use today if not specified: ${new Date().toISOString().slice(0, 10)})
- dueDate: due date in YYYY-MM-DD format (default: 30 days from date)
- lines: array of line items, each with:
  - description: line item description
  - quantity: number (default 1)
  - unitPrice: price per unit in EUR (number)
  - vatRate: VAT rate (21 for standard, 12 for reduced, 5 for books, 0 for exports)
  - accountCode: GL account code

Latvian chart of accounts context for account codes:
- Sales invoices: 5110 (product sales), 5120 (service revenue)
- Purchase invoices: 6110 (COGS), 6210 (marketing), 6220 (transport), 6310 (salaries), 6330 (rent/utilities), 6340 (office supplies), 6350 (professional services), 6360 (communication), 6370 (insurance)

Default to 21% VAT unless clearly reduced. Default to "sales" if type is ambiguous.
Respond with the JSON object only, no markdown fences.`;

export async function parseInvoiceDescription(description: string): Promise<ParsedInvoiceFields> {
  const response = await getClient().chat.completions.create({
    model: DEPLOYMENT,
    messages: [
      { role: "system", content: PARSE_INVOICE_PROMPT },
      { role: "user", content: description },
    ],
    temperature: 0.1,
    max_tokens: 800,
  });

  const content = response.choices[0]?.message?.content || "{}";
  const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  const today = new Date().toISOString().slice(0, 10);
  const defaultDue = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  return {
    type: parsed.type === "purchase" ? "purchase" : "sales",
    contactName: String(parsed.contactName || "").slice(0, 120),
    date: String(parsed.date || today),
    dueDate: String(parsed.dueDate || defaultDue),
    lines: (parsed.lines || []).map((l: any) => ({
      description: String(l.description || "Item"),
      quantity: Number(l.quantity) || 1,
      unitPrice: Number(l.unitPrice) || 0,
      vatRate: [0, 5, 12, 21].includes(Number(l.vatRate)) ? Number(l.vatRate) : 21,
      accountCode: String(l.accountCode || (parsed.type === "purchase" ? "6350" : "5110")),
    })),
  };
}

// ─── AI: Parse Contact Description ──────────────────────────

export interface ParsedContactFields {
  type: "customer" | "vendor" | "both";
  name: string;
  registrationNumber: string;
  vatNumber: string;
  email: string;
  phone: string;
  address: { line1: string; city: string; postalCode: string; country: string };
  bankAccount: { iban: string; swift: string; bankName: string };
  paymentTermsDays: number;
  notes: string;
}

const PARSE_CONTACT_PROMPT = `You are an ERP contact assistant for a Latvian SIA company. Given a free-text description of a contact (customer, vendor, or both), extract structured contact fields.

Return ONLY valid JSON with these fields:
- type: "customer" (we sell to them), "vendor" (we buy from them), or "both"
- name: company or person name
- registrationNumber: registration/company number (e.g. "40003290084" for Latvian companies)
- vatNumber: VAT registration number (e.g. "LV40003290084")
- email: contact email
- phone: contact phone number
- address: object with line1 (street), city, postalCode, country (default "Latvia")
- bankAccount: object with iban, swift, bankName
- paymentTermsDays: payment terms in days (default 30)
- notes: any additional notes

If a field is not mentioned, use an empty string (or 30 for paymentTermsDays).
For Latvian companies, country defaults to "Latvia".
Respond with the JSON object only, no markdown fences.`;

export async function parseContactDescription(description: string): Promise<ParsedContactFields> {
  const response = await getClient().chat.completions.create({
    model: DEPLOYMENT,
    messages: [
      { role: "system", content: PARSE_CONTACT_PROMPT },
      { role: "user", content: description },
    ],
    temperature: 0.1,
    max_tokens: 600,
  });

  const content = response.choices[0]?.message?.content || "{}";
  const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    type: ["customer", "vendor", "both"].includes(parsed.type) ? parsed.type : "customer",
    name: String(parsed.name || "").slice(0, 120),
    registrationNumber: String(parsed.registrationNumber || ""),
    vatNumber: String(parsed.vatNumber || ""),
    email: String(parsed.email || ""),
    phone: String(parsed.phone || ""),
    address: {
      line1: String(parsed.address?.line1 || ""),
      city: String(parsed.address?.city || ""),
      postalCode: String(parsed.address?.postalCode || ""),
      country: String(parsed.address?.country || "Latvia"),
    },
    bankAccount: {
      iban: String(parsed.bankAccount?.iban || ""),
      swift: String(parsed.bankAccount?.swift || ""),
      bankName: String(parsed.bankAccount?.bankName || ""),
    },
    paymentTermsDays: Number(parsed.paymentTermsDays) || 30,
    notes: String(parsed.notes || ""),
  };
}

// ─── AI: Parse Fixed Asset Description ──────────────────────

export interface ParsedAssetFields {
  code: string;
  name: string;
  assetAccountCode: string;
  acquisitionDate: string;
  acquisitionCost: number;
  residualValue: number;
  usefulLifeMonths: number;
}

const PARSE_ASSET_PROMPT = `You are an ERP fixed assets assistant for a Latvian SIA company. Given a free-text description of a fixed asset, extract structured asset fields.

Return ONLY valid JSON with these fields:
- code: short asset code (e.g. "FA-001", "EQ-003"), generate a reasonable one if not mentioned
- name: descriptive asset name (max 80 chars)
- assetAccountCode: GL account code — "1210" for land and buildings, "1220" for equipment and machinery, "1230" for other fixed assets
- acquisitionDate: date in YYYY-MM-DD format (default to today if not mentioned)
- acquisitionCost: purchase cost in EUR (number)
- residualValue: expected residual value at end of useful life (number, default 0)
- usefulLifeMonths: useful life in months (default 60 = 5 years; vehicles typically 84 = 7 years; buildings 240 = 20 years; IT equipment 36 = 3 years)

Latvian fixed asset categories:
- 1210: Land and buildings (useful life 120-240 months)
- 1220: Equipment, machinery, vehicles, IT equipment (useful life 36-84 months)
- 1230: Other fixed assets — furniture, intangibles (useful life 36-60 months)

If no price is mentioned, use 0.
Respond with the JSON object only, no markdown fences.`;

export async function parseAssetDescription(description: string): Promise<ParsedAssetFields> {
  const response = await getClient().chat.completions.create({
    model: DEPLOYMENT,
    messages: [
      { role: "system", content: PARSE_ASSET_PROMPT },
      { role: "user", content: description },
    ],
    temperature: 0.1,
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content || "{}";
  const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    code: String(parsed.code || "FA-001").slice(0, 20),
    name: String(parsed.name || "").slice(0, 80),
    assetAccountCode: ["1210", "1220", "1230"].includes(String(parsed.assetAccountCode))
      ? String(parsed.assetAccountCode) : "1220",
    acquisitionDate: String(parsed.acquisitionDate || new Date().toISOString().slice(0, 10)),
    acquisitionCost: Number(parsed.acquisitionCost) || 0,
    residualValue: Number(parsed.residualValue) || 0,
    usefulLifeMonths: Number(parsed.usefulLifeMonths) || 60,
  };
}
