import { Router } from 'express';
import { checkViesVat, checkVidStatus } from '../../services/company-lookup.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse } from '@shared/types';

const router = Router();

// ─── EU VIES VAT Validation ─────────────────────────────────

router.get('/vies/check', async (req, res) => {
  try {
    const vatNumber = typeof req.query.vatNumber === 'string' ? req.query.vatNumber : '';
    if (!vatNumber || vatNumber.length < 4) {
      res.json({
        data: { valid: false, source: 'VAT number too short' },
      } as ApiResponse);
      return;
    }
    const result = await checkViesVat(vatNumber);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'VIES_CHECK_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

// ─── VID Status Check (VAT payer + Suspended) ───────────────

router.get('/vid/status', async (req, res) => {
  try {
    const regNumber = (req.query.regNumber as string) || '';
    if (!regNumber || regNumber.replace(/\s/g, '').length < 9) {
      res.json({
        data: {
          vatPayer: {
            isRegistered: false,
            checkedAt: new Date().toISOString(),
          },
          suspended: {
            isSuspended: false,
            checkedAt: new Date().toISOString(),
          },
        },
      } as ApiResponse);
      return;
    }
    const result = await checkVidStatus(regNumber.replace(/\s/g, ''));
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'VID_CHECK_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
