import { Router } from 'express';
import {
  importBankStatement,
  postUnmatchedLine,
  completeReconciliation,
  listReconciliations,
  getReconciliation,
  getOpenInvoices,
  suggestLedgerAccount,
  matchLineToInvoice,
  addManualTransaction,
} from '../../services/bank-reconciliation.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse } from '@shared/types';
import { handleGLError } from './common.js';

const router = Router();

// ─── Bank Reconciliation ────────────────────────────────────

router.post('/companies/:companyId/bank-reconciliations', async (req, res) => {
  try {
    const result = await importBankStatement({
      ...req.body,
      companyId: req.params.companyId,
      createdBy: req.user!.id,
    });
    res.status(201).json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.get('/companies/:companyId/bank-reconciliations', async (req, res) => {
  try {
    const list = await listReconciliations(req.params.companyId);
    res.json({ data: list } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.get('/companies/:companyId/bank-reconciliations/open-invoices', async (req, res) => {
  try {
    const invoices = await getOpenInvoices(req.params.companyId);
    res.json({ data: invoices } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.get('/companies/:companyId/bank-reconciliations/:reconId', async (req, res) => {
  try {
    const recon = await getReconciliation(req.params.companyId, req.params.reconId);
    res.json({ data: recon } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post('/companies/:companyId/bank-reconciliations/:reconId/post-line', async (req, res) => {
  try {
    await postUnmatchedLine(
      req.params.companyId,
      req.params.reconId,
      req.body.lineId,
      req.body.accountCode,
      req.body.accountName,
      req.user!.id,
    );
    res.json({ data: { success: true } } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post(
  '/companies/:companyId/bank-reconciliations/:reconId/match-invoice',
  async (req, res) => {
    try {
      const result = await matchLineToInvoice({
        companyId: req.params.companyId,
        reconciliationId: req.params.reconId,
        lineId: req.body.lineId,
        invoiceId: req.body.invoiceId,
        invoiceNumber: req.body.invoiceNumber,
        allocatedAmount: req.body.allocatedAmount,
        differenceAccountCode: req.body.differenceAccountCode,
        differenceAccountName: req.body.differenceAccountName,
        createdBy: req.user!.id,
      });
      res.json({ data: result } as ApiResponse);
    } catch (err) {
      handleGLError(err, res);
    }
  },
);

router.post(
  '/companies/:companyId/bank-reconciliations/:reconId/manual-transaction',
  async (req, res) => {
    try {
      const result = await addManualTransaction({
        companyId: req.params.companyId,
        reconciliationId: req.params.reconId,
        date: req.body.date,
        description: req.body.description,
        amount: req.body.amount,
        accountCode: req.body.accountCode,
        accountName: req.body.accountName,
        createdBy: req.user!.id,
      });
      res.json({ data: result } as ApiResponse);
    } catch (err) {
      handleGLError(err, res);
    }
  },
);

router.post(
  '/companies/:companyId/bank-reconciliations/:reconId/suggest-account',
  async (req, res) => {
    try {
      const suggestion = suggestLedgerAccount(req.body.description || '');
      res.json({ data: suggestion } as ApiResponse);
    } catch (err) {
      {
        const e = safeError(err, 'SUGGEST_FAILED');
        res.status(e.status).json(e.body);
      }
    }
  },
);

router.post('/companies/:companyId/bank-reconciliations/:reconId/complete', async (req, res) => {
  try {
    const result = await completeReconciliation(
      req.params.companyId,
      req.params.reconId,
      req.user!.id,
    );
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

export default router;
