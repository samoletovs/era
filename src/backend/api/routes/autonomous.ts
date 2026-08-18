import { Router } from 'express';
import {
  runMonthEnd,
  runYearEnd,
  checkCompanyHealth,
  listCloseRuns,
  getCloseRun,
} from '../../services/autonomous-tasks.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse } from '@shared/types';

const router = Router();

// ─── Autonomous Task Endpoints ──────────────────────────────

router.post('/companies/:companyId/run-month-end', async (req, res) => {
  try {
    const period =
      req.body.period ||
      (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().slice(0, 7);
      })();
    const result = await runMonthEnd(req.params.companyId, period, req.user!.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'MONTH_END_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.post('/companies/:companyId/run-year-end', async (req, res) => {
  try {
    const fiscalYear = req.body.fiscalYear || new Date().getFullYear() - 1;
    const result = await runYearEnd(req.params.companyId, fiscalYear, req.user!.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'YEAR_END_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.get('/companies/:companyId/health', async (req, res) => {
  try {
    const health = await checkCompanyHealth(req.params.companyId);
    res.json({ data: health } as ApiResponse);
  } catch {
    res.status(500).json({
      error: { code: 'HEALTH_CHECK_FAILED', message: 'Health check failed' },
    });
  }
});

router.get('/companies/:companyId/close-runs', async (req, res) => {
  try {
    const runs = await listCloseRuns(req.params.companyId);
    res.json({ data: runs } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'SYS-001');
      res.status(e.status).json(e.body);
    }
  }
});

router.get('/companies/:companyId/close-runs/:runId', async (req, res) => {
  try {
    const run = await getCloseRun(req.params.companyId, req.params.runId);
    if (!run)
      return res.status(404).json({ error: { code: 'SYS-002', message: 'Close run not found' } });
    res.json({ data: run } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'SYS-001');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
