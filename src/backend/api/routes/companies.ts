import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { CreateCompanySchema, UpdateCompanySchema } from '../schemas.js';
import {
  createCompany,
  getCompany,
  updateCompany,
  deleteCompany,
  getCompanyStats,
  generateShortName,
} from '../../services/company.js';
import { containers } from '../../services/cosmos.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse, Company, UserProfile } from '@shared/types';

const router = Router();

// ─── Companies ──────────────────────────────────────────────

router.get('/companies', async (req, res) => {
  try {
    // Cross-partition query is acceptable here — companies container is small and rarely queried
    const { resources } = await containers
      .companies()
      .items.query<Company>({
        query: 'SELECT * FROM c ORDER BY c.name', // eslint-disable-line era/no-cross-partition-query
        parameters: [],
      })
      .fetchAll();
    // Default to nothing, not everything. This used to start as `resources` (all
    // companies) and narrow only when the user's profile listed some, so a caller
    // with no profile - which is every newly authenticated stranger - was shown
    // every company in the system. The catch below made it worse: a failed profile
    // read left the full list in place.
    //
    // Failing closed costs a legitimate first-time user an empty screen. Failing
    // open costs every tenant their company list.
    let visibleCompanies: Company[] = [];
    try {
      const { resource: userProfile } = await containers
        .users()
        .item(req.user!.id, req.user!.id)
        .read<UserProfile>();
      const companyIds = userProfile?.companies?.map((c) => c.companyId) ?? [];
      if (companyIds.length > 0) {
        const allowed = new Set(companyIds);
        visibleCompanies = resources.filter((c) => allowed.has(c.id));
      }
    } catch (err) {
      // A profile that cannot be read is not a profile that grants access.
      console.error('companies: profile read failed, returning no companies', err);
    }

    // Backfill shortName for companies created before the field existed
    for (const c of visibleCompanies) {
      if (!c.shortName && c.name) {
        c.shortName = generateShortName(c.name);
        containers
          .companies()
          .item(c.id, c.id)
          .replace(c)
          .catch((err) => {
            console.error(
              'Failed to backfill shortName:',
              c.id,
              err instanceof Error ? err.message : String(err),
            );
          });
      }
    }
    res.json({ data: visibleCompanies } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

// Company
router.post('/companies', validate(CreateCompanySchema), async (req, res) => {
  try {
    const company = await createCompany({
      ...req.body,
      createdBy: req.user!.id,
      createdByEmail: req.user!.email,
      createdByName: req.user!.name,
      createdByProvider: req.user!.provider,
    });
    const response: ApiResponse = { data: company };
    res.status(201).json(response);
  } catch (err) {
    {
      const e = safeError(err, 'CREATE_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.get('/companies/:id', async (req, res) => {
  const company = await getCompany(req.params.id);
  if (!company) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Company not found' } });
    return;
  }
  const response: ApiResponse = { data: company };
  res.json(response);
});

router.patch('/companies/:id', validate(UpdateCompanySchema), async (req, res) => {
  try {
    const company = await updateCompany(req.params.id as string, req.body);
    if (!company) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Company not found' } });
      return;
    }
    res.json({ data: company } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'UPDATE_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.get('/companies/:id/stats', async (req, res) => {
  try {
    const stats = await getCompanyStats(req.params.id);
    res.json({ data: stats } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'SYS-001');
      res.status(e.status).json(e.body);
    }
  }
});

router.delete('/companies/:id', async (req, res) => {
  try {
    const result = await deleteCompany(req.params.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === 'Company not found' ? 404 : 500;
    res.status(status).json({
      error: {
        code: status === 404 ? 'NOT_FOUND' : 'DELETE_FAILED',
        message,
      },
    });
  }
});

export default router;
