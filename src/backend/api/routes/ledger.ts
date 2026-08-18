import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { PostJournalEntrySchema } from '../schemas.js';
import { postJournalEntry, reverseJournalEntry, getTrialBalance } from '../../services/ledger.js';
import { containers } from '../../services/cosmos.js';
import {
  parsePagination,
  paginationClause,
  paginatedResponse,
} from '../../middleware/pagination.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse } from '@shared/types';
import { TrialBalanceQuerySchema, handleGLError } from './common.js';

const router = Router();

// Journal Entries
router.get('/companies/:companyId/journal-entries', async (req, res) => {
  try {
    const pg = parsePagination(req);
    const { resources } = await containers
      .ledger()
      .items.query({
        query: `SELECT * FROM c WHERE c.companyId = @companyId AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) ORDER BY c.date DESC ${paginationClause(pg)}`,
        parameters: [{ name: '@companyId', value: req.params.companyId }],
      })
      .fetchAll();
    res.json(paginatedResponse(resources, pg));
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Finance: Journal Entries ───────────────────────────────

router.post(
  '/companies/:companyId/journal-entries',
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

router.post('/companies/:companyId/journal-entries/:entryId/reverse', async (req, res) => {
  try {
    const entry = await reverseJournalEntry(req.params.companyId, req.params.entryId, req.user!.id);
    res.json({ data: entry } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.get('/companies/:companyId/trial-balance', async (req, res) => {
  try {
    const queryValidation = TrialBalanceQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      res.status(400).json({
        error: { code: 'VAL-001', message: 'Invalid query parameters' },
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
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
