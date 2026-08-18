import { Router } from 'express';
import { searchCompanyByName, searchCompanyByRegNumber } from '../../services/company-lookup.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse } from '@shared/types';

const router = Router();

// Public
router.get('/', (_req, res) => {
  res.json({
    name: 'ERA API',
    version: '0.1.0',
    modules: ['finance', 'inventory', 'sales', 'procurement', 'reporting'],
  });
});

// ─── Public: Register Search (Latvian Enterprise Register) ──

router.get('/register/search', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (!q || q.length < 2) {
      res.json({
        data: { found: false, results: [], source: '' },
      } as ApiResponse);
      return;
    }
    const isRegNumber = /^\d{9,11}$/.test(q.replace(/\s/g, ''));
    const result = isRegNumber
      ? await searchCompanyByRegNumber(q.replace(/\s/g, ''))
      : await searchCompanyByName(q);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'SEARCH_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
