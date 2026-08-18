import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { SubmitVidSchema } from '../schemas.js';
import { generateVatDeclaration, generateAnnualReport } from '../../services/reporting.js';
import {
  MockVidClient,
  NoOpVidClient,
  retrySubmission,
  submitVidDeclaration,
  vatDeclarationToVidXml,
  type VidClient,
} from '../../services/vid/submit.js';
import { containers } from '../../services/cosmos.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse, VidSubmission } from '@shared/types';

const router = Router();

// ─── VID submissions ────────────────────────────────────────
//
// Provider selection via `process.env.VID_PROVIDER`:
//   • unset  → NoOpVidClient (NOT_CONFIGURED on every call)
//   • "mock" → MockVidClient (always accepts)
//   • other  → falls through to NoOp until live EDS client lands

function selectVidClient(): VidClient {
  const provider = (process.env.VID_PROVIDER ?? '').toLowerCase();
  if (provider === 'mock') return new MockVidClient();
  return new NoOpVidClient();
}

router.post(
  '/companies/:companyId/vid/submissions',
  validate(SubmitVidSchema),
  async (req, res) => {
    try {
      const { companyId } = req.params as { companyId: string };
      const { kind, year, month } = req.body as {
        kind: 'pvn-declaration' | 'annual-report';
        year: number;
        month?: number;
      };
      let payload: string;
      let period: string;
      if (kind === 'pvn-declaration') {
        if (!month) {
          res.status(400).json({
            error: { code: 'VID_MONTH_REQUIRED', message: 'month is required for pvn-declaration' },
          });
          return;
        }
        const declaration = await generateVatDeclaration(companyId, year, month);
        payload = vatDeclarationToVidXml(declaration);
        period = declaration.period;
      } else {
        // annual-report path defers to a future formatter; for now we
        // ship the JSON serialisation of the AnnualReport as a
        // placeholder payload — keeps the orchestration testable.
        const report = await generateAnnualReport(companyId, year);
        payload = JSON.stringify(report, null, 2);
        period = `${year}`;
      }
      const client = selectVidClient();
      const submission = await submitVidDeclaration(
        {
          companyId,
          kind,
          period,
          sourcePeriod: { year, month },
          payload,
          contentType: kind === 'pvn-declaration' ? 'application/xml' : 'application/json',
          createdBy: req.user!.id,
        },
        {
          client,
          persistSubmission: async (s) => {
            await containers.documents().items.upsert(s);
          },
        },
      );
      res.status(201).json({ data: submission } as ApiResponse);
    } catch (err) {
      const e = safeError(err, 'VID_SUBMIT_FAILED');
      res.status(e.status).json(e.body);
    }
  },
);

router.post('/companies/:companyId/vid/submissions/:id/retry', async (req, res) => {
  try {
    const { companyId, id } = req.params;
    const { resource: existing } = await containers
      .documents()
      .item(id, companyId)
      .read<VidSubmission>();
    if (!existing) {
      res.status(404).json({ error: { code: 'VID_NOT_FOUND', message: 'Submission not found' } });
      return;
    }
    const client = selectVidClient();
    const retried = await retrySubmission(existing, {
      client,
      persistSubmission: async (s) => {
        await containers.documents().items.upsert(s);
      },
    });
    res.json({ data: retried } as ApiResponse);
  } catch (err) {
    const e = safeError(err, 'VID_RETRY_FAILED');
    res.status(e.status).json(e.body);
  }
});

router.get('/companies/:companyId/vid/submissions', async (req, res) => {
  try {
    const { companyId } = req.params;
    const status = (req.query.status as string) || undefined;
    const period = (req.query.period as string) || undefined;
    const params: { name: string; value: string }[] = [{ name: '@cid', value: companyId }];
    let query = "SELECT * FROM c WHERE c.companyId = @cid AND c.docType = 'vid-submission'";
    if (status) {
      query += ' AND c.status = @status';
      params.push({ name: '@status', value: status });
    }
    if (period) {
      query += ' AND c.period = @period';
      params.push({ name: '@period', value: period });
    }
    query += ' ORDER BY c.createdAt DESC OFFSET 0 LIMIT 100';
    const { resources } = await containers
      .documents()
      .items.query<VidSubmission>({ query, parameters: params })
      .fetchAll();
    res.json({ data: resources } as ApiResponse);
  } catch (err) {
    const e = safeError(err, 'VID_LIST_FAILED');
    res.status(e.status).json(e.body);
  }
});

export default router;
