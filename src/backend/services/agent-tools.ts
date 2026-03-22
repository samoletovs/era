// ERA Agent — Tool definitions for OpenAI function calling
// These map natural language requests to our finance service layer

import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_company",
      description: "Create a new company (SIA) with Latvian Chart of Accounts pre-populated",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Company name, e.g. 'SIA ERA Tech'" },
          registrationNumber: { type: "string", description: "Latvian registration number (11 digits)" },
          vatNumber: { type: "string", description: "VAT number (LV + 11 digits), if VAT registered" },
          address: {
            type: "object",
            properties: {
              line1: { type: "string" },
              city: { type: "string" },
              postalCode: { type: "string" },
              country: { type: "string", default: "LV" },
            },
            required: ["line1", "city", "postalCode"],
          },
        },
        required: ["name", "registrationNumber", "address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_contact",
      description: "Create a customer or vendor contact",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          type: { type: "string", enum: ["customer", "vendor", "both"] },
          name: { type: "string", description: "Contact name, e.g. 'SIA Acme'" },
          registrationNumber: { type: "string" },
          vatNumber: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          address: {
            type: "object",
            properties: {
              line1: { type: "string" },
              city: { type: "string" },
              postalCode: { type: "string" },
              country: { type: "string", default: "LV" },
            },
            required: ["line1", "city", "postalCode"],
          },
        },
        required: ["companyId", "type", "name", "address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_invoice",
      description: "Create a draft sales or purchase invoice. Lines auto-calculate VAT. Call post_invoice afterwards to post it to the ledger.",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          type: { type: "string", enum: ["sales", "purchase"] },
          contactId: { type: "string", description: "ID of the customer or vendor" },
          contactName: { type: "string" },
          date: { type: "string", description: "Invoice date (YYYY-MM-DD)" },
          dueDate: { type: "string", description: "Payment due date (YYYY-MM-DD)" },
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                quantity: { type: "number" },
                unitPrice: { type: "number", description: "Net price per unit in EUR" },
                vatRate: { type: "number", enum: [0, 5, 12, 21], description: "Latvian VAT rate %" },
                accountCode: { type: "string", description: "GL account code (e.g. 5120 for service revenue, 6350 for professional services)" },
              },
              required: ["description", "quantity", "unitPrice", "vatRate", "accountCode"],
            },
          },
        },
        required: ["companyId", "type", "contactId", "contactName", "date", "dueDate", "lines"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "post_invoice",
      description: "Post a draft invoice to the General Ledger (creates journal entries for AR/AP, revenue/expense, and VAT)",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          invoiceId: { type: "string" },
        },
        required: ["companyId", "invoiceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_payment",
      description: "Record an incoming (customer) or outgoing (vendor) payment and allocate to invoices",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          type: { type: "string", enum: ["incoming", "outgoing"] },
          contactId: { type: "string" },
          contactName: { type: "string" },
          date: { type: "string" },
          amount: { type: "number" },
          bankAccountIban: { type: "string" },
          reference: { type: "string" },
          invoiceAllocations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                invoiceId: { type: "string" },
                invoiceNumber: { type: "string" },
                amount: { type: "number" },
              },
              required: ["invoiceId", "invoiceNumber", "amount"],
            },
          },
        },
        required: ["companyId", "type", "contactId", "contactName", "date", "amount", "reference", "invoiceAllocations"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_trial_balance",
      description: "Get the current trial balance showing all account balances (debits and credits)",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
        },
        required: ["companyId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_invoices",
      description: "List invoices for a company, optionally filtered by type (sales/purchase)",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          type: { type: "string", enum: ["sales", "purchase"] },
        },
        required: ["companyId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_contacts",
      description: "List all contacts (customers and vendors) for a company",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          type: { type: "string", enum: ["customer", "vendor", "both"] },
        },
        required: ["companyId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "post_journal_entry",
      description: "Post a manual journal entry to the General Ledger with debit and credit lines",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          date: { type: "string" },
          description: { type: "string" },
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                accountCode: { type: "string" },
                accountName: { type: "string" },
                debit: { type: "number" },
                credit: { type: "number" },
                description: { type: "string" },
              },
              required: ["accountCode", "accountName", "debit", "credit"],
            },
          },
        },
        required: ["companyId", "date", "description", "lines"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_account_balance",
      description: "Get the current balance of a specific GL account by code",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          accountCode: { type: "string", description: "Account code, e.g. '2420' for bank, '2210' for AR" },
        },
        required: ["companyId", "accountCode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_item",
      description: "Create a product or service item in the inventory catalog",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          code: { type: "string", description: "Item code/SKU" },
          name: { type: "string" },
          description: { type: "string" },
          type: { type: "string", enum: ["product", "service"] },
          unitOfMeasure: { type: "string", description: "e.g. 'hour', 'piece', 'kg'" },
          costPrice: { type: "number" },
          sellingPrice: { type: "number" },
          vatRate: { type: "number", enum: [0, 5, 12, 21] },
          purchaseAccountCode: { type: "string" },
          salesAccountCode: { type: "string" },
        },
        required: ["companyId", "code", "name", "type", "unitOfMeasure", "sellingPrice"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_items",
      description: "List all items (products and services) in the inventory catalog",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
        },
        required: ["companyId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_vat_return",
      description: "Generate a monthly VAT return (PVN deklarācija) for a given period",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          year: { type: "number", description: "Year, e.g. 2026" },
          month: { type: "number", description: "Month 1-12" },
        },
        required: ["companyId", "year", "month"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_balance_sheet",
      description: "Generate a Balance Sheet (Bilance) showing assets, liabilities, and equity",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
        },
        required: ["companyId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_profit_and_loss",
      description: "Generate a Profit & Loss statement (Peļņas vai zaudējumu aprēķins) showing revenue, expenses, and net profit",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
        },
        required: ["companyId"],
      },
    },
  },
];
