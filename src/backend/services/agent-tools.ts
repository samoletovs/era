// ERA Agent — Tool definitions for OpenAI function calling
// These map natural language requests to our finance service layer

import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "lookup_company",
      description: "Search the Latvian Enterprise Register (Uzņēmumu reģistrs) for a company by name or registration number. ALWAYS call this FIRST when the user wants to create a company or add a contact — look up the real data, then present it to the user for confirmation before creating.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Company name (e.g. 'Dais') or registration number (e.g. '40003999999')" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_company",
      description: "Create a new company (SIA) with Latvian Chart of Accounts pre-populated. Only call this AFTER looking up the company in the register and getting user confirmation.",
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
      description: "Create a customer or vendor contact. IMPORTANT: ALWAYS call find_contact first to check if the contact already exists before creating a new one. Only create a new contact if find_contact returns no match.",
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
      name: "find_contact",
      description: "Search for an existing contact by name or registration number. ALWAYS call this before create_contact to avoid duplicates. Returns the contact if found, or null if not found.",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          name: { type: "string", description: "Contact name to search for (case-insensitive)" },
          registrationNumber: { type: "string", description: "Registration number to match (optional but more reliable)" },
        },
        required: ["companyId", "name"],
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
                itemId: { type: "string", description: "Item code (e.g. ITEM-000001) to link this line to an inventory/service item" },
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

  // ─── Autonomous / Agentic Tools ─────────────────────────

  {
    type: "function",
    function: {
      name: "run_month_end",
      description: "Run the FULL month-end close process autonomously: marks overdue invoices, executes recurring entries (rent, salaries, etc.), runs fixed asset depreciation, runs foreign currency revaluation, and closes the period. Call this at the start of each new month for the previous month, or when the user mentions month-end, period close, or closing the books.",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          period: { type: "string", description: "Period to close in YYYY-MM format (e.g. '2026-02')" },
        },
        required: ["companyId", "period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_year_end",
      description: "Run the FULL year-end close process: closes all 12 monthly periods, runs depreciation, executes the closing journal entry (zeros P&L to retained earnings). Use when the user mentions annual close, year-end, or fiscal year close.",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          fiscalYear: { type: "number", description: "Fiscal year to close (e.g. 2025)" },
        },
        required: ["companyId", "fiscalYear"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_company_health",
      description: "Run a health check on the company: identifies overdue invoices, unclosed periods, unposted drafts, missing VAT returns. Returns a health score 0-100 with actionable issues. Call this when the user asks 'what needs attention', 'any issues', 'company status', or proactively at the start of a conversation.",
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
      name: "create_credit_note",
      description: "Create a credit note for an existing invoice. Reverses the original GL posting. Use when a customer returns goods, invoice has errors, or a refund is needed.",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          originalInvoiceId: { type: "string", description: "ID of the invoice to credit" },
          reason: { type: "string", description: "Reason for the credit note" },
        },
        required: ["companyId", "originalInvoiceId", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_invoice_pdf",
      description: "Generate a PDF for an invoice. Returns a download URL. Use when the user wants to send, print, or download an invoice.",
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
      name: "get_aging_report",
      description: "Get AR (accounts receivable) or AP (accounts payable) aging report showing amounts by customer/vendor in buckets: current, 30 days, 60 days, 90+ days. Use when the user asks about who owes money, outstanding debts, overdue amounts, or cash collection.",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          type: { type: "string", enum: ["ar", "ap"], description: "ar = who owes us, ap = who we owe" },
        },
        required: ["companyId", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_vat_declaration",
      description: "Generate the official VAT declaration (PVN deklarācija) for a period, broken down by VAT rate (21%, 12%, 5%). Use for VID filing.",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          year: { type: "number" },
          month: { type: "number" },
        },
        required: ["companyId", "year", "month"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_annual_report",
      description: "Generate the annual financial statements in Latvian format: balance sheet + P&L with Latvian regulatory groupings (long-term assets, current assets, equity, etc.). Required for filing with the Enterprise Register.",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          fiscalYear: { type: "number" },
        },
        required: ["companyId", "fiscalYear"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "acquire_fixed_asset",
      description: "Register a new fixed asset (equipment, vehicle, building, etc.) and post the acquisition journal entry. The asset will be automatically depreciated each month when running month-end.",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          code: { type: "string", description: "Asset code/tag number" },
          name: { type: "string" },
          assetAccountCode: { type: "string", description: "GL account: 1210=Land/buildings, 1220=Equipment, 1230=Other" },
          acquisitionDate: { type: "string", description: "YYYY-MM-DD" },
          acquisitionCost: { type: "number" },
          residualValue: { type: "number", description: "Expected value at end of life (often 0)" },
          usefulLifeMonths: { type: "number", description: "Depreciation period in months (e.g. 60 for 5 years)" },
        },
        required: ["companyId", "code", "name", "assetAccountCode", "acquisitionDate", "acquisitionCost", "usefulLifeMonths"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "post_journal_entry",
      description: "Post a one-off journal entry (GL posting). Use for adjustments, accruals, write-offs, or any manual entry. Each line can target different account types: ledger (default), customer, vendor, bank, fixed-asset, or item — the GL account is auto-resolved for non-ledger types.",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD posting date" },
          description: { type: "string", description: "Entry description" },
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                accountType: { type: "string", enum: ["ledger", "customer", "vendor", "bank", "fixed-asset", "item"], description: "Type of account (default: ledger)" },
                accountCode: { type: "string", description: "GL account code (4 digits)" },
                accountName: { type: "string" },
                debit: { type: "number" },
                credit: { type: "number" },
                description: { type: "string" },
                contactId: { type: "string", description: "For customer/vendor lines" },
                contactName: { type: "string" },
                fixedAssetId: { type: "string", description: "For fixed-asset lines" },
                itemId: { type: "string", description: "For item lines" },
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
      name: "create_recurring_template",
      description: "Create a recurring journal entry that executes automatically during month-end close (e.g. monthly rent, insurance, loan payment). Use post_journal_entry for one-off entries instead. Lines can target ledger, customer, vendor, bank, fixed-asset, or item account types.",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          name: { type: "string", description: "Template name (e.g. 'Monthly office rent')" },
          description: { type: "string" },
          frequency: { type: "string", enum: ["monthly", "quarterly", "yearly"] },
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                accountType: { type: "string", enum: ["ledger", "customer", "vendor", "bank", "fixed-asset", "item"], description: "Type of account (default: ledger)" },
                accountCode: { type: "string" },
                accountName: { type: "string" },
                debit: { type: "number" },
                credit: { type: "number" },
                description: { type: "string" },
                contactId: { type: "string", description: "For customer/vendor lines" },
                contactName: { type: "string" },
                fixedAssetId: { type: "string", description: "For fixed-asset lines" },
                itemId: { type: "string", description: "For item lines" },
              },
              required: ["accountCode", "accountName", "debit", "credit"],
            },
          },
          nextRunDate: { type: "string", description: "YYYY-MM-DD — when to first execute" },
        },
        required: ["companyId", "name", "description", "frequency", "lines"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_budget_vs_actual",
      description: "Compare budgeted amounts vs actual spending for a fiscal year. Shows variance per account.",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          fiscalYear: { type: "number" },
        },
        required: ["companyId", "fiscalYear"],
      },
    },
  },
];
