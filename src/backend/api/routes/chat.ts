import { Router } from 'express';
import { handleChat } from '../../services/agent.js';
import { containers } from '../../services/cosmos.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse } from '@shared/types';

const router = Router();

// Chat (Agent interaction)
router.get('/companies/:companyId/chat', async (req, res) => {
  try {
    const { resources } = await containers
      .chat()
      .items.query({
        query:
          'SELECT * FROM c WHERE c.companyId = @companyId ORDER BY c.timestamp DESC OFFSET 0 LIMIT 50',
        parameters: [{ name: '@companyId', value: req.params.companyId }],
      })
      .fetchAll();
    const response: ApiResponse = { data: resources.reverse() };
    res.json(response);
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Agent Chat ─────────────────────────────────────────────

router.post('/chat', async (req, res) => {
  try {
    const { companyId, message, history } = req.body;
    const userId = req.user!.id;
    const now = new Date().toISOString();

    // Save user message
    if (companyId) {
      await containers.chat().items.create({
        id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        companyId,
        role: 'user' as const,
        content: message,
        timestamp: now,
      });
    }

    const response = await handleChat({
      companyId,
      message,
      history: history || [],
      userId,
    });

    // Save assistant response
    if (companyId) {
      await containers.chat().items.create({
        id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        companyId,
        role: 'assistant' as const,
        content: response,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ data: { response } } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'AGENT_ERROR');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
