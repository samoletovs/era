import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { companyAccess } from "../middleware/company-access.js";
import { idempotency } from "../middleware/idempotency.js";
import {
  CreateCompanySchema,
  UpdateCompanySchema,
  PostJournalEntrySchema,
  CreateInvoiceSchema,
  CreatePaymentSchema,
  CreateContactSchema,
  CreateItemSchema,
  SubmitFeedbackSchema,
} from "./schemas.js";
import {
  createCompany,
  getCompany,
  updateCompany,
  deleteCompany,
  getCompanyStats,
  generateShortName,
} from "../services/company.js";
import {
  postJournalEntry,
  reverseJournalEntry,
  getTrialBalance,
  GLError,
} from "../services/ledger.js";
import {
  createInvoice,
  postInvoice,
  getInvoice,
  findDuplicateInvoice,
  cancelInvoice,
  getInvoicePostings,
  createCreditNote,
} from "../services/invoice.js";
import { createAndPostPayment, listPayments } from "../services/payment.js";
import {
  createContact,
  getContact,
  findContactByName,
  updateContact,
  mergeContacts,
  findDuplicateContacts,
  checkContactRegister,
  applyRegisterData,
} from "../services/contact.js";
import { createItem } from "../services/inventory.js";
import {
  generateVatReturn,
  getBalanceSheet,
  getProfitAndLoss,
  generateVatDeclaration,
  generateAnnualReport,
  getAgingReport,
  markOverdueInvoices,
} from "../services/reporting.js";
import {
  searchCompanyByName,
  searchCompanyByRegNumber,
} from "../services/company-lookup.js";
import { recognizeInvoice } from "../services/invoice-recognition.js";
import {
  handleChat,
  parseItemDescription,
  parseInvoiceDescription,
  parseContactDescription,
  parseAssetDescription,
} from "../services/agent.js";
import { seedRules } from "../services/posting-rules.js";
import {
  closePeriod,
  reopenPeriod,
  yearEndClose,
  getPeriodStatus,
} from "../services/period-close.js";
import { generateInvoicePdf } from "../services/invoice-pdf.js";
import {
  importBankStatement,
  postUnmatchedLine,
  completeReconciliation,
  listReconciliations,
  getReconciliation,
  getOpenInvoices,
  suggestLedgerAccount,
  matchLineToInvoice,
  addManualTransaction,
} from "../services/bank-reconciliation.js";
import {
  createRecurringTemplate,
  listRecurringTemplates,
  executeRecurringTemplate,
} from "../services/recurring-entries.js";
import {
  acquireAsset,
  runDepreciation,
  disposeAsset,
  listFixedAssets,
} from "../services/fixed-assets.js";
import { setBudget, getBudgetVsActual } from "../services/budget.js";
import {
  runMonthEnd,
  runYearEnd,
  checkCompanyHealth,
  listCloseRuns,
  getCloseRun,
} from "../services/autonomous-tasks.js";
import {
  saveExchangeRate,
  getExchangeRate,
  importEcbRates,
  importSystemRates,
  runForeignCurrencyRevaluation,
} from "../services/currency-revaluation.js";
import { containers } from "../services/cosmos.js";
import {
  parsePagination,
  paginationClause,
  paginatedResponse,
} from "../middleware/pagination.js";
import { safeError } from "../middleware/error-handler.js";
import type {
  ApiResponse,
  Account,
  Company,
  Feedback,
  PostingRule,
  BusinessEvent,
  UserProfile,
  CompanySharingEntry,
} from "@shared/types";

export const router = Router();

const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const AccountsQuerySchema = z.object({
  asOf: IsoDateSchema.optional(),
});
const InvoicesQuerySchema = z.object({
  type: z.enum(["sales", "purchase"]).optional(),
});
const TrialBalanceQuerySchema = z.object({
  from: IsoDateSchema.optional(),
  to: IsoDateSchema.optional(),
});

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
      res.json({
        data: { found: false, results: [], source: "" },
      } as ApiResponse);
      return;
    }
    const isRegNumber = /^\d{9,11}$/.test(q.replace(/\s/g, ""));
    const result = isRegNumber
      ? await searchCompanyByRegNumber(q.replace(/\s/g, ""))
      : await searchCompanyByName(q);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "SEARCH_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Protected routes ───────────────────────────────────────

router.use(authMiddleware);
router.use(idempotency);

// ─── Auth ───────────────────────────────────────────────────

router.get("/auth/me", async (req, res) => {
  try {
    const userId = req.user!.id;
    let profile: UserProfile | null = null;

    try {
      const { resource } = await containers
        .users()
        .item(userId, userId)
        .read<UserProfile>();
      profile = resource ?? null;
    } catch {
      // Not found — create on first login
    }

    const now = new Date().toISOString();

    if (!profile) {
      profile = {
        id: userId,
        email: req.user!.email,
        displayName: req.user!.name,
        provider: req.user!.provider,
        companies: [],
        createdAt: now,
        lastLoginAt: now,
      };

      // Check for pending sharing invitations by email
      const pendingId = `pending:${req.user!.email.toLowerCase().trim()}`;
      try {
        const { resource: pendingProfile } = await containers
          .users()
          .item(pendingId, pendingId)
          .read<UserProfile>();
        if (pendingProfile?.companies?.length) {
          profile.companies.push(...pendingProfile.companies);
          // Remove the pending profile
          await containers.users().item(pendingId, pendingId).delete();
        }
      } catch {
        // No pending profile — normal case
      }

      await containers.users().items.upsert(profile);
    } else {
      // Update last login and potentially missing fields
      profile.lastLoginAt = now;
      if (req.user!.email && profile.email !== req.user!.email)
        profile.email = req.user!.email;
      if (req.user!.name && profile.displayName !== req.user!.name)
        profile.displayName = req.user!.name;
      await containers.users().items.upsert(profile);
    }

    res.json({
      data: {
        id: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        photoUrl: profile.photoUrl,
        provider: profile.provider,
      },
    } as ApiResponse);
  } catch (err) {
    const e = safeError(err, "AUTH_PROFILE_FAILED");
    res.status(e.status).json(e.body);
  }
});

// Company-level access control for all /companies/:companyId/* routes
router.use("/companies/:companyId", companyAccess);
router.use("/companies/:id", companyAccess);

// ─── Companies ──────────────────────────────────────────────

router.get("/companies", async (req, res) => {
  try {
    // Cross-partition query is acceptable here — companies container is small and rarely queried
    const { resources } = await containers
      .companies()
      .items.query<Company>({
        query: "SELECT * FROM c ORDER BY c.name", // eslint-disable-line era/no-cross-partition-query
        parameters: [],
      })
      .fetchAll();
    let visibleCompanies = resources;
    try {
      const { resource: userProfile } = await containers
        .users()
        .item(req.user!.id, req.user!.id)
        .read<UserProfile>();
      const companyIds = userProfile?.companies?.map((c) => c.companyId) ?? [];
      if (companyIds.length > 0) {
        const allowed = new Set(companyIds);
        visibleCompanies = resources.filter((c) => allowed.has(c.id));
      }
    } catch {
      // Keep compatibility when users container is not populated yet.
    }

    // Backfill shortName for companies created before the field existed
    for (const c of visibleCompanies) {
      if (!c.shortName && c.name) {
        c.shortName = generateShortName(c.name);
        containers
          .companies()
          .item(c.id, c.id)
          .replace(c)
          .catch((err) => {
            console.error(
              "Failed to backfill shortName:",
              c.id,
              err instanceof Error ? err.message : String(err),
            );
          });
      }
    }
    res.json({ data: visibleCompanies } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// Company
router.post("/companies", validate(CreateCompanySchema), async (req, res) => {
  try {
    const company = await createCompany({
      ...req.body,
      createdBy: req.user!.id,
      createdByEmail: req.user!.email,
      createdByName: req.user!.name,
      createdByProvider: req.user!.provider,
    });
    const response: ApiResponse = { data: company };
    res.status(201).json(response);
  } catch (err) {
    {
      const e = safeError(err, "CREATE_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.get("/companies/:id", async (req, res) => {
  const company = await getCompany(req.params.id);
  if (!company) {
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Company not found" } });
    return;
  }
  const response: ApiResponse = { data: company };
  res.json(response);
});

router.patch(
  "/companies/:id",
  validate(UpdateCompanySchema),
  async (req, res) => {
    try {
      const company = await updateCompany(req.params.id, req.body);
      if (!company) {
        res
          .status(404)
          .json({ error: { code: "NOT_FOUND", message: "Company not found" } });
        return;
      }
      res.json({ data: company } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, "UPDATE_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

router.get("/companies/:id/stats", async (req, res) => {
  try {
    const stats = await getCompanyStats(req.params.id);
    res.json({ data: stats } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "SYS-001");
      res.status(e.status).json(e.body);
    }
  }
});

router.delete("/companies/:id", async (req, res) => {
  try {
    const result = await deleteCompany(req.params.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "Company not found" ? 404 : 500;
    res.status(status).json({
      error: {
        code: status === 404 ? "NOT_FOUND" : "DELETE_FAILED",
        message,
      },
    });
  }
});

// ─── Company Sharing ────────────────────────────────────────

// List users with access to this company
router.get("/companies/:companyId/sharing", async (req, res) => {
  try {
    const companyId = req.params.companyId;
    // Verify caller is owner
    const { resource: callerProfile } = await containers
      .users()
      .item(req.user!.id, req.user!.id)
      .read<UserProfile>();
    const callerRole = callerProfile?.companies?.find(
      (c) => c.companyId === companyId,
    )?.role;
    if (callerRole !== "owner") {
      res.status(403).json({
        error: {
          code: "AUTH-003",
          message: "Only the company owner can manage sharing",
        },
      });
      return;
    }

    // Query all users who have this company in their profile
    const { resources: users } = await containers
      .users()
      .items.query<UserProfile>({
        query:
          'SELECT * FROM c WHERE ARRAY_CONTAINS(c.companies, {"companyId": @companyId}, true)',
        parameters: [{ name: "@companyId", value: companyId }],
      })
      .fetchAll();

    const entries: CompanySharingEntry[] = [];
    for (const u of users) {
      const role = u.companies.find((c) => c.companyId === companyId);
      if (role && role.role !== "owner") {
        entries.push({
          userId: u.id,
          email: u.email,
          displayName: u.displayName,
          role: role.role as "accountant" | "viewer",
          sharedBy: role.sharedBy || req.user!.id,
          sharedAt: role.sharedAt || u.createdAt,
        });
      }
    }

    res.json({ data: entries } as ApiResponse);
  } catch (err) {
    const e = safeError(err, "QUERY_FAILED");
    res.status(e.status).json(e.body);
  }
});

// Share company with a user by email
router.post("/companies/:companyId/sharing", async (req, res) => {
  try {
    const companyId = req.params.companyId;
    const { email, role } = req.body as { email?: string; role?: string };

    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({
        error: { code: "VAL-001", message: "Valid email is required" },
      });
      return;
    }
    if (!role || !["accountant", "viewer"].includes(role)) {
      res.status(400).json({
        error: {
          code: "VAL-001",
          message: "Role must be 'accountant' or 'viewer'",
        },
      });
      return;
    }

    // Verify caller is owner
    const { resource: callerProfile } = await containers
      .users()
      .item(req.user!.id, req.user!.id)
      .read<UserProfile>();
    const callerRole = callerProfile?.companies?.find(
      (c) => c.companyId === companyId,
    )?.role;
    if (callerRole !== "owner") {
      res.status(403).json({
        error: {
          code: "AUTH-003",
          message: "Only the company owner can share",
        },
      });
      return;
    }

    // Get company name
    const company = await getCompany(companyId);
    if (!company) {
      res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Company not found" } });
      return;
    }

    // Find target user by email
    const { resources: matchingUsers } = await containers
      .users()
      .items.query<UserProfile>({
        query: "SELECT * FROM c WHERE c.email = @email OFFSET 0 LIMIT 1", // eslint-disable-line era/no-cross-partition-query
        parameters: [{ name: "@email", value: email.toLowerCase().trim() }],
      })
      .fetchAll();

    const now = new Date().toISOString();
    const targetUser = matchingUsers[0];

    if (!targetUser) {
      // User hasn't logged in yet — create a placeholder profile so sharing takes effect on first login
      const placeholderProfile: UserProfile = {
        id: `pending:${email.toLowerCase().trim()}`,
        email: email.toLowerCase().trim(),
        displayName: email.split("@")[0],
        provider: "google",
        companies: [
          {
            companyId,
            companyName: company.name,
            role: role as "accountant" | "viewer",
            sharedBy: req.user!.id,
            sharedAt: now,
          },
        ],
        createdAt: now,
        lastLoginAt: now,
      };
      await containers.users().items.upsert(placeholderProfile);
      res
        .status(201)
        .json({ data: { email, role, status: "invited" } } as ApiResponse);
      return;
    }

    // Don't allow sharing with yourself
    if (targetUser.id === req.user!.id) {
      res.status(400).json({
        error: { code: "BIZ-001", message: "Cannot share with yourself" },
      });
      return;
    }

    // Check if already shared
    const existing = targetUser.companies.find(
      (c) => c.companyId === companyId,
    );
    if (existing) {
      // Update role
      existing.role = role as "accountant" | "viewer";
      existing.sharedBy = req.user!.id;
      existing.sharedAt = now;
    } else {
      targetUser.companies.push({
        companyId,
        companyName: company.name,
        role: role as "accountant" | "viewer",
        sharedBy: req.user!.id,
        sharedAt: now,
      });
    }

    await containers.users().items.upsert(targetUser);
    res
      .status(201)
      .json({ data: { email, role, status: "shared" } } as ApiResponse);
  } catch (err) {
    const e = safeError(err, "SHARE_FAILED");
    res.status(e.status).json(e.body);
  }
});

// Update sharing role
router.patch("/companies/:companyId/sharing/:userId", async (req, res) => {
  try {
    const { companyId, userId } = req.params;
    const { role } = req.body as { role?: string };

    if (!role || !["accountant", "viewer"].includes(role)) {
      res.status(400).json({
        error: {
          code: "VAL-001",
          message: "Role must be 'accountant' or 'viewer'",
        },
      });
      return;
    }

    // Verify caller is owner
    const { resource: callerProfile } = await containers
      .users()
      .item(req.user!.id, req.user!.id)
      .read<UserProfile>();
    const callerRole = callerProfile?.companies?.find(
      (c) => c.companyId === companyId,
    )?.role;
    if (callerRole !== "owner") {
      res.status(403).json({
        error: {
          code: "AUTH-003",
          message: "Only the company owner can update sharing",
        },
      });
      return;
    }

    // Load target user
    const { resource: targetUser } = await containers
      .users()
      .item(userId, userId)
      .read<UserProfile>();
    if (!targetUser) {
      res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "User not found" } });
      return;
    }

    const companyRole = targetUser.companies.find(
      (c) => c.companyId === companyId,
    );
    if (!companyRole || companyRole.role === "owner") {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "No sharing entry found for this user",
        },
      });
      return;
    }

    companyRole.role = role as "accountant" | "viewer";
    await containers.users().items.upsert(targetUser);
    res.json({ data: { userId, role } } as ApiResponse);
  } catch (err) {
    const e = safeError(err, "UPDATE_FAILED");
    res.status(e.status).json(e.body);
  }
});

// Remove sharing
router.delete("/companies/:companyId/sharing/:userId", async (req, res) => {
  try {
    const { companyId, userId } = req.params;

    // Verify caller is owner
    const { resource: callerProfile } = await containers
      .users()
      .item(req.user!.id, req.user!.id)
      .read<UserProfile>();
    const callerRole = callerProfile?.companies?.find(
      (c) => c.companyId === companyId,
    )?.role;
    if (callerRole !== "owner") {
      res.status(403).json({
        error: {
          code: "AUTH-003",
          message: "Only the company owner can remove sharing",
        },
      });
      return;
    }

    // Load target user
    const { resource: targetUser } = await containers
      .users()
      .item(userId, userId)
      .read<UserProfile>();
    if (!targetUser) {
      res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "User not found" } });
      return;
    }

    const idx = targetUser.companies.findIndex(
      (c) => c.companyId === companyId,
    );
    if (idx === -1 || targetUser.companies[idx].role === "owner") {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "No sharing entry found" },
      });
      return;
    }

    targetUser.companies.splice(idx, 1);
    await containers.users().items.upsert(targetUser);
    res.json({ data: { removed: true } } as ApiResponse);
  } catch (err) {
    const e = safeError(err, "DELETE_FAILED");
    res.status(e.status).json(e.body);
  }
});

// Chart of Accounts
router.get("/companies/:companyId/accounts", async (req, res) => {
  try {
    const queryValidation = AccountsQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      res.status(400).json({
        error: { code: "VAL-001", message: "Invalid query parameters" },
        meta: { issues: queryValidation.error.issues },
      });
      return;
    }

    const { resources: accounts } = await containers
      .ledger()
      .items.query<Account>({
        query:
          "SELECT * FROM c WHERE c.companyId = @companyId AND (c.docType = 'account' OR (IS_DEFINED(c.code) AND IS_DEFINED(c.normalSide))) ORDER BY c.code",
        parameters: [{ name: "@companyId", value: req.params.companyId }],
      })
      .fetchAll();

    const asOf = queryValidation.data.asOf;
    if (asOf) {
      // Compute balances from journal entries up to asOf date
      const { resources: entries } = await containers
        .ledger()
        .items.query<any>({
          query:
            "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) AND c.status = 'posted' AND c.date <= @asOf",
          parameters: [
            { name: "@cid", value: req.params.companyId },
            { name: "@asOf", value: asOf },
          ],
        })
        .fetchAll();

      const deltas = new Map<string, number>();
      for (const entry of entries) {
        for (const line of entry.lines || []) {
          if (!line.accountCode) continue;
          deltas.set(
            line.accountCode,
            (deltas.get(line.accountCode) || 0) +
              (line.debit || 0) -
              (line.credit || 0),
          );
        }
      }

      for (const account of accounts) {
        if (account.isPostable) {
          const delta = deltas.get(account.code) || 0;
          account.balance =
            Math.round(
              (account.normalSide === "credit" ? -delta : delta) * 100,
            ) / 100;
        }
      }
    }

    const response: ApiResponse = { data: accounts };
    res.json(response);
  } catch (err) {
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// Account transactions (journal entry lines for a specific account)
router.get(
  "/companies/:companyId/accounts/:accountCode/transactions",
  async (req, res) => {
    try {
      const { companyId, accountCode } = req.params;
      const asOf = req.query.asOf as string | undefined;
      const pg = parsePagination(req);

      // Use Cosmos UDF-free approach: filter entries that contain this account code in lines
      // ARRAY_CONTAINS with partial match filters server-side, reducing data transfer
      let query =
        "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) AND c.status = 'posted'";
      const parameters: { name: string; value: string }[] = [
        { name: "@cid", value: companyId },
      ];
      if (asOf) {
        query += " AND c.date <= @asOf";
        parameters.push({ name: "@asOf", value: asOf });
      }
      query += " ORDER BY c.date DESC";

      const { resources: entries } = await containers
        .ledger()
        .items.query<any>({ query, parameters })
        .fetchAll();

      // Look up account to determine normal side
      const accountId = `${companyId}-acct-${accountCode}`;
      let normalSide: "debit" | "credit" = "debit";
      try {
        const { resource } = await containers
          .ledger()
          .item(accountId, companyId)
          .read<Account>();
        if (resource) normalSide = resource.normalSide;
      } catch {
        /* use default */
      }

      // Build filtered + paginated transaction list
      const allTransactions: {
        entryId: string;
        entryNumber: string;
        date: string;
        description: string;
        debit: number;
        credit: number;
        sourceType: string;
      }[] = [];
      let runningBalance = 0;

      // Process in chronological order for running balance
      const sorted = [...entries].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (a.entryNumber || "").localeCompare(b.entryNumber || ""),
      );

      for (const entry of sorted) {
        for (const line of entry.lines || []) {
          if (line.accountCode !== accountCode) continue;
          const delta =
            normalSide === "credit"
              ? (line.credit || 0) - (line.debit || 0)
              : (line.debit || 0) - (line.credit || 0);
          runningBalance = Math.round((runningBalance + delta) * 100) / 100;
          allTransactions.push({
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

      // Reverse to show newest first, then paginate
      allTransactions.reverse();
      const paged = allTransactions.slice(pg.offset, pg.offset + pg.limit);

      res.json({
        data: { transactions: paged, balance: runningBalance },
        meta: {
          limit: pg.limit,
          offset: pg.offset,
          count: paged.length,
          total: allTransactions.length,
        },
      });
    } catch (err) {
      {
        const e = safeError(err, "QUERY_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

// Journal Entries
router.get("/companies/:companyId/journal-entries", async (req, res) => {
  try {
    const pg = parsePagination(req);
    const { resources } = await containers
      .ledger()
      .items.query({
        query: `SELECT * FROM c WHERE c.companyId = @companyId AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) ORDER BY c.date DESC ${paginationClause(pg)}`,
        parameters: [{ name: "@companyId", value: req.params.companyId }],
      })
      .fetchAll();
    res.json(paginatedResponse(resources, pg));
  } catch (err) {
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// Invoices
router.get("/companies/:companyId/invoices", async (req, res) => {
  try {
    const queryValidation = InvoicesQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      res.status(400).json({
        error: { code: "VAL-001", message: "Invalid query parameters" },
        meta: { issues: queryValidation.error.issues },
      });
      return;
    }

    const pg = parsePagination(req);
    const typeFilter = queryValidation.data.type ? "AND c.type = @type" : "";
    const params: { name: string; value: string }[] = [
      { name: "@companyId", value: req.params.companyId },
    ];
    if (queryValidation.data.type) {
      params.push({ name: "@type", value: queryValidation.data.type });
    }
    const { resources } = await containers
      .documents()
      .items.query({
        query: `SELECT * FROM c WHERE c.companyId = @companyId AND (c.docType = 'invoice' OR IS_DEFINED(c.invoiceNumber)) ${typeFilter} ORDER BY c.date DESC ${paginationClause(pg)}`,
        parameters: params,
      })
      .fetchAll();
    res.json(paginatedResponse(resources, pg));
  } catch (err) {
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// Contacts
router.get("/companies/:companyId/contacts", async (req, res) => {
  try {
    const pg = parsePagination(req);
    const { resources } = await containers
      .contacts()
      .items.query({
        query: `SELECT * FROM c WHERE c.companyId = @companyId ORDER BY c.name ${paginationClause(pg)}`,
        parameters: [{ name: "@companyId", value: req.params.companyId }],
      })
      .fetchAll();
    res.json(paginatedResponse(resources, pg));
  } catch (err) {
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.patch("/companies/:companyId/contacts/:contactId", async (req, res) => {
  try {
    const contact = await updateContact(
      req.params.companyId,
      req.params.contactId,
      req.body,
    );
    if (!contact) {
      res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Contact not found" } });
      return;
    }
    res.json({ data: contact } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "UPDATE_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// Items
router.get("/companies/:companyId/items", async (req, res) => {
  try {
    const pg = parsePagination(req);
    const { resources } = await containers
      .inventory()
      .items.query({
        query: `SELECT * FROM c WHERE c.companyId = @companyId AND (c.docType = 'item' OR IS_DEFINED(c.sellingPrice)) ORDER BY c.name ${paginationClause(pg)}`,
        parameters: [{ name: "@companyId", value: req.params.companyId }],
      })
      .fetchAll();
    res.json(paginatedResponse(resources, pg));
  } catch (err) {
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// Item transactions (GL entries that reference this item)
router.get(
  "/companies/:companyId/items/:itemCode/transactions",
  async (req, res) => {
    try {
      const { companyId, itemCode } = req.params;
      const { resources: entries } = await containers
        .ledger()
        .items.query<any>({
          query:
            "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) AND c.status = 'posted' ORDER BY c.date DESC",
          parameters: [{ name: "@cid", value: companyId }],
        })
        .fetchAll();

      // Filter to entries that have lines referencing this item
      const result: any[] = [];
      for (const entry of entries) {
        const matchingLines = (entry.lines || []).filter(
          (l: any) => l.itemCode === itemCode || l.itemId === itemCode,
        );
        if (matchingLines.length > 0) {
          result.push({ ...entry, lines: matchingLines });
        }
      }
      res.json({ data: result } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, "QUERY_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

// Chat (Agent interaction)
router.get("/companies/:companyId/chat", async (req, res) => {
  try {
    const { resources } = await containers
      .chat()
      .items.query({
        query:
          "SELECT * FROM c WHERE c.companyId = @companyId ORDER BY c.timestamp DESC OFFSET 0 LIMIT 50",
        parameters: [{ name: "@companyId", value: req.params.companyId }],
      })
      .fetchAll();
    const response: ApiResponse = { data: resources.reverse() };
    res.json(response);
  } catch (err) {
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Finance: Journal Entries ───────────────────────────────

function handleGLError(err: unknown, res: import("express").Response) {
  if (err instanceof GLError) {
    res.status(400).json({ error: { code: err.code, message: err.message } });
  } else {
    {
      const e = safeError(err, "SYS-001");
      res.status(e.status).json(e.body);
    }
  }
}

router.post(
  "/companies/:companyId/journal-entries",
  validate(PostJournalEntrySchema),
  async (req, res) => {
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
  },
);

router.post(
  "/companies/:companyId/journal-entries/:entryId/reverse",
  async (req, res) => {
    try {
      const entry = await reverseJournalEntry(
        req.params.companyId,
        req.params.entryId,
        req.user!.id,
      );
      res.json({ data: entry } as ApiResponse);
    } catch (err) {
      handleGLError(err, res);
    }
  },
);

router.get("/companies/:companyId/trial-balance", async (req, res) => {
  try {
    const queryValidation = TrialBalanceQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      res.status(400).json({
        error: { code: "VAL-001", message: "Invalid query parameters" },
        meta: { issues: queryValidation.error.issues },
      });
      return;
    }

    const from = queryValidation.data.from;
    const to = queryValidation.data.to;
    const result = await getTrialBalance(req.params.companyId, from, to);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Invoice Upload & Recognition ───────────────────────────

router.post("/companies/:companyId/invoices/upload", async (req, res) => {
  try {
    const { image, mimeType } = req.body; // base64 image, mime type
    if (!image || !mimeType) {
      res.status(400).json({
        error: {
          code: "MISSING_DATA",
          message: "image and mimeType required",
        },
      });
      return;
    }

    // Step 1: Recognize invoice with GPT-4o vision
    const recognized = await recognizeInvoice(image, mimeType);

    // Step 2: Find or create vendor contact
    let contactId = "";
    const contactName = recognized.vendorName || "Unknown vendor";

    if (recognized.vendorName) {
      const existing = await findContactByName(
        req.params.companyId,
        recognized.vendorName,
        recognized.vendorRegistrationNumber,
      );

      if (existing) {
        contactId = existing.id;
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
      const duplicate = await findDuplicateInvoice(
        req.params.companyId,
        contactId,
        recognized.invoiceNumber,
      );
      if (duplicate) {
        // Auto-cancel the old duplicate and continue with new one
        try {
          await cancelInvoice(
            req.params.companyId,
            duplicate.id,
            "Replaced by re-upload",
            req.user!.id,
          );
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
      res.status(400).json({
        error: {
          code: "NO_LINES",
          message:
            "Could not extract any line items with amounts from the invoice.",
        },
      });
      return;
    }

    const invoice = await createInvoice({
      companyId: req.params.companyId,
      type: "purchase",
      contactId,
      contactName,
      date: recognized.invoiceDate,
      dueDate:
        recognized.dueDate ||
        new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      vendorInvoiceNumber: recognized.invoiceNumber,
      recognitionConfidence: recognized.confidence,
      lines: invoiceLines,
      createdBy: req.user!.id,
    });

    // Step 4: Auto-post to ledger
    const postedInvoice = await postInvoice(
      req.params.companyId,
      invoice.id,
      req.user!.id,
    );

    res.status(201).json({
      data: {
        recognized,
        invoice: postedInvoice,
        contactId,
        message: `Invoice ${postedInvoice.invoiceNumber} from ${contactName} for €${postedInvoice.total.toFixed(2)} created and posted to ledger.`,
      },
    } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "UPLOAD_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Finance: Invoices (CRUD + post) ────────────────────────

router.post(
  "/companies/:companyId/invoices",
  validate(CreateInvoiceSchema),
  async (req, res) => {
    try {
      const invoice = await createInvoice({
        companyId: req.params.companyId,
        ...req.body,
        createdBy: req.user!.id,
      });
      res.status(201).json({
        data: invoice,
        meta: {
          operation: {
            operation: "create",
            entityType: "invoice",
            entityId: invoice.id,
            status: "success",
            message: `Invoice ${invoice.invoiceNumber} created`,
            suggestedActions: ["post", "edit", "attach-document"],
          },
        },
      } as ApiResponse);
    } catch (err) {
      handleGLError(err, res);
    }
  },
);

router.get("/companies/:companyId/invoices/:invoiceId", async (req, res) => {
  const invoice = await getInvoice(req.params.companyId, req.params.invoiceId);
  if (!invoice) {
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Invoice not found" } });
    return;
  }
  res.json({ data: invoice } as ApiResponse);
});

router.post(
  "/companies/:companyId/invoices/:invoiceId/post",
  async (req, res) => {
    try {
      const invoice = await postInvoice(
        req.params.companyId,
        req.params.invoiceId,
        req.user!.id,
      );
      res.json({ data: invoice } as ApiResponse);
    } catch (err) {
      handleGLError(err, res);
    }
  },
);

router.post(
  "/companies/:companyId/invoices/:invoiceId/cancel",
  async (req, res) => {
    try {
      const invoice = await cancelInvoice(
        req.params.companyId,
        req.params.invoiceId,
        req.body.reason || "Cancelled by user",
        req.user!.id,
      );
      res.json({ data: invoice } as ApiResponse);
    } catch (err) {
      handleGLError(err, res);
    }
  },
);

router.get(
  "/companies/:companyId/invoices/:invoiceId/postings",
  async (req, res) => {
    try {
      const postings = await getInvoicePostings(
        req.params.companyId,
        req.params.invoiceId,
      );
      res.json({ data: postings } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, "QUERY_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

// ─── Finance: Payments ──────────────────────────────────────

router.post(
  "/companies/:companyId/payments",
  validate(CreatePaymentSchema),
  async (req, res) => {
    try {
      const payment = await createAndPostPayment({
        companyId: req.params.companyId,
        ...req.body,
        createdBy: req.user!.id,
      });
      res.status(201).json({
        data: payment,
        meta: {
          operation: {
            operation: "create",
            entityType: "payment",
            entityId: payment.id,
            status: "success",
            message: `Payment ${payment.paymentNumber} recorded`,
            relatedEntities: (req.body.invoiceAllocations || []).map(
              (a: any) => ({ type: "invoice", id: a.invoiceId }),
            ),
            suggestedActions: ["view-journal-entry", "reconcile-bank"],
          },
        },
      } as ApiResponse);
    } catch (err) {
      handleGLError(err, res);
    }
  },
);

router.get("/companies/:companyId/payments", async (req, res) => {
  try {
    const type = req.query.type as "incoming" | "outgoing" | undefined;
    const payments = await listPayments(req.params.companyId, type);
    res.json({ data: payments } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Contacts (CRUD) ────────────────────────────────────────

router.get("/companies/:companyId/contacts/find", async (req, res) => {
  try {
    const name = (req.query.name as string) || "";
    const regNumber = req.query.registrationNumber as string | undefined;
    if (!name && !regNumber) {
      res.json({ data: null } as ApiResponse);
      return;
    }
    const contact = await findContactByName(
      req.params.companyId,
      name,
      regNumber,
    );
    res.json({ data: contact } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.post(
  "/companies/:companyId/contacts",
  validate(CreateContactSchema),
  async (req, res) => {
    try {
      const contact = await createContact({
        companyId: req.params.companyId,
        ...req.body,
        createdBy: req.user!.id,
      });
      res.status(201).json({ data: contact } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, "CREATE_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

router.get("/companies/:companyId/contacts/:contactId", async (req, res) => {
  const contact = await getContact(req.params.companyId, req.params.contactId);
  if (!contact) {
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Contact not found" } });
    return;
  }
  res.json({ data: contact } as ApiResponse);
});

router.get(
  "/companies/:companyId/contacts/:contactId/transactions",
  async (req, res) => {
    try {
      const cid = req.params.companyId;
      const contactId = req.params.contactId;

      // Get invoices for this contact
      const { resources: invoices } = await containers
        .documents()
        .items.query({
          query:
            "SELECT * FROM c WHERE c.companyId = @cid AND c.contactId = @contactId AND (c.docType = 'invoice' OR IS_DEFINED(c.invoiceNumber)) ORDER BY c.date DESC",
          parameters: [
            { name: "@cid", value: cid },
            { name: "@contactId", value: contactId },
          ],
        })
        .fetchAll();

      // Get payments for this contact
      const { resources: payments } = await containers
        .documents()
        .items.query({
          query:
            "SELECT * FROM c WHERE c.companyId = @cid AND c.contactId = @contactId AND (c.docType = 'payment' OR IS_DEFINED(c.bankAccountIban)) ORDER BY c.date DESC",
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
      const totalPaid = payments.reduce(
        (s: number, p: any) => s + (p.amount || 0),
        0,
      );
      const balance = Math.round((totalInvoiced - totalPaid) * 100) / 100;

      res.json({
        data: { invoices, payments, totalInvoiced, totalPaid, balance },
      } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, "QUERY_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

// ─── Inventory ──────────────────────────────────────────────

router.post(
  "/companies/:companyId/items",
  validate(CreateItemSchema),
  async (req, res) => {
    try {
      const item = await createItem({
        companyId: req.params.companyId,
        ...req.body,
        createdBy: req.user!.id,
      });
      res.status(201).json({ data: item } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, "CREATE_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

// ─── Contact Merge & Register ───────────────────────────────

router.post("/companies/:companyId/contacts/merge", async (req, res) => {
  try {
    const { sourceContactId, targetContactId } = req.body;
    if (!sourceContactId || !targetContactId) {
      res.status(400).json({
        error: {
          code: "VAL-001",
          message: "sourceContactId and targetContactId are required",
        },
      });
      return;
    }
    const result = await mergeContacts(
      req.params.companyId,
      sourceContactId,
      targetContactId,
      req.user!.id,
    );
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: { code: "BIZ-001", message } });
  }
});

router.get("/companies/:companyId/contacts/duplicates", async (req, res) => {
  try {
    const groups = await findDuplicateContacts(req.params.companyId);
    res.json({ data: groups } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.get(
  "/companies/:companyId/contacts/:contactId/check-register",
  async (req, res) => {
    try {
      const result = await checkContactRegister(
        req.params.companyId,
        req.params.contactId,
      );
      res.json({ data: result } as ApiResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: { code: "BIZ-001", message } });
    }
  },
);

router.post(
  "/companies/:companyId/contacts/:contactId/apply-register",
  async (req, res) => {
    try {
      const updated = await applyRegisterData(
        req.params.companyId,
        req.params.contactId,
        req.body,
        req.user!.id,
      );
      if (!updated) {
        res
          .status(404)
          .json({ error: { code: "NOT_FOUND", message: "Contact not found" } });
        return;
      }
      res.json({ data: updated } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, "SYS-001");
        res.status(e.status).json(e.body);
      }
    }
  },
);

router.post(
  "/companies/:companyId/contacts/parse-description",
  async (req, res) => {
    try {
      const description = req.body.description as string;
      if (!description?.trim()) {
        res.status(400).json({
          error: { code: "VAL-001", message: "Description is required" },
        });
        return;
      }
      const fields = await parseContactDescription(description.trim());
      res.json({ data: fields } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, "PARSE_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

router.post(
  "/companies/:companyId/items/parse-description",
  async (req, res) => {
    try {
      const description = req.body.description as string;
      if (!description?.trim()) {
        res.status(400).json({
          error: { code: "VAL-001", message: "Description is required" },
        });
        return;
      }
      const fields = await parseItemDescription(description.trim());
      res.json({ data: fields } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, "PARSE_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

router.post(
  "/companies/:companyId/invoices/parse-description",
  async (req, res) => {
    try {
      const description = req.body.description as string;
      if (!description?.trim()) {
        res.status(400).json({
          error: { code: "VAL-001", message: "Description is required" },
        });
        return;
      }
      const fields = await parseInvoiceDescription(description.trim());
      res.json({ data: fields } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, "PARSE_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

router.post(
  "/companies/:companyId/fixed-assets/parse-description",
  async (req, res) => {
    try {
      const description = req.body.description as string;
      if (!description?.trim()) {
        res.status(400).json({
          error: { code: "VAL-001", message: "Description is required" },
        });
        return;
      }
      const fields = await parseAssetDescription(description.trim());
      res.json({ data: fields } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, "PARSE_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

// ─── Reporting ──────────────────────────────────────────────

router.get("/companies/:companyId/reports/balance-sheet", async (req, res) => {
  try {
    const report = await getBalanceSheet(req.params.companyId);
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "REPORT_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.get("/companies/:companyId/reports/profit-loss", async (req, res) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const report = await getProfitAndLoss(req.params.companyId, from, to);
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "REPORT_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.post("/companies/:companyId/vat-returns", async (req, res) => {
  try {
    const { year, month } = req.body;
    const vatReturn = await generateVatReturn(
      req.params.companyId,
      year,
      month,
      req.user!.id,
    );
    res.status(201).json({ data: vatReturn } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "VAT_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Dashboard Summary ──────────────────────────────────────

router.get("/companies/:companyId/dashboard", async (req, res) => {
  try {
    const cid = req.params.companyId;

    // Get key account balances in parallel
    const [cashResult, arResult, apResult, vatOutResult, vatInResult] =
      await Promise.all([
        containers
          .ledger()
          .item(`${cid}-acct-2420`, cid)
          .read<Account>()
          .catch(() => ({ resource: null })),
        containers
          .ledger()
          .item(`${cid}-acct-2210`, cid)
          .read<Account>()
          .catch(() => ({ resource: null })),
        containers
          .ledger()
          .item(`${cid}-acct-4220`, cid)
          .read<Account>()
          .catch(() => ({ resource: null })),
        containers
          .ledger()
          .item(`${cid}-acct-4230`, cid)
          .read<Account>()
          .catch(() => ({ resource: null })),
        containers
          .ledger()
          .item(`${cid}-acct-2310`, cid)
          .read<Account>()
          .catch(() => ({ resource: null })),
      ]);

    const cash = cashResult.resource?.balance ?? 0;
    const receivables = arResult.resource?.balance ?? 0;
    const payables = Math.abs(apResult.resource?.balance ?? 0);
    const vatPayable = Math.abs(vatOutResult.resource?.balance ?? 0);
    const vatReceivable = vatInResult.resource?.balance ?? 0;
    const vatDue = Math.round((vatPayable - vatReceivable) * 100) / 100;

    // Recent invoices
    const { resources: recentInvoices } = await containers
      .documents()
      .items.query({
        query:
          "SELECT TOP 5 c.id, c.invoiceNumber, c.type, c.contactName, c.total, c.status, c.date FROM c WHERE c.companyId = @cid AND (c.docType = 'invoice' OR IS_DEFINED(c.invoiceNumber)) ORDER BY c.date DESC",
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
    {
      const e = safeError(err, "DASHBOARD_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Migration: Generate short names ────────────────────────

router.post("/migrate/short-names", async (req, res) => {
  try {
    let updated = 0;

    // Update companies
    const { resources: companies } = await containers
      .companies()
      .items.query<Company>({
        query: "SELECT * FROM c", // eslint-disable-line era/no-cross-partition-query
        parameters: [],
      })
      .fetchAll();

    for (const company of companies) {
      if (!company.shortName) {
        const shortName = generateShortName(company.name);
        await containers
          .companies()
          .item(company.id, company.id)
          .patch([{ op: "add", path: "/shortName", value: shortName }]);
        updated++;
      }
    }

    // Update contacts per company
    for (const company of companies) {
      const { resources: contacts } = await containers
        .contacts()
        .items.query({
          query: "SELECT * FROM c WHERE c.companyId = @cid",
          parameters: [{ name: "@cid", value: company.id }],
        })
        .fetchAll();

      for (const contact of contacts) {
        if (!contact.shortName && contact.name) {
          const shortName = generateShortName(contact.name);
          await containers
            .contacts()
            .item(contact.id, contact.companyId)
            .patch([{ op: "add", path: "/shortName", value: shortName }]);
          updated++;
        }
      }
    }

    res.json({ data: { updated } } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "MIGRATION_FAILED");
      res.status(e.status).json(e.body);
    }
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
    {
      const e = safeError(err, "AGENT_ERROR");
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Feedback / Dev Tasks ───────────────────────────────────

router.post("/feedback", validate(SubmitFeedbackSchema), async (req, res) => {
  try {
    const { page, message, companyId } = req.body;
    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      res.status(400).json({
        error: { code: "INVALID_INPUT", message: "Message is required" },
      });
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
    {
      const e = safeError(err, "CREATE_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.get("/feedback", async (req, res) => {
  try {
    const pg = parsePagination(req);
    const statusFilter = req.query.status ? " WHERE c.status = @status" : "";
    const params = req.query.status
      ? [{ name: "@status", value: req.query.status as string }]
      : [];
    const { resources } = await containers
      .feedback()
      .items.query<Feedback>({
        query: `SELECT * FROM c${statusFilter} ORDER BY c.submittedAt DESC ${paginationClause(pg)}`, // eslint-disable-line era/no-cross-partition-query
        parameters: params,
      })
      .fetchAll();
    res.json(paginatedResponse(resources, pg));
  } catch (err) {
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.patch("/feedback/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["open", "in-progress", "done", "dismissed"];
    if (!status || !validStatuses.includes(status)) {
      res
        .status(400)
        .json({ error: { code: "INVALID_INPUT", message: "Invalid status" } });
      return;
    }
    const { resource } = await containers
      .feedback()
      .item(req.params.id, req.params.id)
      .read<Feedback>();
    if (!resource) {
      res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Feedback not found" } });
      return;
    }
    const updated = {
      ...resource,
      status,
      resolvedAt:
        status === "done" || status === "dismissed"
          ? new Date().toISOString()
          : resource.resolvedAt,
    };
    await containers
      .feedback()
      .item(req.params.id, req.params.id)
      .replace(updated);
    res.json({ data: updated } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "UPDATE_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Posting Rules ──────────────────────────────────────────

router.get("/rules", async (req, res) => {
  try {
    const country = (req.query.country as string) || "LV";
    const { resources } = await containers
      .rules()
      .items.query<PostingRule>({
        query:
          "SELECT * FROM c WHERE c.country = @country ORDER BY c.documentType, c.version DESC",
        parameters: [{ name: "@country", value: country }],
      })
      .fetchAll();
    res.json({ data: resources } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.post("/rules/seed", async (req, res) => {
  try {
    // Dynamic import to allow seeding from country files
    const { LV_POSTING_RULES } = await import("../../shared/rules/lv.js");
    const count = await seedRules(LV_POSTING_RULES);
    res.json({
      data: { seeded: count, total: LV_POSTING_RULES.length },
    } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "SEED_FAILED");
      res.status(e.status).json(e.body);
    }
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
    if (req.query.type)
      params.push({ name: "@type", value: req.query.type as string });

    const { resources } = await containers
      .events()
      .items.query<BusinessEvent>({
        query: `SELECT * FROM c WHERE c.companyId = @cid${typeFilter} ORDER BY c.timestamp DESC OFFSET 0 LIMIT ${limit}`,
        parameters: params,
      })
      .fetchAll();
    res.json({ data: resources } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Exchange Rates & Currency Revaluation ──────────────────

router.get("/exchange-rates", async (req, res) => {
  try {
    const { from, to, rateType, date } = req.query;
    if (!from || !to) {
      res.status(400).json({
        error: {
          code: "VAL-001",
          message: "from and to currency codes are required",
        },
      });
      return;
    }
    const rate = await getExchangeRate(
      from as string,
      to as string,
      (rateType as any) || "daily",
      (date as string) || new Date().toISOString().slice(0, 10),
    );
    res.json({
      data: { from, to, rateType: rateType || "daily", rate },
    } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post("/exchange-rates", async (req, res) => {
  try {
    const { fromCurrency, toCurrency, rateType, rate, effectiveDate, source } =
      req.body;
    if (!fromCurrency || !toCurrency || !rate || !effectiveDate) {
      res.status(400).json({
        error: {
          code: "VAL-001",
          message:
            "fromCurrency, toCurrency, rate, and effectiveDate are required",
        },
      });
      return;
    }
    const saved = await saveExchangeRate({
      fromCurrency,
      toCurrency,
      rateType: rateType || "daily",
      rate,
      effectiveDate,
      source: source || "manual",
    });
    res.status(201).json({ data: saved } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "SYS-001");
      res.status(e.status).json(e.body);
    }
  }
});

router.post("/exchange-rates/import-ecb", async (req, res) => {
  try {
    const date = req.body.date || new Date().toISOString().slice(0, 10);
    const result = await importSystemRates("ecb", date);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post("/exchange-rates/import-system", async (req, res) => {
  try {
    const { source, date } = req.body;
    if (!source || !["ecb", "latvian-bank"].includes(source)) {
      res.status(400).json({
        error: {
          code: "VAL-001",
          message: "source must be 'ecb' or 'latvian-bank'",
        },
      });
      return;
    }
    const effectiveDate = date || new Date().toISOString().slice(0, 10);
    const result = await importSystemRates(source, effectiveDate);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post("/companies/:companyId/currency-revaluation", async (req, res) => {
  try {
    const { period } = req.body;
    if (!period) {
      res.status(400).json({
        error: { code: "VAL-001", message: "period is required (YYYY-MM)" },
      });
      return;
    }
    const result = await runForeignCurrencyRevaluation(
      req.params.companyId,
      period,
      req.user!.id,
    );
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

// ─── Period Close & Year-End ────────────────────────────────

router.post("/companies/:companyId/periods/:period/close", async (req, res) => {
  try {
    const result = await closePeriod(
      req.params.companyId,
      req.params.period,
      req.user!.id,
    );
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post(
  "/companies/:companyId/periods/:period/reopen",
  async (req, res) => {
    try {
      const result = await reopenPeriod(
        req.params.companyId,
        req.params.period,
        req.user!.id,
      );
      res.json({ data: result } as ApiResponse);
    } catch (err) {
      handleGLError(err, res);
    }
  },
);

router.get("/companies/:companyId/periods/:period", async (req, res) => {
  const result = await getPeriodStatus(req.params.companyId, req.params.period);
  res.json({
    data: result || { period: req.params.period, status: "open" },
  } as ApiResponse);
});

router.post("/companies/:companyId/year-end-close", async (req, res) => {
  try {
    const { fiscalYear } = req.body;
    if (!fiscalYear) {
      res.status(400).json({
        error: { code: "MISSING_YEAR", message: "fiscalYear is required" },
      });
      return;
    }
    const result = await yearEndClose(
      req.params.companyId,
      fiscalYear,
      req.user!.id,
    );
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

// ─── Credit Notes ───────────────────────────────────────────

router.post(
  "/companies/:companyId/invoices/:invoiceId/credit-note",
  async (req, res) => {
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
  },
);

// ─── Invoice PDF ────────────────────────────────────────────

router.get(
  "/companies/:companyId/invoices/:invoiceId/pdf",
  async (req, res) => {
    try {
      const pdf = await generateInvoicePdf(
        req.params.companyId,
        req.params.invoiceId,
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="invoice-${req.params.invoiceId}.pdf"`,
      );
      res.send(pdf);
    } catch (err) {
      {
        const e = safeError(err, "PDF_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

// ─── VAT Declaration Export ─────────────────────────────────

router.get(
  "/companies/:companyId/reports/vat-declaration",
  async (req, res) => {
    try {
      const year =
        parseInt(req.query.year as string) || new Date().getFullYear();
      const month =
        parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const declaration = await generateVatDeclaration(
        req.params.companyId,
        year,
        month,
      );
      res.json({ data: declaration } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, "VAT_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

// ─── Annual Financial Statements ────────────────────────────

router.get("/companies/:companyId/reports/annual", async (req, res) => {
  try {
    const year =
      parseInt(req.query.year as string) || new Date().getFullYear() - 1;
    const report = await generateAnnualReport(req.params.companyId, year);
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "REPORT_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// ─── AR/AP Aging ────────────────────────────────────────────

router.get("/companies/:companyId/reports/ar-aging", async (req, res) => {
  try {
    const report = await getAgingReport(req.params.companyId, "ar");
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "REPORT_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.get("/companies/:companyId/reports/ap-aging", async (req, res) => {
  try {
    const report = await getAgingReport(req.params.companyId, "ap");
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "REPORT_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Mark Overdue Invoices ──────────────────────────────────

router.post("/companies/:companyId/invoices/mark-overdue", async (req, res) => {
  try {
    const count = await markOverdueInvoices(req.params.companyId);
    res.json({ data: { updated: count } } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "UPDATE_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Bank Reconciliation ────────────────────────────────────

router.post("/companies/:companyId/bank-reconciliations", async (req, res) => {
  try {
    const result = await importBankStatement({
      ...req.body,
      companyId: req.params.companyId,
      createdBy: req.user!.id,
    });
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
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.get(
  "/companies/:companyId/bank-reconciliations/open-invoices",
  async (req, res) => {
    try {
      const invoices = await getOpenInvoices(req.params.companyId);
      res.json({ data: invoices } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, "QUERY_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

router.get(
  "/companies/:companyId/bank-reconciliations/:reconId",
  async (req, res) => {
    try {
      const recon = await getReconciliation(
        req.params.companyId,
        req.params.reconId,
      );
      res.json({ data: recon } as ApiResponse);
    } catch (err) {
      handleGLError(err, res);
    }
  },
);

router.post(
  "/companies/:companyId/bank-reconciliations/:reconId/post-line",
  async (req, res) => {
    try {
      await postUnmatchedLine(
        req.params.companyId,
        req.params.reconId,
        req.body.lineId,
        req.body.accountCode,
        req.body.accountName,
        req.user!.id,
      );
      res.json({ data: { success: true } } as ApiResponse);
    } catch (err) {
      handleGLError(err, res);
    }
  },
);

router.post(
  "/companies/:companyId/bank-reconciliations/:reconId/match-invoice",
  async (req, res) => {
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
  },
);

router.post(
  "/companies/:companyId/bank-reconciliations/:reconId/manual-transaction",
  async (req, res) => {
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
  },
);

router.post(
  "/companies/:companyId/bank-reconciliations/:reconId/suggest-account",
  async (req, res) => {
    try {
      const suggestion = suggestLedgerAccount(req.body.description || "");
      res.json({ data: suggestion } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, "SUGGEST_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

router.post(
  "/companies/:companyId/bank-reconciliations/:reconId/complete",
  async (req, res) => {
    try {
      const result = await completeReconciliation(
        req.params.companyId,
        req.params.reconId,
        req.user!.id,
      );
      res.json({ data: result } as ApiResponse);
    } catch (err) {
      handleGLError(err, res);
    }
  },
);

// ─── Recurring Entries ──────────────────────────────────────

router.get("/companies/:companyId/recurring-templates", async (req, res) => {
  try {
    const list = await listRecurringTemplates(req.params.companyId);
    res.json({ data: list } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.post("/companies/:companyId/recurring-templates", async (req, res) => {
  try {
    const template = await createRecurringTemplate({
      ...req.body,
      companyId: req.params.companyId,
      createdBy: req.user!.id,
    });
    res.status(201).json({ data: template } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "CREATE_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.post(
  "/companies/:companyId/recurring-templates/:templateId/execute",
  async (req, res) => {
    try {
      const date = req.body.date || new Date().toISOString().slice(0, 10);
      const entry = await executeRecurringTemplate(
        req.params.companyId,
        req.params.templateId,
        date,
        req.user!.id,
      );
      res.json({ data: entry } as ApiResponse);
    } catch (err) {
      handleGLError(err, res);
    }
  },
);

// ─── Fixed Assets ───────────────────────────────────────────

router.get("/companies/:companyId/fixed-assets", async (req, res) => {
  try {
    const assets = await listFixedAssets(req.params.companyId);
    res.json({ data: assets } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "QUERY_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.post("/companies/:companyId/fixed-assets", async (req, res) => {
  try {
    const asset = await acquireAsset({
      ...req.body,
      companyId: req.params.companyId,
      createdBy: req.user!.id,
    });
    res.status(201).json({ data: asset } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post(
  "/companies/:companyId/fixed-assets/depreciate",
  async (req, res) => {
    try {
      const period = req.body.period || new Date().toISOString().slice(0, 7);
      const result = await runDepreciation(
        req.params.companyId,
        period,
        req.user!.id,
      );
      res.json({ data: result } as ApiResponse);
    } catch (err) {
      handleGLError(err, res);
    }
  },
);

router.post(
  "/companies/:companyId/fixed-assets/:assetId/dispose",
  async (req, res) => {
    try {
      const asset = await disposeAsset(
        req.params.companyId,
        req.params.assetId,
        req.body.disposalDate || new Date().toISOString().slice(0, 10),
        req.body.disposalAmount || 0,
        req.user!.id,
      );
      res.json({ data: asset } as ApiResponse);
    } catch (err) {
      handleGLError(err, res);
    }
  },
);

router.get(
  "/companies/:companyId/fixed-assets/:assetId/transactions",
  async (req, res) => {
    try {
      const { companyId, assetId } = req.params;
      // First get the asset to know its account codes
      const { resource: asset } = await containers
        .inventory()
        .item(assetId, companyId)
        .read<any>();
      const accountCodes = asset
        ? [
            asset.assetAccountCode,
            asset.depreciationAccountCode,
            asset.expenseAccountCode,
          ].filter(Boolean)
        : [];

      // Find entries linked by sourceId OR containing lines with this asset's account codes
      const { resources: entries } = await containers
        .ledger()
        .items.query<any>({
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
        return e.lines.some(
          (l: any) =>
            accountCodes.includes(l.accountCode) &&
            (l.accountName?.includes(asset?.name) ||
              l.description?.includes(asset?.name)),
        );
      });

      res.json({ data: filtered } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, "QUERY_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

// ─── Budgets ────────────────────────────────────────────────

router.post("/companies/:companyId/budgets", async (req, res) => {
  try {
    const { year, entries: rawEntries } = req.body;
    const companyId = req.params.companyId;
    const fiscalYear = year || new Date().getFullYear();

    // Look up account names and expand monthly amounts into 12 periods
    const { resources: accounts } = await containers
      .ledger()
      .items.query<Account>({
        query:
          "SELECT c.code, c.name FROM c WHERE c.companyId = @cid AND c.docType = 'account' AND c.isPostable = true",
        parameters: [{ name: "@cid", value: companyId }],
      })
      .fetchAll();
    const acctMap = new Map(accounts.map((a) => [a.code, a.name]));

    const expandedEntries: Array<{
      accountCode: string;
      accountName: string;
      period: string;
      amount: number;
    }> = [];
    for (const e of rawEntries || []) {
      const accountCode = e.accountCode;
      const accountName = acctMap.get(accountCode) || accountCode;
      const monthlyAmount = e.monthlyAmount ?? e.amount ?? 0;
      for (let m = 1; m <= 12; m++) {
        expandedEntries.push({
          accountCode,
          accountName,
          period: `${fiscalYear}-${String(m).padStart(2, "0")}`,
          amount: monthlyAmount,
        });
      }
    }

    const count = await setBudget({
      companyId,
      fiscalYear,
      entries: expandedEntries,
      createdBy: req.user!.id,
    });
    res.json({ data: { entriesCreated: count } } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "CREATE_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.get(
  "/companies/:companyId/reports/budget-vs-actual",
  async (req, res) => {
    try {
      const year =
        parseInt(req.query.year as string) || new Date().getFullYear();
      const report = await getBudgetVsActual(req.params.companyId, year);
      res.json({ data: report } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, "REPORT_FAILED");
        res.status(e.status).json(e.body);
      }
    }
  },
);

// ─── Autonomous Task Endpoints ──────────────────────────────

router.post("/companies/:companyId/run-month-end", async (req, res) => {
  try {
    const period =
      req.body.period ||
      (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().slice(0, 7);
      })();
    const result = await runMonthEnd(
      req.params.companyId,
      period,
      req.user!.id,
    );
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "MONTH_END_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.post("/companies/:companyId/run-year-end", async (req, res) => {
  try {
    const fiscalYear = req.body.fiscalYear || new Date().getFullYear() - 1;
    const result = await runYearEnd(
      req.params.companyId,
      fiscalYear,
      req.user!.id,
    );
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "YEAR_END_FAILED");
      res.status(e.status).json(e.body);
    }
  }
});

router.get("/companies/:companyId/health", async (req, res) => {
  try {
    const health = await checkCompanyHealth(req.params.companyId);
    res.json({ data: health } as ApiResponse);
  } catch {
    res.status(500).json({
      error: { code: "HEALTH_CHECK_FAILED", message: "Health check failed" },
    });
  }
});

router.get("/companies/:companyId/close-runs", async (req, res) => {
  try {
    const runs = await listCloseRuns(req.params.companyId);
    res.json({ data: runs } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "SYS-001");
      res.status(e.status).json(e.body);
    }
  }
});

router.get("/companies/:companyId/close-runs/:runId", async (req, res) => {
  try {
    const run = await getCloseRun(req.params.companyId, req.params.runId);
    if (!run)
      return res
        .status(404)
        .json({ error: { code: "SYS-002", message: "Close run not found" } });
    res.json({ data: run } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, "SYS-001");
      res.status(e.status).json(e.body);
    }
  }
});
