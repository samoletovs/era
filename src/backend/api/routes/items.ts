import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { CreateItemSchema } from '../schemas.js';
import { createItem } from '../../services/inventory.js';
import { parseItemDescription } from '../../services/agent.js';
import { containers } from '../../services/cosmos.js';
import {
  parsePagination,
  paginationClause,
  paginatedResponse,
} from '../../middleware/pagination.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse } from '@shared/types';

const router = Router();

// Items
router.get('/companies/:companyId/items', async (req, res) => {
  try {
    const pg = parsePagination(req);
    const { resources } = await containers
      .inventory()
      .items.query({
        query: `SELECT * FROM c WHERE c.companyId = @companyId AND (c.docType = 'item' OR IS_DEFINED(c.sellingPrice)) ORDER BY c.name ${paginationClause(pg)}`,
        parameters: [{ name: '@companyId', value: req.params.companyId }],
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

// Item transactions (GL entries that reference this item)
router.get('/companies/:companyId/items/:itemCode/transactions', async (req, res) => {
  try {
    const { companyId, itemCode } = req.params;
    const { resources: entries } = await containers
      .ledger()
      .items.query<any>({
        query:
          "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) AND c.status = 'posted' ORDER BY c.date DESC",
        parameters: [{ name: '@cid', value: companyId }],
      })
      .fetchAll();

    // Filter to entries that have lines referencing this item
    const result: any[] = [];
    for (const entry of entries) {
      const matchingLines = (entry.lines || []).filter(
        (l: any) => l.itemCode === itemCode || l.itemId === itemCode,
      );
      if (matchingLines.length > 0) {
        result.push({ ...entry, lines: matchingLines });
      }
    }
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Inventory ──────────────────────────────────────────────

router.post('/companies/:companyId/items', validate(CreateItemSchema), async (req, res) => {
  try {
    const item = await createItem({
      companyId: req.params.companyId,
      ...req.body,
      createdBy: req.user!.id,
    });
    res.status(201).json({ data: item } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'CREATE_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.post('/companies/:companyId/items/parse-description', async (req, res) => {
  try {
    const description = req.body.description as string;
    if (!description?.trim()) {
      res.status(400).json({
        error: { code: 'VAL-001', message: 'Description is required' },
      });
      return;
    }
    const fields = await parseItemDescription(description.trim());
    res.json({ data: fields } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'PARSE_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
