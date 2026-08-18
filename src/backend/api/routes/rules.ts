import { Router } from 'express';
import { seedRules } from '../../services/posting-rules.js';
import { containers } from '../../services/cosmos.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse, PostingRule } from '@shared/types';

const router = Router();

// ─── Posting Rules ──────────────────────────────────────────

router.get('/rules', async (req, res) => {
  try {
    const country = (req.query.country as string) || 'LV';
    const { resources } = await containers
      .rules()
      .items.query<PostingRule>({
        query: 'SELECT * FROM c WHERE c.country = @country ORDER BY c.documentType, c.version DESC',
        parameters: [{ name: '@country', value: country }],
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

router.post('/rules/seed', async (req, res) => {
  try {
    // Dynamic import to allow seeding from country files
    const { LV_POSTING_RULES } = await import('../../../shared/rules/lv.js');
    const count = await seedRules(LV_POSTING_RULES);
    res.json({
      data: { seeded: count, total: LV_POSTING_RULES.length },
    } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'SEED_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
