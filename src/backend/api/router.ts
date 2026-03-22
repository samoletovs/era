import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { createCompany, getCompany } from "../services/company.js";
import { postJournalEntry, reverseJournalEntry, getTrialBalance, GLError } from "../services/ledger.js";
import { createInvoice, postInvoice, getInvoice, listInvoices } from "../services/invoice.js";
import { createAndPostPayment, listPayments } from "../services/payment.js";
import { createContact, getContact, listContacts } from "../services/contact.js";
import { containers } from "../services/cosmos.js";
import type { ApiResponse, Account } from "@shared/types";

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
