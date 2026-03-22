import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { createCompany, getCompany, updateCompany, deleteCompany, getCompanyStats } from "../services/company.js";
import { postJournalEntry, reverseJournalEntry, getTrialBalance, GLError } from "../services/ledger.js";
import { createInvoice, postInvoice, getInvoice, listInvoices, findDuplicateInvoice, cancelInvoice, getInvoicePostings, createCreditNote } from "../services/invoice.js";
import { createAndPostPayment, listPayments } from "../services/payment.js";
import { createContact, getContact, listContacts } from "../services/contact.js";
import { createItem, listItems } from "../services/inventory.js";
import { generateVatReturn, getBalanceSheet, getProfitAndLoss, generateVatDeclaration, generateAnnualReport, getAgingReport, markOverdueInvoices } from "../services/reporting.js";
import { searchCompanyByName, searchCompanyByRegNumber } from "../services/company-lookup.js";
import { recognizeInvoice } from "../services/invoice-recognition.js";
import { handleChat, parseItemDescription, parseInvoiceDescription } from "../services/agent.js";
import { seedRules, getActiveRule } from "../services/posting-rules.js";
import { closePeriod, reopenPeriod, yearEndClose, getPeriodStatus } from "../services/period-close.js";
import { generateInvoicePdf } from "../services/invoice-pdf.js";
import { importBankStatement, postUnmatchedLine, completeReconciliation, listReconciliations, getReconciliation, getOpenInvoices, suggestLedgerAccount, matchLineToInvoice, addManualTransaction } from "../services/bank-reconciliation.js";
import { createRecurringTemplate, listRecurringTemplates, executeRecurringTemplate } from "../services/recurring-entries.js";
import { acquireAsset, runDepreciation, disposeAsset, listFixedAssets } from "../services/fixed-assets.js";
import { setBudget, getBudgetVsActual } from "../services/budget.js";
import { runMonthEnd, runYearEnd, checkCompanyHealth, listCloseRuns, getCloseRun } from "../services/autonomous-tasks.js";
import { containers } from "../services/cosmos.js";
import type { ApiResponse, Account, Company, Feedback, PostingRule, BusinessEvent } from "@shared/types";

export const router = Router();

// Public
router.get("/", (_req, res) => {
  res.json({
    name: "ERA API",
    version: "0.1.0",
    modules: ["finance", "inventory", "sales", "procurement", "reporting"],
  });
});

// ─── Public: Register Search (Latvian Enterprise Register) ──

router.get("/register/search", async (req, res) => {
  try {
    const q = (req.query.q as string) || "";
    if (!q || q.length < 2) {
      res.json({ data: { found: false, results: [], source: "" } } as ApiResponse);
      return;
    }
    const isRegNumber = /^\d{9,11}$/.test(q.replace(/\s/g, ""));
    const result = isRegNumber
      ? await searchCompanyByRegNumber(q.replace(/\s/g, ""))
      : await searchCompanyByName(q);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "SEARCH_FAILED", message: String(err) } });
  }
});

// ─── Protected routes ───────────────────────────────────────

router.use(authMiddleware);

// ─── Companies ──────────────────────────────────────────────

router.get("/companies", async (req, res) => {
  try {
    const { resources } = await containers.companies().items
      .query<Company>({
        query: "SELECT * FROM c ORDER BY c.name",
        parameters: [],
      })
      .fetchAll();
    res.json({ data: resources } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

// Company
router.post("/companies", async (req, res) => {
  try {
    const company = await createCompany({
      ...req.body,
      createdBy: req.user!.id,
    });
    const response: ApiResponse = { data: company };
    res.status(201).json(response);
  } catch (err) {
    res.status(500).json({ error: { code: "CREATE_FAILED", message: String(err) } });
  }
});

router.get("/companies/:id", async (req, res) => {
  const company = await getCompany(req.params.id);
  if (!company) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Company not found" } });
    return;
  }
  const response: ApiResponse = { data: company };
  res.json(response);
});

router.patch("/companies/:id", async (req, res) => {
  try {
    const company = await updateCompany(req.params.id, req.body);
    if (!company) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Company not found" } });
      return;
    }
    res.json({ data: company } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "UPDATE_FAILED", message: String(err) } });
  }
});

router.get("/companies/:id/stats", async (req, res) => {
  try {
    const stats = await getCompanyStats(req.params.id);
    res.json({ data: stats } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "SYS-001", message: String(err) } });
  }
});

router.delete("/companies/:id", async (req, res) => {
  try {
    const result = await deleteCompany(req.params.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "Company not found" ? 404 : 500;
    res.status(status).json({ error: { code: status === 404 ? "NOT_FOUND" : "DELETE_FAILED", message } });
  }
});

// Chart of Accounts
router.get("/companies/:companyId/accounts", async (req, res) => {
  try {
    const { resources: accounts } = await containers.ledger().items
      .query<Account>({
        query: "SELECT * FROM c WHERE c.companyId = @companyId AND (c.docType = 'account' OR (IS_DEFINED(c.code) AND IS_DEFINED(c.normalSide))) ORDER BY c.code",
        parameters: [{ name: "@companyId", value: req.params.companyId }],
      })
      .fetchAll();

    const asOf = req.query.asOf as string | undefined;
    if (asOf) {
      // Compute balances from journal entries up to asOf date
      const { resources: entries } = await containers.ledger().items
        .query<any>({
          query: "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) AND c.status = 'posted' AND c.date <= @asOf",
          parameters: [
            { name: "@cid", value: req.params.companyId },
            { name: "@asOf", value: asOf },
          ],
        })
        .fetchAll();

      const deltas = new Map<string, number>();
      for (const entry of entries) {
        for (const line of (entry.lines || [])) {
          if (!line.accountCode) continue;
          deltas.set(line.accountCode, (deltas.get(line.accountCode) || 0) + (line.debit || 0) - (line.credit || 0));
        }
      }

      for (const account of accounts) {
        if (account.isPostable) {
          const delta = deltas.get(account.code) || 0;
          account.balance = Math.round((account.normalSide === "credit" ? -delta : delta) * 100) / 100;
        }
      }
    }

    const response: ApiResponse = { data: accounts };
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

// Account transactions (journal entry lines for a specific account)
router.get("/companies/:companyId/accounts/:accountCode/transactions", async (req, res) => {
  try {
    const { companyId, accountCode } = req.params;
    const asOf = req.query.asOf as string | undefined;

    let query = "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) AND c.status = 'posted'";
    const parameters: { name: string; value: string }[] = [
      { name: "@cid", value: companyId },
    ];
    if (asOf) {
      query += " AND c.date <= @asOf";
      parameters.push({ name: "@asOf", value: asOf });
    }
    query += " ORDER BY c.date DESC";

    const { resources: entries } = await containers.ledger().items
      .query<any>({ query, parameters })
      .fetchAll();

    // Filter to entries that touch this account and extract relevant lines
    const transactions: { entryId: string; entryNumber: string; date: string; description: string; debit: number; credit: number; sourceType: string }[] = [];
    let runningBalance = 0;

    // Process in chronological order for running balance
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.entryNumber.localeCompare(b.entryNumber));

    // Look up account to determine normal side
    const accountId = `${companyId}-acct-${accountCode}`;
    let normalSide: "debit" | "credit" = "debit";
    try {
      const { resource } = await containers.ledger().item(accountId, companyId).read<Account>();
      if (resource) normalSide = resource.normalSide;
    } catch { /* use default */ }

    for (const entry of sorted) {
      for (const line of (entry.lines || [])) {
        if (line.accountCode !== accountCode) continue;
        const delta = normalSide === "credit"
          ? (line.credit || 0) - (line.debit || 0)
          : (line.debit || 0) - (line.credit || 0);
        runningBalance = Math.round((runningBalance + delta) * 100) / 100;
        transactions.push({
          entryId: entry.id,
          entryNumber: entry.entryNumber,
          date: entry.date,
          description: entry.description,
          debit: line.debit || 0,
          credit: line.credit || 0,
          sourceType: entry.sourceType || "manual",
        });
      }
    }

    // Return in reverse chronological order
    transactions.reverse();

    res.json({ data: { transactions, balance: runningBalance } } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

// Journal Entries
router.get("/companies/:companyId/journal-entries", async (req, res) => {
  try {
    const { resources } = await containers.ledger().items
      .query({
        query: "SELECT * FROM c WHERE c.companyId = @companyId AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) ORDER BY c.date DESC",
        parameters: [{ name: "@companyId", value: req.params.companyId }],
      })
      .fetchAll();
    const response: ApiResponse = { data: resources };
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

// Invoices
router.get("/companies/:companyId/invoices", async (req, res) => {
  try {
    const typeFilter = req.query.type ? "AND c.type = @type" : "";
    const params: { name: string; value: string }[] = [
      { name: "@companyId", value: req.params.companyId },
    ];
    if (req.query.type) {
      params.push({ name: "@type", value: req.query.type as string });
    }
    const { resources } = await containers.documents().items
      .query({
        query: `SELECT * FROM c WHERE c.companyId = @companyId AND (c.docType = 'invoice' OR IS_DEFINED(c.invoiceNumber)) ${typeFilter} ORDER BY c.date DESC`,
        parameters: params,
      })
      .fetchAll();
    const response: ApiResponse = { data: resources };
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

// Contacts
router.get("/companies/:companyId/contacts", async (req, res) => {
  try {
    const { resources } = await containers.contacts().items
      .query({
        query: "SELECT * FROM c WHERE c.companyId = @companyId ORDER BY c.name",
        parameters: [{ name: "@companyId", value: req.params.companyId }],
      })
      .fetchAll();
    const response: ApiResponse = { data: resources };
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

// Items
router.get("/companies/:companyId/items", async (req, res) => {
  try {
    const { resources } = await containers.inventory().items
      .query({
        query: "SELECT * FROM c WHERE c.companyId = @companyId AND (c.docType = 'item' OR IS_DEFINED(c.sellingPrice)) ORDER BY c.name",
        parameters: [{ name: "@companyId", value: req.params.companyId }],
      })
      .fetchAll();
    const response: ApiResponse = { data: resources };
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

// Chat (Agent interaction)
router.get("/companies/:companyId/chat", async (req, res) => {
  try {
    const { resources } = await containers.chat().items
      .query({
        query: "SELECT * FROM c WHERE c.companyId = @companyId ORDER BY c.timestamp DESC OFFSET 0 LIMIT 50",
        parameters: [{ name: "@companyId", value: req.params.companyId }],
      })
      .fetchAll();
    const response: ApiResponse = { data: resources.reverse() };
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

// ─── Finance: Journal Entries ───────────────────────────────

function handleGLError(err: unknown, res: import("express").Response) {
  if (err instanceof GLError) {
    res.status(400).json({ error: { code: err.code, message: err.message } });
  } else {
    res.status(500).json({ error: { code: "INTERNAL", message: String(err) } });
  }
}

router.post("/companies/:companyId/journal-entries", async (req, res) => {
  try {
    const entry = await postJournalEntry({
      companyId: req.params.companyId,
      ...req.body,
      createdBy: req.user!.id,
    });
    res.status(201).json({ data: entry } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post("/companies/:companyId/journal-entries/:entryId/reverse", async (req, res) => {
  try {
    const entry = await reverseJournalEntry(
      req.params.companyId,
      req.params.entryId,
      req.user!.id
    );
    res.json({ data: entry } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.get("/companies/:companyId/trial-balance", async (req, res) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const result = await getTrialBalance(req.params.companyId, from, to);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

// ─── Invoice Upload & Recognition ───────────────────────────

router.post("/companies/:companyId/invoices/upload", async (req, res) => {
  try {
    const { image, mimeType } = req.body; // base64 image, mime type
    if (!image || !mimeType) {
      res.status(400).json({ error: { code: "MISSING_DATA", message: "image and mimeType required" } });
      return;
    }

    // Step 1: Recognize invoice with GPT-4o vision
    const recognized = await recognizeInvoice(image, mimeType);

    // Step 2: Find or create vendor contact
    let contactId = "";
    const contactName = recognized.vendorName || "Unknown vendor";

    if (recognized.vendorName) {
      const { resources: existing } = await containers.contacts().items
        .query({
          query: "SELECT * FROM c WHERE c.companyId = @cid AND c.name = @name",
          parameters: [
            { name: "@cid", value: req.params.companyId },
            { name: "@name", value: recognized.vendorName },
          ],
        })
        .fetchAll();

      if (existing.length > 0) {
        contactId = existing[0].id;
      } else {
        const newContact = await createContact({
          companyId: req.params.companyId,
          type: "vendor",
          name: recognized.vendorName,
          registrationNumber: recognized.vendorRegistrationNumber,
          vatNumber: recognized.vendorVatNumber,
          address: {
            line1: recognized.vendorAddress || "",
            city: "",
            postalCode: "",
            country: "LV",
          },
          createdBy: req.user!.id,
        });
        contactId = newContact.id;
      }
    }

    // Step 2b: Check for duplicate invoice (same vendor + same invoice number)
    if (contactId && recognized.invoiceNumber) {
      const duplicate = await findDuplicateInvoice(req.params.companyId, contactId, recognized.invoiceNumber);
      if (duplicate) {
        // Auto-cancel the old duplicate and continue with new one
        try {
          await cancelInvoice(req.params.companyId, duplicate.id, "Replaced by re-upload", req.user!.id);
        } catch {
          // If cancel fails (e.g. has payments), warn but continue
        }
      }
    }

    // Step 3: Create purchase invoice — filter out zero-amount lines
    const invoiceLines = recognized.lines
      .filter((l) => l.quantity > 0 && l.unitPrice > 0)
      .map((l) => ({
        description: l.description || "Item",
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: [0, 5, 12, 21].includes(l.vatRate) ? l.vatRate : 21,
        accountCode: "6350", // Default: professional services
      }));

    // If no valid lines, fall back to using the total as a single line
    if (invoiceLines.length === 0 && recognized.total > 0) {
      const net = recognized.subtotal || recognized.total / 1.21;
      invoiceLines.push({
        description: `Invoice ${recognized.invoiceNumber || ""}`.trim(),
        quantity: 1,
        unitPrice: Math.round(net * 100) / 100,
        vatRate: 21,
        accountCode: "6350",
      });
    }

    if (invoiceLines.length === 0) {
      res.status(400).json({ error: { code: "NO_LINES", message: "Could not extract any line items with amounts from the invoice." } });
      return;
    }

    const invoice = await createInvoice({
      companyId: req.params.companyId,
      type: "purchase",
      contactId,
      contactName,
      date: recognized.invoiceDate,
      dueDate: recognized.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      vendorInvoiceNumber: recognized.invoiceNumber,
      recognitionConfidence: recognized.confidence,
      lines: invoiceLines,
      createdBy: req.user!.id,
    });

    // Step 4: Auto-post to ledger
    const postedInvoice = await postInvoice(req.params.companyId, invoice.id, req.user!.id);

    res.status(201).json({
      data: {
        recognized,
        invoice: postedInvoice,
        contactId,
        message: `Invoice ${postedInvoice.invoiceNumber} from ${contactName} for €${postedInvoice.total.toFixed(2)} created and posted to ledger.`,
      },
    } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "UPLOAD_FAILED", message: String(err) } });
  }
});

// ─── Finance: Invoices (CRUD + post) ────────────────────────

router.post("/companies/:companyId/invoices", async (req, res) => {
  try {
    const invoice = await createInvoice({
      companyId: req.params.companyId,
      ...req.body,
      createdBy: req.user!.id,
    });
    res.status(201).json({ data: invoice } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.get("/companies/:companyId/invoices/:invoiceId", async (req, res) => {
  const invoice = await getInvoice(req.params.companyId, req.params.invoiceId);
  if (!invoice) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Invoice not found" } });
    return;
  }
  res.json({ data: invoice } as ApiResponse);
});

router.post("/companies/:companyId/invoices/:invoiceId/post", async (req, res) => {
  try {
    const invoice = await postInvoice(
      req.params.companyId,
      req.params.invoiceId,
      req.user!.id
    );
    res.json({ data: invoice } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post("/companies/:companyId/invoices/:invoiceId/cancel", async (req, res) => {
  try {
    const invoice = await cancelInvoice(
      req.params.companyId,
      req.params.invoiceId,
      req.body.reason || "Cancelled by user",
      req.user!.id
    );
    res.json({ data: invoice } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.get("/companies/:companyId/invoices/:invoiceId/postings", async (req, res) => {
  try {
    const postings = await getInvoicePostings(req.params.companyId, req.params.invoiceId);
    res.json({ data: postings } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

// ─── Finance: Payments ──────────────────────────────────────

router.post("/companies/:companyId/payments", async (req, res) => {
  try {
    const payment = await createAndPostPayment({
      companyId: req.params.companyId,
      ...req.body,
      createdBy: req.user!.id,
    });
    res.status(201).json({ data: payment } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.get("/companies/:companyId/payments", async (req, res) => {
  try {
    const type = req.query.type as "incoming" | "outgoing" | undefined;
    const payments = await listPayments(req.params.companyId, type);
    res.json({ data: payments } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

// ─── Contacts (CRUD) ────────────────────────────────────────

router.post("/companies/:companyId/contacts", async (req, res) => {
  try {
    const contact = await createContact({
      companyId: req.params.companyId,
      ...req.body,
      createdBy: req.user!.id,
    });
    res.status(201).json({ data: contact } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "CREATE_FAILED", message: String(err) } });
  }
});

router.get("/companies/:companyId/contacts/:contactId", async (req, res) => {
  const contact = await getContact(req.params.companyId, req.params.contactId);
  if (!contact) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Contact not found" } });
    return;
  }
  res.json({ data: contact } as ApiResponse);
});

router.get("/companies/:companyId/contacts/:contactId/transactions", async (req, res) => {
  try {
    const cid = req.params.companyId;
    const contactId = req.params.contactId;

    // Get invoices for this contact
    const { resources: invoices } = await containers.documents().items
      .query({
        query: "SELECT * FROM c WHERE c.companyId = @cid AND c.contactId = @contactId AND (c.docType = 'invoice' OR IS_DEFINED(c.invoiceNumber)) ORDER BY c.date DESC",
        parameters: [
          { name: "@cid", value: cid },
          { name: "@contactId", value: contactId },
        ],
      })
      .fetchAll();

    // Get payments for this contact
    const { resources: payments } = await containers.documents().items
      .query({
        query: "SELECT * FROM c WHERE c.companyId = @cid AND c.contactId = @contactId AND (c.docType = 'payment' OR IS_DEFINED(c.bankAccountIban)) ORDER BY c.date DESC",
        parameters: [
          { name: "@cid", value: cid },
          { name: "@contactId", value: contactId },
        ],
      })
      .fetchAll();

    // Calculate totals
    const totalInvoiced = invoices
      .filter((i: any) => i.status !== "cancelled")
      .reduce((s: number, i: any) => s + (i.total || 0), 0);
    const totalPaid = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const balance = Math.round((totalInvoiced - totalPaid) * 100) / 100;

    res.json({
      data: { invoices, payments, totalInvoiced, totalPaid, balance },
    } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

// ─── Inventory ──────────────────────────────────────────────

router.post("/companies/:companyId/items", async (req, res) => {
  try {
    const item = await createItem({
      companyId: req.params.companyId,
      ...req.body,
      createdBy: req.user!.id,
    });
    res.status(201).json({ data: item } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "CREATE_FAILED", message: String(err) } });
  }
});

router.post("/companies/:companyId/items/parse-description", async (req, res) => {
  try {
    const description = req.body.description as string;
    if (!description?.trim()) {
      res.status(400).json({ error: { code: "VAL-001", message: "Description is required" } });
      return;
    }
    const fields = await parseItemDescription(description.trim());
    res.json({ data: fields } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "PARSE_FAILED", message: String(err) } });
  }
});

router.post("/companies/:companyId/invoices/parse-description", async (req, res) => {
  try {
    const description = req.body.description as string;
    if (!description?.trim()) {
      res.status(400).json({ error: { code: "VAL-001", message: "Description is required" } });
      return;
    }
    const fields = await parseInvoiceDescription(description.trim());
    res.json({ data: fields } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "PARSE_FAILED", message: String(err) } });
  }
});

// ─── Reporting ──────────────────────────────────────────────

router.get("/companies/:companyId/reports/balance-sheet", async (req, res) => {
  try {
    const report = await getBalanceSheet(req.params.companyId);
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "REPORT_FAILED", message: String(err) } });
  }
});

router.get("/companies/:companyId/reports/profit-loss", async (req, res) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const report = await getProfitAndLoss(req.params.companyId, from, to);
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "REPORT_FAILED", message: String(err) } });
  }
});

router.post("/companies/:companyId/vat-returns", async (req, res) => {
  try {
    const { year, month } = req.body;
    const vatReturn = await generateVatReturn(
      req.params.companyId,
      year,
      month,
      req.user!.id
    );
    res.status(201).json({ data: vatReturn } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "VAT_FAILED", message: String(err) } });
  }
});

// ─── Dashboard Summary ──────────────────────────────────────

router.get("/companies/:companyId/dashboard", async (req, res) => {
  try {
    const cid = req.params.companyId;

    // Get key account balances in parallel
    const [cashResult, arResult, apResult, vatOutResult, vatInResult] = await Promise.all([
      containers.ledger().item(`${cid}-acct-2420`, cid).read<Account>().catch(() => ({ resource: null })),
      containers.ledger().item(`${cid}-acct-2210`, cid).read<Account>().catch(() => ({ resource: null })),
      containers.ledger().item(`${cid}-acct-4220`, cid).read<Account>().catch(() => ({ resource: null })),
      containers.ledger().item(`${cid}-acct-4230`, cid).read<Account>().catch(() => ({ resource: null })),
      containers.ledger().item(`${cid}-acct-2310`, cid).read<Account>().catch(() => ({ resource: null })),
    ]);

    const cash = cashResult.resource?.balance ?? 0;
    const receivables = arResult.resource?.balance ?? 0;
    const payables = Math.abs(apResult.resource?.balance ?? 0);
    const vatPayable = Math.abs(vatOutResult.resource?.balance ?? 0);
    const vatReceivable = vatInResult.resource?.balance ?? 0;
    const vatDue = Math.round((vatPayable - vatReceivable) * 100) / 100;

    // Recent invoices
    const { resources: recentInvoices } = await containers.documents().items
      .query({
        query: "SELECT TOP 5 c.invoiceNumber, c.type, c.contactName, c.total, c.status, c.date FROM c WHERE c.companyId = @cid AND (c.docType = 'invoice' OR IS_DEFINED(c.invoiceNumber)) ORDER BY c.date DESC",
        parameters: [{ name: "@cid", value: cid }],
      })
      .fetchAll();

    res.json({
      data: {
        cash,
        receivables,
        payables,
        vatDue,
        recentInvoices,
      },
    } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "DASHBOARD_FAILED", message: String(err) } });
  }
});

// ─── Agent Chat ─────────────────────────────────────────────

router.post("/chat", async (req, res) => {
  try {
    const { companyId, message, history } = req.body;
    const userId = req.user!.id;
    const now = new Date().toISOString();

    // Save user message
    if (companyId) {
      await containers.chat().items.create({
        id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        companyId,
        role: "user" as const,
        content: message,
        timestamp: now,
      });
    }

    const response = await handleChat({
      companyId,
      message,
      history: history || [],
      userId,
    });

    // Save assistant response
    if (companyId) {
      await containers.chat().items.create({
        id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        companyId,
        role: "assistant" as const,
        content: response,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ data: { response } } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "AGENT_ERROR", message: String(err) } });
  }
});

// ─── Feedback / Dev Tasks ───────────────────────────────────

router.post("/feedback", async (req, res) => {
  try {
    const { page, message, companyId } = req.body;
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({ error: { code: "INVALID_INPUT", message: "Message is required" } });
      return;
    }
    const now = new Date().toISOString();
    const item: Feedback = {
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      page: String(page || "unknown"),
      message: message.trim().slice(0, 2000),
      status: "open",
      submittedBy: req.user!.id,
      submittedAt: now,
      companyId: companyId || undefined,
    };
    await containers.feedback().items.create(item);
    res.status(201).json({ data: item } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "CREATE_FAILED", message: String(err) } });
  }
});

router.get("/feedback", async (req, res) => {
  try {
    const statusFilter = req.query.status ? " WHERE c.status = @status" : "";
    const params = req.query.status ? [{ name: "@status", value: req.query.status as string }] : [];
    const { resources } = await containers.feedback().items
      .query<Feedback>({
        query: `SELECT * FROM c${statusFilter} ORDER BY c.submittedAt DESC`,
        parameters: params,
      })
      .fetchAll();
    res.json({ data: resources } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

router.patch("/feedback/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["open", "in-progress", "done", "dismissed"];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid status" } });
      return;
    }
    const { resource } = await containers.feedback().item(req.params.id, req.params.id).read<Feedback>();
    if (!resource) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Feedback not found" } });
      return;
    }
    const updated = {
      ...resource,
      status,
      resolvedAt: status === "done" || status === "dismissed" ? new Date().toISOString() : resource.resolvedAt,
    };
    await containers.feedback().item(req.params.id, req.params.id).replace(updated);
    res.json({ data: updated } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "UPDATE_FAILED", message: String(err) } });
  }
});

// ─── Posting Rules ──────────────────────────────────────────

router.get("/rules", async (req, res) => {
  try {
    const country = (req.query.country as string) || "LV";
    const { resources } = await containers.rules().items
      .query<PostingRule>({
        query: "SELECT * FROM c WHERE c.country = @country ORDER BY c.documentType, c.version DESC",
        parameters: [{ name: "@country", value: country }],
      })
      .fetchAll();
    res.json({ data: resources } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

router.post("/rules/seed", async (req, res) => {
  try {
    // Dynamic import to allow seeding from country files
    const { LV_POSTING_RULES } = await import("../../shared/rules/lv.js");
    const count = await seedRules(LV_POSTING_RULES);
    res.json({ data: { seeded: count, total: LV_POSTING_RULES.length } } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "SEED_FAILED", message: String(err) } });
  }
});

// ─── Events (read-only audit log) ───────────────────────────

router.get("/companies/:companyId/events", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const typeFilter = req.query.type ? " AND c.type = @type" : "";
    const params: { name: string; value: string | number }[] = [
      { name: "@cid", value: req.params.companyId },
    ];
    if (req.query.type) params.push({ name: "@type", value: req.query.type as string });

    const { resources } = await containers.events().items
      .query<BusinessEvent>({
        query: `SELECT * FROM c WHERE c.companyId = @cid${typeFilter} ORDER BY c.timestamp DESC OFFSET 0 LIMIT ${limit}`,
        parameters: params,
      })
      .fetchAll();
    res.json({ data: resources } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

// ─── Period Close & Year-End ────────────────────────────────

router.post("/companies/:companyId/periods/:period/close", async (req, res) => {
  try {
    const result = await closePeriod(req.params.companyId, req.params.period, req.user!.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post("/companies/:companyId/periods/:period/reopen", async (req, res) => {
  try {
    const result = await reopenPeriod(req.params.companyId, req.params.period, req.user!.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.get("/companies/:companyId/periods/:period", async (req, res) => {
  const result = await getPeriodStatus(req.params.companyId, req.params.period);
  res.json({ data: result || { period: req.params.period, status: "open" } } as ApiResponse);
});

router.post("/companies/:companyId/year-end-close", async (req, res) => {
  try {
    const { fiscalYear } = req.body;
    if (!fiscalYear) {
      res.status(400).json({ error: { code: "MISSING_YEAR", message: "fiscalYear is required" } });
      return;
    }
    const result = await yearEndClose(req.params.companyId, fiscalYear, req.user!.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

// ─── Credit Notes ───────────────────────────────────────────

router.post("/companies/:companyId/invoices/:invoiceId/credit-note", async (req, res) => {
  try {
    const creditNote = await createCreditNote({
      companyId: req.params.companyId,
      originalInvoiceId: req.params.invoiceId,
      reason: req.body.reason || "Credit note",
      lines: req.body.lines,
      createdBy: req.user!.id,
    });
    res.status(201).json({ data: creditNote } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

// ─── Invoice PDF ────────────────────────────────────────────

router.get("/companies/:companyId/invoices/:invoiceId/pdf", async (req, res) => {
  try {
    const pdf = await generateInvoicePdf(req.params.companyId, req.params.invoiceId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="invoice-${req.params.invoiceId}.pdf"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: { code: "PDF_FAILED", message: String(err) } });
  }
});

// ─── VAT Declaration Export ─────────────────────────────────

router.get("/companies/:companyId/reports/vat-declaration", async (req, res) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const declaration = await generateVatDeclaration(req.params.companyId, year, month);
    res.json({ data: declaration } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "VAT_FAILED", message: String(err) } });
  }
});

// ─── Annual Financial Statements ────────────────────────────

router.get("/companies/:companyId/reports/annual", async (req, res) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear() - 1;
    const report = await generateAnnualReport(req.params.companyId, year);
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "REPORT_FAILED", message: String(err) } });
  }
});

// ─── AR/AP Aging ────────────────────────────────────────────

router.get("/companies/:companyId/reports/ar-aging", async (req, res) => {
  try {
    const report = await getAgingReport(req.params.companyId, "ar");
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "REPORT_FAILED", message: String(err) } });
  }
});

router.get("/companies/:companyId/reports/ap-aging", async (req, res) => {
  try {
    const report = await getAgingReport(req.params.companyId, "ap");
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "REPORT_FAILED", message: String(err) } });
  }
});

// ─── Mark Overdue Invoices ──────────────────────────────────

router.post("/companies/:companyId/invoices/mark-overdue", async (req, res) => {
  try {
    const count = await markOverdueInvoices(req.params.companyId);
    res.json({ data: { updated: count } } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "UPDATE_FAILED", message: String(err) } });
  }
});

// ─── Bank Reconciliation ────────────────────────────────────

router.post("/companies/:companyId/bank-reconciliations", async (req, res) => {
  try {
    const result = await importBankStatement({ ...req.body, companyId: req.params.companyId, createdBy: req.user!.id });
    res.status(201).json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.get("/companies/:companyId/bank-reconciliations", async (req, res) => {
  try {
    const list = await listReconciliations(req.params.companyId);
    res.json({ data: list } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

router.get("/companies/:companyId/bank-reconciliations/open-invoices", async (req, res) => {
  try {
    const invoices = await getOpenInvoices(req.params.companyId);
    res.json({ data: invoices } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

router.get("/companies/:companyId/bank-reconciliations/:reconId", async (req, res) => {
  try {
    const recon = await getReconciliation(req.params.companyId, req.params.reconId);
    res.json({ data: recon } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post("/companies/:companyId/bank-reconciliations/:reconId/post-line", async (req, res) => {
  try {
    await postUnmatchedLine(
      req.params.companyId, req.params.reconId, req.body.lineId,
      req.body.accountCode, req.body.accountName, req.user!.id
    );
    res.json({ data: { success: true } } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post("/companies/:companyId/bank-reconciliations/:reconId/match-invoice", async (req, res) => {
  try {
    const result = await matchLineToInvoice({
      companyId: req.params.companyId,
      reconciliationId: req.params.reconId,
      lineId: req.body.lineId,
      invoiceId: req.body.invoiceId,
      invoiceNumber: req.body.invoiceNumber,
      allocatedAmount: req.body.allocatedAmount,
      differenceAccountCode: req.body.differenceAccountCode,
      differenceAccountName: req.body.differenceAccountName,
      createdBy: req.user!.id,
    });
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post("/companies/:companyId/bank-reconciliations/:reconId/manual-transaction", async (req, res) => {
  try {
    const result = await addManualTransaction({
      companyId: req.params.companyId,
      reconciliationId: req.params.reconId,
      date: req.body.date,
      description: req.body.description,
      amount: req.body.amount,
      accountCode: req.body.accountCode,
      accountName: req.body.accountName,
      createdBy: req.user!.id,
    });
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post("/companies/:companyId/bank-reconciliations/:reconId/suggest-account", async (req, res) => {
  try {
    const suggestion = suggestLedgerAccount(req.body.description || "");
    res.json({ data: suggestion } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "SUGGEST_FAILED", message: String(err) } });
  }
});

router.post("/companies/:companyId/bank-reconciliations/:reconId/complete", async (req, res) => {
  try {
    const result = await completeReconciliation(req.params.companyId, req.params.reconId, req.user!.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

// ─── Recurring Entries ──────────────────────────────────────

router.get("/companies/:companyId/recurring-templates", async (req, res) => {
  try {
    const list = await listRecurringTemplates(req.params.companyId);
    res.json({ data: list } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

router.post("/companies/:companyId/recurring-templates", async (req, res) => {
  try {
    const template = await createRecurringTemplate({ ...req.body, companyId: req.params.companyId, createdBy: req.user!.id });
    res.status(201).json({ data: template } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "CREATE_FAILED", message: String(err) } });
  }
});

router.post("/companies/:companyId/recurring-templates/:templateId/execute", async (req, res) => {
  try {
    const date = req.body.date || new Date().toISOString().slice(0, 10);
    const entry = await executeRecurringTemplate(req.params.companyId, req.params.templateId, date, req.user!.id);
    res.json({ data: entry } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

// ─── Fixed Assets ───────────────────────────────────────────

router.get("/companies/:companyId/fixed-assets", async (req, res) => {
  try {
    const assets = await listFixedAssets(req.params.companyId);
    res.json({ data: assets } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

router.post("/companies/:companyId/fixed-assets", async (req, res) => {
  try {
    const asset = await acquireAsset({ ...req.body, companyId: req.params.companyId, createdBy: req.user!.id });
    res.status(201).json({ data: asset } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post("/companies/:companyId/fixed-assets/depreciate", async (req, res) => {
  try {
    const period = req.body.period || new Date().toISOString().slice(0, 7);
    const result = await runDepreciation(req.params.companyId, period, req.user!.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post("/companies/:companyId/fixed-assets/:assetId/dispose", async (req, res) => {
  try {
    const asset = await disposeAsset(
      req.params.companyId, req.params.assetId,
      req.body.disposalDate || new Date().toISOString().slice(0, 10),
      req.body.disposalAmount || 0, req.user!.id
    );
    res.json({ data: asset } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.get("/companies/:companyId/fixed-assets/:assetId/transactions", async (req, res) => {
  try {
    const { companyId, assetId } = req.params;
    // First get the asset to know its account codes
    const { resource: asset } = await containers.inventory().item(assetId, companyId).read<any>();
    const accountCodes = asset
      ? [asset.assetAccountCode, asset.depreciationAccountCode, asset.expenseAccountCode].filter(Boolean)
      : [];

    // Find entries linked by sourceId OR containing lines with this asset's account codes
    const { resources: entries } = await containers.ledger().items
      .query<any>({
        query: `SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) AND (c.sourceId = @sid OR ARRAY_CONTAINS(@codes, c.lines[0].accountCode) OR ARRAY_CONTAINS(@codes, c.lines[1].accountCode)) ORDER BY c.date DESC`,
        parameters: [
          { name: "@cid", value: companyId },
          { name: "@sid", value: assetId },
          { name: "@codes", value: accountCodes },
        ],
      })
      .fetchAll();

    // Filter to only entries that actually reference this asset's accounts in their lines
    const filtered = entries.filter((e: any) => {
      if (e.sourceId === assetId) return true;
      if (!e.lines) return false;
      return e.lines.some((l: any) =>
        accountCodes.includes(l.accountCode) &&
        (l.accountName?.includes(asset?.name) || l.description?.includes(asset?.name))
      );
    });

    res.json({ data: filtered } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

// ─── Budgets ────────────────────────────────────────────────

router.post("/companies/:companyId/budgets", async (req, res) => {
  try {
    const count = await setBudget({ ...req.body, companyId: req.params.companyId, createdBy: req.user!.id });
    res.json({ data: { entriesCreated: count } } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "CREATE_FAILED", message: String(err) } });
  }
});

router.get("/companies/:companyId/reports/budget-vs-actual", async (req, res) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const report = await getBudgetVsActual(req.params.companyId, year);
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "REPORT_FAILED", message: String(err) } });
  }
});

// ─── Autonomous Task Endpoints ──────────────────────────────

router.post("/companies/:companyId/run-month-end", async (req, res) => {
  try {
    const period = req.body.period || (() => {
      const d = new Date(); d.setMonth(d.getMonth() - 1);
      return d.toISOString().slice(0, 7);
    })();
    const result = await runMonthEnd(req.params.companyId, period, req.user!.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "MONTH_END_FAILED", message: String(err) } });
  }
});

router.post("/companies/:companyId/run-year-end", async (req, res) => {
  try {
    const fiscalYear = req.body.fiscalYear || new Date().getFullYear() - 1;
    const result = await runYearEnd(req.params.companyId, fiscalYear, req.user!.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "YEAR_END_FAILED", message: String(err) } });
  }
});

router.get("/companies/:companyId/health", async (req, res) => {
  try {
    const health = await checkCompanyHealth(req.params.companyId);
    res.json({ data: health } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "HEALTH_CHECK_FAILED", message: String(err) } });
  }
});

router.get("/companies/:companyId/close-runs", async (req, res) => {
  try {
    const runs = await listCloseRuns(req.params.companyId);
    res.json({ data: runs } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "SYS-001", message: String(err) } });
  }
});

router.get("/companies/:companyId/close-runs/:runId", async (req, res) => {
  try {
    const run = await getCloseRun(req.params.companyId, req.params.runId);
    if (!run) return res.status(404).json({ error: { code: "SYS-002", message: "Close run not found" } });
    res.json({ data: run } as ApiResponse);
  } catch (err) {
    res.status(500).json({ error: { code: "SYS-001", message: String(err) } });
  }
});
