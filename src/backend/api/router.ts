import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { createCompany, getCompany, updateCompany } from "../services/company.js";
import { postJournalEntry, reverseJournalEntry, getTrialBalance, GLError } from "../services/ledger.js";
import { createInvoice, postInvoice, getInvoice, listInvoices } from "../services/invoice.js";
import { createAndPostPayment, listPayments } from "../services/payment.js";
import { createContact, getContact, listContacts } from "../services/contact.js";
import { createItem, listItems } from "../services/inventory.js";
import { generateVatReturn, getBalanceSheet, getProfitAndLoss } from "../services/reporting.js";
import { searchCompanyByName, searchCompanyByRegNumber } from "../services/company-lookup.js";
import { handleChat } from "../services/agent.js";
import { containers } from "../services/cosmos.js";
import type { ApiResponse, Account, Company } from "@shared/types";

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
