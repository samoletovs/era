import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { SubmitFeedbackSchema } from '../schemas.js';
import { containers } from '../../services/cosmos.js';
import {
  parsePagination,
  paginationClause,
  paginatedResponse,
} from '../../middleware/pagination.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse, Feedback } from '@shared/types';

const router = Router();

// ─── Feedback / Dev Tasks ───────────────────────────────────

router.post('/feedback', validate(SubmitFeedbackSchema), async (req, res) => {
  try {
    const { page, message, companyId } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Message is required' },
      });
      return;
    }
    const now = new Date().toISOString();
    const item: Feedback = {
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      page: String(page || 'unknown'),
      message: message.trim().slice(0, 2000),
      status: 'open',
      submittedBy: req.user!.id,
      submittedAt: now,
      companyId: companyId || undefined,
    };
    await containers.feedback().items.create(item);
    res.status(201).json({ data: item } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'CREATE_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.get('/feedback', async (req, res) => {
  try {
    const pg = parsePagination(req);
    const statusFilter = req.query.status ? ' WHERE c.status = @status' : '';
    const params = req.query.status ? [{ name: '@status', value: req.query.status as string }] : [];
    const { resources } = await containers
      .feedback()
      .items.query<Feedback>({
        query: `SELECT * FROM c${statusFilter} ORDER BY c.submittedAt DESC ${paginationClause(pg)}`, // eslint-disable-line era/no-cross-partition-query
        parameters: params,
      })
      .fetchAll();
    res.json(paginatedResponse(resources, pg));
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.patch('/feedback/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['open', 'in-progress', 'done', 'dismissed'];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid status' } });
      return;
    }
    const { resource } = await containers
      .feedback()
      .item(req.params.id, req.params.id)
      .read<Feedback>();
    if (!resource) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Feedback not found' } });
      return;
    }
    const updated = {
      ...resource,
      status,
      resolvedAt:
        status === 'done' || status === 'dismissed'
          ? new Date().toISOString()
          : resource.resolvedAt,
    };
    await containers.feedback().item(req.params.id, req.params.id).replace(updated);
    res.json({ data: updated } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'UPDATE_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
