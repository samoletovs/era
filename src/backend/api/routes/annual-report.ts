import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { LockAnnualReportSchema } from '../schemas.js';
import { generateAnnualReport } from '../../services/reporting.js';
import {
  formatAnnualReport,
  lockAnnualReport,
  LockError,
  renderAnnualReportPdf,
  unlockAnnualReport,
} from '../../services/annual-report-pdf.js';
import { containers } from '../../services/cosmos.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse, AnnualReportApproval } from '@shared/types';

const router = Router();

// ─── Annual report sign-off ─────────────────────────────────

async function loadAnnualReportApproval(
  companyId: string,
  fiscalYear: number,
): Promise<AnnualReportApproval | null> {
  const { resources } = await containers
    .documents()
    .items.query<AnnualReportApproval>({
      query:
        "SELECT * FROM c WHERE c.companyId = @cid AND c.docType = 'annual-report-approval' AND c.fiscalYear = @fy",
      parameters: [
        { name: '@cid', value: companyId },
        { name: '@fy', value: fiscalYear },
      ],
    })
    .fetchAll();
  return resources[0] ?? null;
}

router.get('/companies/:companyId/reports/annual/:year/pdf', async (req, res) => {
  try {
    const { companyId, year } = req.params as { companyId: string; year: string };
    const fiscalYear = parseInt(year, 10);
    if (!Number.isFinite(fiscalYear)) {
      res.status(400).json({ error: { code: 'ANNUAL_BAD_YEAR', message: 'Invalid fiscal year' } });
      return;
    }
    const report = await generateAnnualReport(companyId, fiscalYear);
    const approval = await loadAnnualReportApproval(companyId, fiscalYear);
    const formatted = formatAnnualReport(report, { locale: 'lv', approval });
    const pdf = await renderAnnualReportPdf(formatted);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="annual-report-${fiscalYear}.pdf"`);
    res.send(pdf);
  } catch (err) {
    const e = safeError(err, 'ANNUAL_PDF_FAILED');
    res.status(e.status).json(e.body);
  }
});

router.get('/companies/:companyId/reports/annual/:year/approval', async (req, res) => {
  try {
    const { companyId, year } = req.params as { companyId: string; year: string };
    const fiscalYear = parseInt(year, 10);
    const approval = await loadAnnualReportApproval(companyId, fiscalYear);
    res.json({ data: approval } as ApiResponse);
  } catch (err) {
    const e = safeError(err, 'ANNUAL_APPROVAL_LOAD_FAILED');
    res.status(e.status).json(e.body);
  }
});

router.post(
  '/companies/:companyId/reports/annual/:year/lock',
  validate(LockAnnualReportSchema),
  async (req, res) => {
    try {
      const { companyId, year } = req.params as { companyId: string; year: string };
      const fiscalYear = parseInt(year, 10);
      if (!Number.isFinite(fiscalYear)) {
        res
          .status(400)
          .json({ error: { code: 'ANNUAL_BAD_YEAR', message: 'Invalid fiscal year' } });
        return;
      }
      const report = await generateAnnualReport(companyId, fiscalYear);
      const existing = await loadAnnualReportApproval(companyId, fiscalYear);
      const now = new Date().toISOString();
      const seed: AnnualReportApproval = existing ?? {
        id: `ar-${companyId}-${fiscalYear}`,
        companyId,
        docType: 'annual-report-approval',
        fiscalYear,
        status: 'unlocked',
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdBy: req.user!.id,
      };
      const locked = lockAnnualReport({
        approval: seed,
        report,
        signatoryName: req.body.signatoryName,
        signatoryRole: req.body.signatoryRole,
        signatoryRegistrationNumber: req.body.signatoryRegistrationNumber,
        signedAt: now,
      });
      await containers.documents().items.upsert(locked);
      res.status(201).json({ data: locked } as ApiResponse);
    } catch (err) {
      if (err instanceof LockError) {
        res.status(409).json({ error: { code: `ANNUAL_${err.code}`, message: err.message } });
        return;
      }
      const e = safeError(err, 'ANNUAL_LOCK_FAILED');
      res.status(e.status).json(e.body);
    }
  },
);

router.post('/companies/:companyId/reports/annual/:year/unlock', async (req, res) => {
  try {
    const { companyId, year } = req.params as { companyId: string; year: string };
    const fiscalYear = parseInt(year, 10);
    const existing = await loadAnnualReportApproval(companyId, fiscalYear);
    if (!existing) {
      res.status(404).json({ error: { code: 'ANNUAL_NOT_FOUND', message: 'Approval not found' } });
      return;
    }
    const now = new Date().toISOString();
    const unlocked = unlockAnnualReport(existing, now);
    await containers.documents().items.upsert(unlocked);
    res.json({ data: unlocked } as ApiResponse);
  } catch (err) {
    if (err instanceof LockError) {
      res.status(409).json({ error: { code: `ANNUAL_${err.code}`, message: err.message } });
      return;
    }
    const e = safeError(err, 'ANNUAL_UNLOCK_FAILED');
    res.status(e.status).json(e.body);
  }
});

export default router;
