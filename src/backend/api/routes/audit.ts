import { Router } from 'express';
import { assembleAuditChain, AuditChainError } from '../../services/audit-trail.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse } from '@shared/types';

const router = Router();

// ─── Audit trail ────────────────────────────────────────────
//
// Phase 2 explainability — given an event id or a journal-entry id,
// return the full provenance chain. Powers the `/audit/:id` page and
// the "🤖 Agent · LV-rules-v1.2" badge tooltip.

router.get('/companies/:companyId/audit/event/:eventId', async (req, res) => {
  try {
    const chain = await assembleAuditChain({
      companyId: req.params.companyId,
      eventId: req.params.eventId,
    });
    res.json({ data: chain } as ApiResponse);
  } catch (err) {
    if (err instanceof AuditChainError) {
      const status = err.code === 'EVENT_NOT_FOUND' ? 404 : 400;
      res.status(status).json({ error: { code: `AUDIT_${err.code}`, message: err.message } });
      return;
    }
    const e = safeError(err, 'AUDIT_FAILED');
    res.status(e.status).json(e.body);
  }
});

router.get('/companies/:companyId/audit/journal-entry/:entryId', async (req, res) => {
  try {
    const chain = await assembleAuditChain({
      companyId: req.params.companyId,
      journalEntryId: req.params.entryId,
    });
    res.json({ data: chain } as ApiResponse);
  } catch (err) {
    if (err instanceof AuditChainError) {
      const status = err.code === 'ENTRY_NOT_FOUND' ? 404 : 400;
      res.status(status).json({ error: { code: `AUDIT_${err.code}`, message: err.message } });
      return;
    }
    const e = safeError(err, 'AUDIT_FAILED');
    res.status(e.status).json(e.body);
  }
});

export default router;
