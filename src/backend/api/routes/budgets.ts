import { Router } from 'express';
import { setBudget, getBudgetVsActual } from '../../services/budget.js';
import { containers } from '../../services/cosmos.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse, Account } from '@shared/types';

const router = Router();

// ─── Budgets ────────────────────────────────────────────────

router.post('/companies/:companyId/budgets', async (req, res) => {
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
        parameters: [{ name: '@cid', value: companyId }],
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
          period: `${fiscalYear}-${String(m).padStart(2, '0')}`,
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
      const e = safeError(err, 'CREATE_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.get('/companies/:companyId/reports/budget-vs-actual', async (req, res) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const report = await getBudgetVsActual(req.params.companyId, year);
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'REPORT_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
