import { Router } from 'express';
import {
  closePeriod,
  reopenPeriod,
  yearEndClose,
  getPeriodStatus,
} from '../../services/period-close.js';
import type { ApiResponse } from '@shared/types';
import { handleGLError } from './common.js';

const router = Router();

// ─── Period Close & Year-End ────────────────────────────────

router.post('/companies/:companyId/periods/:period/close', async (req, res) => {
  try {
    const result = await closePeriod(req.params.companyId, req.params.period, req.user!.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post('/companies/:companyId/periods/:period/reopen', async (req, res) => {
  try {
    const result = await reopenPeriod(req.params.companyId, req.params.period, req.user!.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.get('/companies/:companyId/periods/:period', async (req, res) => {
  const result = await getPeriodStatus(req.params.companyId, req.params.period);
  res.json({
    data: result || { period: req.params.period, status: 'open' },
  } as ApiResponse);
});

router.post('/companies/:companyId/year-end-close', async (req, res) => {
  try {
    const { fiscalYear } = req.body;
    if (!fiscalYear) {
      res.status(400).json({
        error: { code: 'MISSING_YEAR', message: 'fiscalYear is required' },
      });
      return;
    }
    const result = await yearEndClose(req.params.companyId, fiscalYear, req.user!.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

export default router;
