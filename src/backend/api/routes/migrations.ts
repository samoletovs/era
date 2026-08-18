import { Router } from 'express';
import { generateShortName } from '../../services/company.js';
import { containers } from '../../services/cosmos.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse, Company } from '@shared/types';

const router = Router();

// ─── Migration: Generate short names ────────────────────────

router.post('/migrate/short-names', async (req, res) => {
  try {
    let updated = 0;

    // Update companies
    const { resources: companies } = await containers
      .companies()
      .items.query<Company>({
        query: 'SELECT * FROM c', // eslint-disable-line era/no-cross-partition-query
        parameters: [],
      })
      .fetchAll();

    for (const company of companies) {
      if (!company.shortName) {
        const shortName = generateShortName(company.name);
        await containers
          .companies()
          .item(company.id, company.id)
          .patch([{ op: 'add', path: '/shortName', value: shortName }]);
        updated++;
      }
    }

    // Update contacts per company
    for (const company of companies) {
      const { resources: contacts } = await containers
        .contacts()
        .items.query({
          query: 'SELECT * FROM c WHERE c.companyId = @cid',
          parameters: [{ name: '@cid', value: company.id }],
        })
        .fetchAll();

      for (const contact of contacts) {
        if (!contact.shortName && contact.name) {
          const shortName = generateShortName(contact.name);
          await containers
            .contacts()
            .item(contact.id, contact.companyId)
            .patch([{ op: 'add', path: '/shortName', value: shortName }]);
          updated++;
        }
      }
    }

    res.json({ data: { updated } } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'MIGRATION_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
