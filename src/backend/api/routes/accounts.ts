import { Router } from 'express';
import { containers } from '../../services/cosmos.js';
import { parsePagination } from '../../middleware/pagination.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse, Account } from '@shared/types';
import { AccountsQuerySchema } from './common.js';

const router = Router();

// Chart of Accounts
router.get('/companies/:companyId/accounts', async (req, res) => {
  try {
    const queryValidation = AccountsQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      res.status(400).json({
        error: { code: 'VAL-001', message: 'Invalid query parameters' },
        meta: { issues: queryValidation.error.issues },
      });
      return;
    }

    const { resources: accounts } = await containers
      .ledger()
      .items.query<Account>({
        query:
          "SELECT * FROM c WHERE c.companyId = @companyId AND (c.docType = 'account' OR (IS_DEFINED(c.code) AND IS_DEFINED(c.normalSide))) ORDER BY c.code",
        parameters: [{ name: '@companyId', value: req.params.companyId }],
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
            { name: '@cid', value: req.params.companyId },
            { name: '@asOf', value: asOf },
          ],
        })
        .fetchAll();

      const deltas = new Map<string, number>();
      for (const entry of entries) {
        for (const line of entry.lines || []) {
          if (!line.accountCode) continue;
          deltas.set(
            line.accountCode,
            (deltas.get(line.accountCode) || 0) + (line.debit || 0) - (line.credit || 0),
          );
        }
      }

      for (const account of accounts) {
        if (account.isPostable) {
          const delta = deltas.get(account.code) || 0;
          account.balance =
            Math.round((account.normalSide === 'credit' ? -delta : delta) * 100) / 100;
        }
      }
    }

    const response: ApiResponse = { data: accounts };
    res.json(response);
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

// Account transactions (journal entry lines for a specific account)
router.get('/companies/:companyId/accounts/:accountCode/transactions', async (req, res) => {
  try {
    const { companyId, accountCode } = req.params;
    const asOf = req.query.asOf as string | undefined;
    const pg = parsePagination(req);

    // Use Cosmos UDF-free approach: filter entries that contain this account code in lines
    // ARRAY_CONTAINS with partial match filters server-side, reducing data transfer
    let query =
      "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) AND c.status = 'posted'";
    const parameters: { name: string; value: string }[] = [{ name: '@cid', value: companyId }];
    if (asOf) {
      query += ' AND c.date <= @asOf';
      parameters.push({ name: '@asOf', value: asOf });
    }
    query += ' ORDER BY c.date DESC';

    const { resources: entries } = await containers
      .ledger()
      .items.query<any>({ query, parameters })
      .fetchAll();

    // Look up account to determine normal side
    const accountId = `${companyId}-acct-${accountCode}`;
    let normalSide: 'debit' | 'credit' = 'debit';
    try {
      const { resource } = await containers.ledger().item(accountId, companyId).read<Account>();
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
        a.date.localeCompare(b.date) || (a.entryNumber || '').localeCompare(b.entryNumber || ''),
    );

    for (const entry of sorted) {
      for (const line of entry.lines || []) {
        if (line.accountCode !== accountCode) continue;
        const delta =
          normalSide === 'credit'
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
          sourceType: entry.sourceType || 'manual',
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
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
