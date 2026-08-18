import { Router } from 'express';
import { getCashAccountCodes } from '../../services/bank-accounts.js';
import { containers } from '../../services/cosmos.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse, Account } from '@shared/types';

const router = Router();

// ─── Dashboard Summary ──────────────────────────────────────

router.get('/companies/:companyId/dashboard', async (req, res) => {
  try {
    const cid = req.params.companyId;
    const cashAccountCodes = await getCashAccountCodes(cid);

    // Get key account balances in parallel
    const [cashResults, arResult, apResult, vatOutResult, vatInResult] = await Promise.all([
      Promise.all(
        cashAccountCodes.map((code) =>
          containers
            .ledger()
            .item(`${cid}-acct-${code}`, cid)
            .read<Account>()
            .catch(() => ({ resource: null })),
        ),
      ),
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

    const cash =
      Math.round(
        cashResults.reduce((sum, result) => sum + (result.resource?.balance ?? 0), 0) * 100,
      ) / 100;
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
        parameters: [{ name: '@cid', value: cid }],
      })
      .fetchAll();

    res.json({
      data: {
        cash,
        receivables,
        payables,
        vatDue,
        kpiAccounts: {
          cash: {
            balance: cash,
            accountCodes: cashAccountCodes,
          },
        },
        recentInvoices,
      },
    } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'DASHBOARD_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
