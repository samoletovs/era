import { Router } from 'express';
import {
  generateVatReturn,
  getBalanceSheet,
  getProfitAndLoss,
  generateVatDeclaration,
  generateAnnualReport,
  getAgingReport,
} from '../../services/reporting.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse } from '@shared/types';

const router = Router();

// ─── Reporting ──────────────────────────────────────────────

router.get('/companies/:companyId/reports/balance-sheet', async (req, res) => {
  try {
    const report = await getBalanceSheet(req.params.companyId);
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'REPORT_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.get('/companies/:companyId/reports/profit-loss', async (req, res) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const report = await getProfitAndLoss(req.params.companyId, from, to);
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'REPORT_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.post('/companies/:companyId/vat-returns', async (req, res) => {
  try {
    const { year, month } = req.body;
    const vatReturn = await generateVatReturn(req.params.companyId, year, month, req.user!.id);
    res.status(201).json({ data: vatReturn } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'VAT_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

// ─── VAT Declaration Export ─────────────────────────────────

router.get('/companies/:companyId/reports/vat-declaration', async (req, res) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const declaration = await generateVatDeclaration(req.params.companyId, year, month);
    res.json({ data: declaration } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'VAT_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Annual Financial Statements ────────────────────────────

router.get('/companies/:companyId/reports/annual', async (req, res) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear() - 1;
    const report = await generateAnnualReport(req.params.companyId, year);
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'REPORT_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

// ─── AR/AP Aging ────────────────────────────────────────────

router.get('/companies/:companyId/reports/ar-aging', async (req, res) => {
  try {
    const report = await getAgingReport(req.params.companyId, 'ar');
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'REPORT_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.get('/companies/:companyId/reports/ap-aging', async (req, res) => {
  try {
    const report = await getAgingReport(req.params.companyId, 'ap');
    res.json({ data: report } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'REPORT_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
