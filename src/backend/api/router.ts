import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { createCompany, getCompany } from "../services/company.js";
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
