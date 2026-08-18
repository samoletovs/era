import { Router } from 'express';
import {
  createRecurringTemplate,
  listRecurringTemplates,
  executeRecurringTemplate,
} from '../../services/recurring-entries.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse } from '@shared/types';
import { handleGLError } from './common.js';

const router = Router();

// ─── Recurring Entries ──────────────────────────────────────

router.get('/companies/:companyId/recurring-templates', async (req, res) => {
  try {
    const list = await listRecurringTemplates(req.params.companyId);
    res.json({ data: list } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.post('/companies/:companyId/recurring-templates', async (req, res) => {
  try {
    const template = await createRecurringTemplate({
      ...req.body,
      companyId: req.params.companyId,
      createdBy: req.user!.id,
    });
    res.status(201).json({ data: template } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'CREATE_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.post('/companies/:companyId/recurring-templates/:templateId/execute', async (req, res) => {
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
});

export default router;
