import { Router } from 'express';
import { containers } from '../../services/cosmos.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse, BusinessEvent } from '@shared/types';

const router = Router();

// ─── Events (read-only audit log) ───────────────────────────

router.get('/companies/:companyId/events', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const typeFilter = req.query.type ? ' AND c.type = @type' : '';
    const params: { name: string; value: string | number }[] = [
      { name: '@cid', value: req.params.companyId },
    ];
    if (req.query.type) params.push({ name: '@type', value: req.query.type as string });

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
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
