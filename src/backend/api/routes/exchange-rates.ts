import { Router } from 'express';
import {
  saveExchangeRate,
  getExchangeRate,
  listExchangeRates,
  importSystemRates,
  runForeignCurrencyRevaluation,
} from '../../services/currency-revaluation.js';
import {
  normalizeCurrencyCode,
  parseOptionalExchangeRateListLimit,
  parseOptionalExchangeRateType,
} from '../../services/exchange-rate-utils.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse } from '@shared/types';
import { handleGLError } from './common.js';

const router = Router();

// ─── Exchange Rates & Currency Revaluation ──────────────────

router.get('/exchange-rates/list', async (req, res) => {
  try {
    const { source, rateType, fromDate, toDate, baseCurrency, limit, companyId } = req.query;
    const parsedRateType = parseOptionalExchangeRateType(rateType);
    if (parsedRateType === null) {
      res.status(400).json({
        error: {
          code: 'VAL-001',
          message: 'rateType must be one of: daily, budget',
        },
      });
      return;
    }
    const parsedLimit = parseOptionalExchangeRateListLimit(limit);
    if (parsedLimit === null) {
      res.status(400).json({
        error: {
          code: 'VAL-001',
          message: 'limit must be an integer between 1 and 500',
        },
      });
      return;
    }

    const normalizedBaseCurrency =
      baseCurrency === undefined ? undefined : normalizeCurrencyCode(baseCurrency as string);
    if (baseCurrency !== undefined && normalizedBaseCurrency === null) {
      res.status(400).json({
        error: {
          code: 'VAL-001',
          message: 'baseCurrency must be a 3-letter ISO code',
        },
      });
      return;
    }

    const rates = await listExchangeRates({
      source: source as string | undefined,
      rateType: parsedRateType,
      fromDate: fromDate as string | undefined,
      toDate: toDate as string | undefined,
      baseCurrency: normalizedBaseCurrency ?? undefined,
      limit: parsedLimit,
      companyId: companyId as string | undefined,
    });
    res.json({ data: rates } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.get('/exchange-rates', async (req, res) => {
  try {
    const { from, to, rateType, date, companyId } = req.query;
    if (!from || !to) {
      res.status(400).json({
        error: {
          code: 'VAL-001',
          message: 'from and to currency codes are required',
        },
      });
      return;
    }

    const normalizedFrom = normalizeCurrencyCode(from as string);
    const normalizedTo = normalizeCurrencyCode(to as string);
    if (!normalizedFrom || !normalizedTo) {
      res.status(400).json({
        error: {
          code: 'VAL-001',
          message: 'from and to must be 3-letter ISO currency codes',
        },
      });
      return;
    }
    const parsedRateType = parseOptionalExchangeRateType(rateType);
    if (parsedRateType === null) {
      res.status(400).json({
        error: {
          code: 'VAL-001',
          message: 'rateType must be one of: daily, budget',
        },
      });
      return;
    }

    const rate = await getExchangeRate(
      normalizedFrom,
      normalizedTo,
      parsedRateType || 'daily',
      (date as string) || new Date().toISOString().slice(0, 10),
      companyId as string | undefined,
    );
    res.json({
      data: {
        from: normalizedFrom,
        to: normalizedTo,
        rateType: parsedRateType || 'daily',
        rate,
      },
    } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post('/exchange-rates', async (req, res) => {
  try {
    const { fromCurrency, toCurrency, rateType, rate, effectiveDate, source, companyId } = req.body;
    if (!fromCurrency || !toCurrency || !rate || !effectiveDate) {
      res.status(400).json({
        error: {
          code: 'VAL-001',
          message: 'fromCurrency, toCurrency, rate, and effectiveDate are required',
        },
      });
      return;
    }

    const normalizedFrom = normalizeCurrencyCode(fromCurrency);
    const normalizedTo = normalizeCurrencyCode(toCurrency);
    if (!normalizedFrom || !normalizedTo) {
      res.status(400).json({
        error: {
          code: 'VAL-001',
          message: 'fromCurrency and toCurrency must be 3-letter ISO codes',
        },
      });
      return;
    }
    const parsedRateType = parseOptionalExchangeRateType(rateType);
    if (parsedRateType === null) {
      res.status(400).json({
        error: {
          code: 'VAL-001',
          message: 'rateType must be one of: daily, budget',
        },
      });
      return;
    }
    const parsedRate = Number(rate);
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      res.status(400).json({
        error: {
          code: 'VAL-001',
          message: 'rate must be a positive number',
        },
      });
      return;
    }

    const saved = await saveExchangeRate({
      fromCurrency: normalizedFrom,
      toCurrency: normalizedTo,
      rateType: parsedRateType || 'daily',
      rate: parsedRate,
      effectiveDate,
      source: source || 'manual',
      companyId,
    });
    res.status(201).json({ data: saved } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'SYS-001');
      res.status(e.status).json(e.body);
    }
  }
});

router.post('/exchange-rates/import-ecb', async (req, res) => {
  try {
    const date = req.body.date || new Date().toISOString().slice(0, 10);
    const result = await importSystemRates('ecb', date);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post('/exchange-rates/import-system', async (req, res) => {
  try {
    const { source, date } = req.body;
    if (!source || source !== 'ecb') {
      res.status(400).json({
        error: {
          code: 'VAL-001',
          message: "source must be 'ecb'",
        },
      });
      return;
    }
    const effectiveDate = date || new Date().toISOString().slice(0, 10);
    const result = await importSystemRates(source, effectiveDate);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post('/companies/:companyId/currency-revaluation', async (req, res) => {
  try {
    const { period } = req.body;
    if (!period) {
      res.status(400).json({
        error: { code: 'VAL-001', message: 'period is required (YYYY-MM)' },
      });
      return;
    }
    const result = await runForeignCurrencyRevaluation(req.params.companyId, period, req.user!.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

export default router;
