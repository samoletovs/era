import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { companyAccess } from '../middleware/company-access.js';
import { idempotency } from '../middleware/idempotency.js';
import publicRoutes from './routes/public.js';
import lookupRoutes from './routes/lookup.js';
import authRoutes from './routes/auth.js';
import companiesRoutes from './routes/companies.js';
import companySharingRoutes from './routes/company-sharing.js';
import accountsRoutes from './routes/accounts.js';
import ledgerRoutes from './routes/ledger.js';
import invoicesRoutes from './routes/invoices.js';
import contactsRoutes from './routes/contacts.js';
import itemsRoutes from './routes/items.js';
import chatRoutes from './routes/chat.js';
import paymentsRoutes from './routes/payments.js';
import reportsRoutes from './routes/reports.js';
import dashboardRoutes from './routes/dashboard.js';
import migrationsRoutes from './routes/migrations.js';
import feedbackRoutes from './routes/feedback.js';
import rulesRoutes from './routes/rules.js';
import eventsRoutes from './routes/events.js';
import exchangeRatesRoutes from './routes/exchange-rates.js';
import periodCloseRoutes from './routes/period-close.js';
import bankReconciliationRoutes from './routes/bank-reconciliation.js';
import recurringEntriesRoutes from './routes/recurring-entries.js';
import fixedAssetsRoutes from './routes/fixed-assets.js';
import budgetsRoutes from './routes/budgets.js';
import autonomousRoutes from './routes/autonomous.js';
import peppolRoutes from './routes/peppol.js';
import annualReportRoutes from './routes/annual-report.js';
import vidRoutes from './routes/vid.js';
import auditRoutes from './routes/audit.js';

// The API surface is split into domain route modules under `./routes/`.
// Mount order is significant: Express matches routes in registration order,
// so modules are mounted in the same order their routes were originally
// declared.
export const router = Router();

// ─── Public routes ──────────────────────────────────────────

router.use(publicRoutes);

// ─── Protected routes ───────────────────────────────────────

router.use(authMiddleware);
router.use(idempotency);

router.use(lookupRoutes);
router.use(authRoutes);

// Company-level access control for all /companies/:companyId/* routes
router.use('/companies/:companyId', companyAccess);
router.use('/companies/:id', companyAccess);

// `POST /chat` is a flat route that takes its companyId from the BODY, so neither
// pattern above matches it and it ran with no company check at all - while the
// agent behind it holds post_journal_entry and record_payment. Anyone
// authenticated could drive it against any company id they could name.
//
// Surface the body's companyId as a route param so the same guard applies. Doing
// it here rather than inside the handler means the check cannot be forgotten when
// another flat agent route is added next to it.
router.use(
  '/chat',
  function chatCompanyIdFromBody(req, _res, next) {
    const fromBody = (req.body as { companyId?: unknown } | undefined)?.companyId;
    if (typeof fromBody === 'string' && fromBody && !req.params.companyId) {
      req.params.companyId = fromBody;
    }
    next();
  },
  companyAccess,
);

router.use(companiesRoutes);
router.use(companySharingRoutes);
router.use(accountsRoutes);
router.use(ledgerRoutes);
router.use(invoicesRoutes);
router.use(contactsRoutes);
router.use(itemsRoutes);
router.use(chatRoutes);
router.use(paymentsRoutes);
router.use(reportsRoutes);
router.use(dashboardRoutes);
router.use(migrationsRoutes);
router.use(feedbackRoutes);
router.use(rulesRoutes);
router.use(eventsRoutes);
router.use(exchangeRatesRoutes);
router.use(periodCloseRoutes);
router.use(bankReconciliationRoutes);
router.use(recurringEntriesRoutes);
router.use(fixedAssetsRoutes);
router.use(budgetsRoutes);
router.use(autonomousRoutes);
router.use(peppolRoutes);
router.use(annualReportRoutes);
router.use(vidRoutes);
router.use(auditRoutes);
