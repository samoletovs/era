import { Router } from 'express';
import { parseAssetDescription } from '../../services/agent.js';
import {
  acquireAsset,
  runDepreciation,
  disposeAsset,
  listFixedAssets,
  getDepreciationSchedule,
} from '../../services/fixed-assets.js';
import {
  formatAssetRegister,
  renderAssetRegisterPdf,
} from '../../services/fixed-asset-register-pdf.js';
import { containers } from '../../services/cosmos.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse } from '@shared/types';
import { handleGLError } from './common.js';

const router = Router();

router.post('/companies/:companyId/fixed-assets/parse-description', async (req, res) => {
  try {
    const description = req.body.description as string;
    if (!description?.trim()) {
      res.status(400).json({
        error: { code: 'VAL-001', message: 'Description is required' },
      });
      return;
    }
    const fields = await parseAssetDescription(description.trim());
    res.json({ data: fields } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'PARSE_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Fixed Assets ───────────────────────────────────────────

router.get('/companies/:companyId/fixed-assets', async (req, res) => {
  try {
    const assets = await listFixedAssets(req.params.companyId);
    res.json({ data: assets } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.post('/companies/:companyId/fixed-assets', async (req, res) => {
  try {
    const asset = await acquireAsset({
      ...req.body,
      companyId: req.params.companyId,
      createdBy: req.user!.id,
    });
    res.status(201).json({ data: asset } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post('/companies/:companyId/fixed-assets/depreciate', async (req, res) => {
  try {
    const period = req.body.period || new Date().toISOString().slice(0, 7);
    const result = await runDepreciation(req.params.companyId, period, req.user!.id);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post('/companies/:companyId/fixed-assets/:assetId/dispose', async (req, res) => {
  try {
    const asset = await disposeAsset(
      req.params.companyId,
      req.params.assetId,
      req.body.disposalDate || new Date().toISOString().slice(0, 10),
      req.body.disposalAmount || 0,
      req.user!.id,
      {
        proceedsAccountCode: req.body.proceedsAccountCode,
        proceedsAccountName: req.body.proceedsAccountName,
        gainAccountCode: req.body.gainAccountCode,
        lossAccountCode: req.body.lossAccountCode,
      },
    );
    res.json({ data: asset } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.get('/companies/:companyId/fixed-assets/:assetId/schedule', async (req, res) => {
  try {
    const { companyId, assetId } = req.params;
    const { resource: asset } = await containers.inventory().item(assetId, companyId).read<any>();
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    const schedule = getDepreciationSchedule(asset);
    res.json({ data: { asset, schedule } } as ApiResponse);
  } catch (err) {
    const e = safeError(err, 'QUERY_FAILED');
    res.status(e.status).json(e.body);
  }
});

router.get('/companies/:companyId/fixed-assets/register/pdf', async (req, res) => {
  try {
    const { companyId } = req.params;
    const asOf = (req.query.asOf as string) || new Date().toISOString().slice(0, 10);
    const locale = req.query.locale === 'lv' ? 'lv' : 'en';
    const assets = await listFixedAssets(companyId);
    const { resource: company } = await containers
      .companies()
      .item(companyId, companyId)
      .read<any>();
    const formatted = formatAssetRegister(assets, {
      companyName: company?.name ?? companyId,
      asOfDate: asOf,
      locale,
    });
    const pdf = await renderAssetRegisterPdf(formatted);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="asset-register-${asOf}.pdf"`);
    res.send(pdf);
  } catch (err) {
    const e = safeError(err, 'QUERY_FAILED');
    res.status(e.status).json(e.body);
  }
});

router.get('/companies/:companyId/fixed-assets/:assetId/transactions', async (req, res) => {
  try {
    const { companyId, assetId } = req.params;
    // First get the asset to know its account codes
    const { resource: asset } = await containers.inventory().item(assetId, companyId).read<any>();
    const accountCodes = asset
      ? [asset.assetAccountCode, asset.depreciationAccountCode, asset.expenseAccountCode].filter(
          Boolean,
        )
      : [];

    // Find entries linked by sourceId OR containing lines with this asset's account codes
    const { resources: entries } = await containers
      .ledger()
      .items.query<any>({
        query: `SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) AND (c.sourceId = @sid OR ARRAY_CONTAINS(@codes, c.lines[0].accountCode) OR ARRAY_CONTAINS(@codes, c.lines[1].accountCode)) ORDER BY c.date DESC`,
        parameters: [
          { name: '@cid', value: companyId },
          { name: '@sid', value: assetId },
          { name: '@codes', value: accountCodes },
        ],
      })
      .fetchAll();

    // Filter to only entries that actually reference this asset's accounts in their lines
    const filtered = entries.filter((e: any) => {
      if (e.sourceId === assetId) return true;
      if (!e.lines) return false;
      return e.lines.some(
        (l: any) =>
          accountCodes.includes(l.accountCode) &&
          (l.accountName?.includes(asset?.name) || l.description?.includes(asset?.name)),
      );
    });

    res.json({ data: filtered } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
