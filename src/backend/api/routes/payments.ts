import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { CreatePaymentSchema } from '../schemas.js';
import { createAndPostPayment, listPayments } from '../../services/payment.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse } from '@shared/types';
import { handleGLError } from './common.js';

const router = Router();

// ─── Finance: Payments ──────────────────────────────────────

router.post('/companies/:companyId/payments', validate(CreatePaymentSchema), async (req, res) => {
  try {
    const payment = await createAndPostPayment({
      companyId: req.params.companyId,
      ...req.body,
      createdBy: req.user!.id,
    });
    res.status(201).json({
      data: payment,
      meta: {
        operation: {
          operation: 'create',
          entityType: 'payment',
          entityId: payment.id,
          status: 'success',
          message: `Payment ${payment.paymentNumber} recorded`,
          relatedEntities: (req.body.invoiceAllocations || []).map((a: any) => ({
            type: 'invoice',
            id: a.invoiceId,
          })),
          suggestedActions: ['view-journal-entry', 'reconcile-bank'],
        },
      },
    } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.get('/companies/:companyId/payments', async (req, res) => {
  try {
    const type = req.query.type as 'incoming' | 'outgoing' | undefined;
    const payments = await listPayments(req.params.companyId, type);
    res.json({ data: payments } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
