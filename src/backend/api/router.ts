import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { createCompany, getCompany, updateCompany } from "../services/company.js";
import { postJournalEntry, reverseJournalEntry, getTrialBalance, GLError } from "../services/ledger.js";
import { createInvoice, postInvoice, getInvoice, listInvoices, findDuplicateInvoice, cancelInvoice, getInvoicePostings, createCreditNote } from "../services/invoice.js";
import { createAndPostPayment, listPayments } from "../services/payment.js";
import { createContact, getContact, listContacts } from "../services/contact.js";
import { createItem, listItems } from "../services/inventory.js";
import { generateVatReturn, getBalanceSheet, getProfitAndLoss, generateVatDeclaration, generateAnnualReport } from "../services/reporting.js";
import { searchCompanyByName, searchCompanyByRegNumber } from "../services/company-lookup.js";
import { recognizeInvoice } from "../services/invoice-recognition.js";
import { handleChat } from "../services/agent.js";
import { seedRules, getActiveRule } from "../services/posting-rules.js";
import { closePeriod, reopenPeriod, yearEndClose, getPeriodStatus } from "../services/period-close.js";
import { generateInvoicePdf } from "../services/invoice-pdf.js";
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

// ─── Protected routes ───────────────────────────────────────

router.use(authMiddleware);

// ─── Register Search (Latvian Enterprise Register) ──────────

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

// Chart of Accounts
router.get("/companies/:companyId/accounts", async (req, res) => {
  try {
    const { resources } = await containers.ledger().items
      .query<Account>({
        query: "SELECT * FROM c WHERE c.companyId = @companyId AND IS_DEFINED(c.code) AND IS_DEFINED(c.normalSide) ORDER BY c.code",
        parameters: [{ name: "@companyId", value: req.params.companyId }],
      })
      .fetchAll();
    const response: ApiResponse = { data: resources };
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: { code: "QUERY_FAILED", message: String(err) } });
  }
});

// Journal Entries
router.get("/companies/:companyId/journal-entries", async (req, res) => {
  try {
    const { resources } = await containers.ledger().items
      .query({
        query: "SELECT * FROM c WHERE c.companyId = @companyId AND IS_DEFINED(c.entryNumber) ORDER BY c.date DESC",
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
        query: `SELECT * FROM c WHERE c.companyId = @companyId AND IS_DEFINED(c.invoiceNumber) ${typeFilter} ORDER BY c.date DESC`,
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
        query: "SELECT * FROM c WHERE c.companyId = @companyId AND IS_DEFINED(c.code) ORDER BY c.name",
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
    const result = await getTrialBalance(req.params.companyId);
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
    let contactName = recognized.vendorName || "Unknown vendor";

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
        query: "SELECT * FROM c WHERE c.companyId = @cid AND c.contactId = @contactId AND IS_DEFINED(c.invoiceNumber) ORDER BY c.date DESC",
        parameters: [
          { name: "@cid", value: cid },
          { name: "@contactId", value: contactId },
        ],
      })
      .fetchAll();

    // Get payments for this contact
    const { resources: payments } = await containers.documents().items
      .query({
        query: "SELECT * FROM c WHERE c.companyId = @cid AND c.contactId = @contactId AND IS_DEFINED(c.bankAccountIban) ORDER BY c.date DESC",
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
    const report = await getProfitAndLoss(req.params.companyId);
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
        query: "SELECT TOP 5 c.invoiceNumber, c.type, c.contactName, c.total, c.status, c.date FROM c WHERE c.companyId = @cid AND IS_DEFINED(c.invoiceNumber) ORDER BY c.date DESC",
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
    const response = await handleChat({
      companyId,
      message,
      history: history || [],
      userId: req.user!.id,
    });
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
