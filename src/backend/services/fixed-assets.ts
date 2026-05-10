// Fixed assets — acquisition, depreciation, disposal
// Sprint 4 feature

import { v4 as uuidv4 } from 'uuid';
import { containers } from './cosmos.js';
import { postJournalEntry, GLError } from './ledger.js';
import { emitEvent } from './events.js';
import { getNextNumber } from './sequences.js';
import type { JournalLine } from '@shared/types';

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Types ──────────────────────────────────────────────────

/**
 * Depreciation methods supported by the engine.
 *   - `straight-line`     — equal monthly amount over usefulLifeMonths.
 *   - `declining-balance` — accelerated; each month depreciates a fixed
 *      annual rate of the *current net book value* (rate / 12 monthly).
 *      Stops when NBV reaches `residualValue`.
 *
 * Method is set at acquisition and cannot be changed for posted assets
 * (would invalidate prior journal entries).
 */
export type DepreciationMethod = 'straight-line' | 'declining-balance';

export interface FixedAsset {
  id: string;
  companyId: string;
  docType: 'fixed-asset';
  code: string;
  name: string;
  description?: string;
  assetAccountCode: string; // e.g. "1210" Land and buildings
  depreciationAccountCode: string; // e.g. "1240" Accumulated depreciation
  expenseAccountCode: string; // e.g. "6380" Depreciation expense
  acquisitionDate: string;
  acquisitionCost: number;
  residualValue: number;
  usefulLifeMonths: number;
  depreciationMethod: DepreciationMethod;
  /** Annual rate (0..1) used by `declining-balance` only. Ignored otherwise. */
  decliningBalanceRate?: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  status: 'active' | 'fully-depreciated' | 'disposed';
  disposalDate?: string;
  disposalAmount?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// ─── Pure helpers ───────────────────────────────────────────

/**
 * Compute the depreciation amount for a single period. Pure — no Cosmos.
 * Returns 0 when the asset is already at residual.
 */
export function computeMonthlyDepreciation(
  asset: Pick<
    FixedAsset,
    | 'acquisitionCost'
    | 'residualValue'
    | 'usefulLifeMonths'
    | 'depreciationMethod'
    | 'decliningBalanceRate'
    | 'accumulatedDepreciation'
  >,
): number {
  const depreciableAmount = asset.acquisitionCost - asset.residualValue;
  const remaining = roundCurrency(depreciableAmount - asset.accumulatedDepreciation);
  if (remaining <= 0) return 0;

  if (asset.depreciationMethod === 'declining-balance') {
    const rate = asset.decliningBalanceRate ?? 0;
    if (rate <= 0) return 0;
    const nbv = asset.acquisitionCost - asset.accumulatedDepreciation;
    const month = roundCurrency((nbv * rate) / 12);
    return Math.min(month, remaining);
  }

  // Straight-line (default).
  const monthly = roundCurrency(depreciableAmount / asset.usefulLifeMonths);
  return Math.min(monthly, remaining);
}

export interface ScheduleRow {
  period: string; // YYYY-MM
  monthIndex: number; // 1-based
  depreciation: number;
  accumulatedDepreciation: number;
  netBookValue: number;
}

/**
 * Project the depreciation schedule for an asset month-by-month from
 * `acquisitionDate` until either fully depreciated or `maxMonths` is
 * reached. Pure function, no DB. Used by the API for a depreciation
 * schedule view and by the register PDF.
 */
export function getDepreciationSchedule(
  asset: Pick<
    FixedAsset,
    | 'acquisitionCost'
    | 'residualValue'
    | 'usefulLifeMonths'
    | 'depreciationMethod'
    | 'decliningBalanceRate'
    | 'acquisitionDate'
  >,
  maxMonths = 600,
): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const depreciableAmount = asset.acquisitionCost - asset.residualValue;
  let accumulated = 0;
  // Start with the month *after* acquisition for monthly schedule.
  const startMonth = parseYearMonth(asset.acquisitionDate);
  for (let i = 1; i <= maxMonths; i += 1) {
    const remaining = roundCurrency(depreciableAmount - accumulated);
    if (remaining <= 0) break;
    const dep = computeMonthlyDepreciation({
      acquisitionCost: asset.acquisitionCost,
      residualValue: asset.residualValue,
      usefulLifeMonths: asset.usefulLifeMonths,
      depreciationMethod: asset.depreciationMethod,
      decliningBalanceRate: asset.decliningBalanceRate,
      accumulatedDepreciation: accumulated,
    });
    if (dep <= 0) break;
    accumulated = roundCurrency(accumulated + dep);
    const nbv = roundCurrency(asset.acquisitionCost - accumulated);
    const period = addMonths(startMonth, i);
    rows.push({
      period,
      monthIndex: i,
      depreciation: dep,
      accumulatedDepreciation: accumulated,
      netBookValue: nbv,
    });
  }
  return rows;
}

function parseYearMonth(iso: string): { year: number; month: number } {
  // Accept YYYY-MM or YYYY-MM-DD.
  const [y, m] = iso.split('-').map(Number);
  return { year: y, month: m };
}

function addMonths(start: { year: number; month: number }, months: number): string {
  // 1-based month, returns YYYY-MM.
  const total = start.month + months - 1;
  const year = start.year + Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

// ─── Acquire ────────────────────────────────────────────────

interface AcquireAssetInput {
  companyId: string;
  code: string;
  name: string;
  description?: string;
  assetAccountCode: string;
  depreciationAccountCode: string;
  expenseAccountCode: string;
  acquisitionDate: string;
  acquisitionCost: number;
  residualValue: number;
  usefulLifeMonths: number;
  depreciationMethod?: DepreciationMethod;
  decliningBalanceRate?: number;
  createdBy: string;
}

export async function acquireAsset(input: AcquireAssetInput): Promise<FixedAsset> {
  const code = input.code || (await getNextNumber(input.companyId, 'fixedAsset'));
  const method: DepreciationMethod = input.depreciationMethod ?? 'straight-line';
  if (method === 'declining-balance' && (input.decliningBalanceRate ?? 0) <= 0) {
    throw new GLError(
      'INVALID_INPUT',
      'declining-balance method requires decliningBalanceRate > 0',
    );
  }
  const now = new Date().toISOString();
  const asset: FixedAsset = {
    id: uuidv4(),
    companyId: input.companyId,
    docType: 'fixed-asset' as const,
    code,
    name: input.name,
    description: input.description,
    assetAccountCode: input.assetAccountCode,
    depreciationAccountCode: input.depreciationAccountCode,
    expenseAccountCode: input.expenseAccountCode,
    acquisitionDate: input.acquisitionDate,
    acquisitionCost: input.acquisitionCost,
    residualValue: input.residualValue,
    usefulLifeMonths: input.usefulLifeMonths,
    depreciationMethod: method,
    decliningBalanceRate: input.decliningBalanceRate,
    accumulatedDepreciation: 0,
    netBookValue: input.acquisitionCost,
    status: 'active',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  };

  // Post acquisition journal: DR Asset account, CR Bank/AP
  await postJournalEntry({
    companyId: input.companyId,
    date: input.acquisitionDate,
    description: `Acquire fixed asset: ${input.name}`,
    lines: [
      {
        accountCode: input.assetAccountCode,
        accountName: input.name,
        debit: input.acquisitionCost,
        credit: 0,
        description: `Acquisition - ${input.name}`,
      },
      {
        accountCode: '2420',
        accountName: 'Bank accounts',
        debit: 0,
        credit: input.acquisitionCost,
        description: `Payment for ${input.name}`,
      },
    ],
    sourceType: 'manual',
    sourceId: asset.id,
    createdBy: input.createdBy,
  });

  await containers.inventory().items.create(asset);

  await emitEvent({
    companyId: input.companyId,
    type: 'asset.acquired',
    actor: input.createdBy,
    documentType: 'fixed-asset',
    documentId: asset.id,
    data: { code: asset.code, name: asset.name, cost: asset.acquisitionCost },
  });

  return asset;
}

// ─── Depreciate ─────────────────────────────────────────────

export async function runDepreciation(
  companyId: string,
  period: string,
  createdBy: string,
): Promise<{
  assetsDepreciated: number;
  totalAmount: number;
  journalEntryId?: string;
  isSkipped?: boolean;
}> {
  const { resources: assets } = await containers
    .inventory()
    .items.query<FixedAsset>({
      query:
        "SELECT * FROM c WHERE c.companyId = @cid AND c.docType = 'fixed-asset' AND c.status = 'active'",
      parameters: [{ name: '@cid', value: companyId }],
    })
    .fetchAll();

  if (assets.length === 0) return { assetsDepreciated: 0, totalAmount: 0 };

  // Check if depreciation for this period already exists
  const depDescription = `Monthly depreciation - ${period}`;
  const { resources: existingEntries } = await containers
    .ledger()
    .items.query<any>({
      query:
        "SELECT * FROM c WHERE c.companyId = @cid AND c.description = @desc AND c.status != 'reversed' AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber))",
      parameters: [
        { name: '@cid', value: companyId },
        { name: '@desc', value: depDescription },
      ],
    })
    .fetchAll();

  const lines: JournalLine[] = [];
  let totalAmount = 0;

  for (const asset of assets) {
    const monthlyDepreciation = computeMonthlyDepreciation(asset);
    if (monthlyDepreciation <= 0) continue;

    lines.push(
      {
        accountCode: asset.expenseAccountCode,
        accountName: `Depreciation - ${asset.name}`,
        debit: monthlyDepreciation,
        credit: 0,
        description: `Monthly depreciation ${period}`,
      },
      {
        accountCode: asset.depreciationAccountCode,
        accountName: `Accum. depreciation - ${asset.name}`,
        debit: 0,
        credit: monthlyDepreciation,
        description: `Monthly depreciation ${period}`,
      },
    );

    totalAmount += monthlyDepreciation;
  }

  if (lines.length === 0) return { assetsDepreciated: 0, totalAmount: 0 };

  // If existing entry has the same total, skip (idempotent)
  if (existingEntries.length > 0) {
    const existingTotal = roundCurrency(
      existingEntries[0].lines?.reduce((s: number, l: any) => s + (l.debit || 0), 0) || 0,
    );
    if (existingTotal === roundCurrency(totalAmount)) {
      return {
        assetsDepreciated: assets.length,
        totalAmount: roundCurrency(totalAmount),
        journalEntryId: existingEntries[0].id,
        isSkipped: true,
      };
    }

    // Amounts differ - reverse the old entry and post a new one
    // First, reverse the asset accum depreciation from the old entry
    for (const asset of assets) {
      const oldLines =
        existingEntries[0].lines?.filter(
          (l: any) => l.accountName?.includes(asset.name) && l.credit > 0,
        ) || [];
      const oldAmount = oldLines.reduce((s: number, l: any) => s + l.credit, 0);
      if (oldAmount > 0) {
        asset.accumulatedDepreciation = roundCurrency(asset.accumulatedDepreciation - oldAmount);
        asset.netBookValue = roundCurrency(asset.acquisitionCost - asset.accumulatedDepreciation);
        if (asset.status === 'fully-depreciated') asset.status = 'active';
      }
    }

    // Reverse the old journal entry
    const { reverseJournalEntry } = await import('./ledger.js');
    await reverseJournalEntry(companyId, existingEntries[0].id, createdBy);
  }

  // Update asset balances
  for (const asset of assets) {
    const monthlyDepreciation = computeMonthlyDepreciation(asset);
    if (monthlyDepreciation <= 0) continue;
    asset.accumulatedDepreciation = roundCurrency(
      asset.accumulatedDepreciation + monthlyDepreciation,
    );
    asset.netBookValue = roundCurrency(asset.acquisitionCost - asset.accumulatedDepreciation);
    if (asset.accumulatedDepreciation >= asset.acquisitionCost - asset.residualValue) {
      asset.status = 'fully-depreciated';
    }
    asset.updatedAt = new Date().toISOString();
    await containers.inventory().item(asset.id, companyId).replace(asset);
  }

  const [y, m] = period.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const entry = await postJournalEntry({
    companyId,
    date: `${period}-${lastDay}`,
    description: depDescription,
    lines,
    sourceType: 'adjustment',
    createdBy,
  });

  return {
    assetsDepreciated: assets.filter((a) => a.status === 'active').length,
    totalAmount: roundCurrency(totalAmount),
    journalEntryId: entry.id,
  };
}

// ─── Dispose ────────────────────────────────────────────────

export interface DisposeAssetOptions {
  /** GL account credited for proceeds. Default 2420 (Bank). Use a customer
   *  receivable account when proceeds are not yet collected. */
  proceedsAccountCode?: string;
  /** Account name to display on the proceeds line. */
  proceedsAccountName?: string;
  /** Override the gain account (default 5230). */
  gainAccountCode?: string;
  /** Override the loss account (default 6390). */
  lossAccountCode?: string;
}

export async function disposeAsset(
  companyId: string,
  assetId: string,
  disposalDate: string,
  disposalAmount: number,
  createdBy: string,
  options: DisposeAssetOptions = {},
): Promise<FixedAsset> {
  const { resource: asset } = await containers
    .inventory()
    .item(assetId, companyId)
    .read<FixedAsset>();
  if (!asset) throw new GLError('NOT_FOUND', 'Asset not found');
  if (asset.status === 'disposed') throw new GLError('ALREADY_DISPOSED', 'Asset already disposed');
  if (disposalDate < asset.acquisitionDate) {
    throw new GLError(
      'INVALID_INPUT',
      `Disposal date ${disposalDate} cannot be before acquisition date ${asset.acquisitionDate}`,
    );
  }
  if (disposalAmount < 0) {
    throw new GLError('INVALID_INPUT', 'Disposal amount must be >= 0');
  }

  // Catch-up depreciation: post any unrecorded monthly depreciation up to
  // (but not including) the disposal month so the disposal P&L reflects
  // GAAP-correct net book value. This avoids the trap where an asset
  // disposed mid-period understates expense / overstates gain.
  const catchUp = computeMonthlyDepreciation(asset);
  if (catchUp > 0) {
    const catchUpDate = disposalDate;
    await postJournalEntry({
      companyId,
      date: catchUpDate,
      description: `Pre-disposal depreciation: ${asset.name}`,
      lines: [
        {
          accountCode: asset.expenseAccountCode,
          accountName: `Depreciation - ${asset.name}`,
          debit: catchUp,
          credit: 0,
          description: 'Pre-disposal catch-up',
        },
        {
          accountCode: asset.depreciationAccountCode,
          accountName: `Accum. depreciation - ${asset.name}`,
          debit: 0,
          credit: catchUp,
          description: 'Pre-disposal catch-up',
        },
      ],
      sourceType: 'adjustment',
      sourceId: assetId,
      createdBy,
    });
    asset.accumulatedDepreciation = roundCurrency(asset.accumulatedDepreciation + catchUp);
    asset.netBookValue = roundCurrency(asset.acquisitionCost - asset.accumulatedDepreciation);
  }

  const proceedsCode = options.proceedsAccountCode ?? '2420';
  const proceedsName = options.proceedsAccountName ?? 'Bank accounts';
  const gainCode = options.gainAccountCode ?? '5230';
  const lossCode = options.lossAccountCode ?? '6390';

  const gainOrLoss = roundCurrency(disposalAmount - asset.netBookValue);
  const lines: JournalLine[] = [
    // Remove accumulated depreciation
    {
      accountCode: asset.depreciationAccountCode,
      accountName: 'Accum. depreciation',
      debit: asset.accumulatedDepreciation,
      credit: 0,
      description: 'Remove accumulated depreciation',
    },
    // Remove asset cost
    {
      accountCode: asset.assetAccountCode,
      accountName: asset.name,
      debit: 0,
      credit: asset.acquisitionCost,
      description: 'Remove asset cost',
    },
  ];

  if (disposalAmount > 0) {
    lines.push({
      accountCode: proceedsCode,
      accountName: proceedsName,
      debit: disposalAmount,
      credit: 0,
      description: `Disposal proceeds - ${asset.name}`,
    });
  }

  if (gainOrLoss > 0) {
    lines.push({
      accountCode: gainCode,
      accountName: 'Gain on disposal of fixed assets',
      debit: 0,
      credit: gainOrLoss,
      description: 'Gain on disposal',
    });
  } else if (gainOrLoss < 0) {
    lines.push({
      accountCode: lossCode,
      accountName: 'Loss on disposal of fixed assets',
      debit: Math.abs(gainOrLoss),
      credit: 0,
      description: 'Loss on disposal',
    });
  }

  await postJournalEntry({
    companyId,
    date: disposalDate,
    description: `Dispose: ${asset.name}`,
    lines,
    sourceType: 'adjustment',
    sourceId: assetId,
    createdBy,
  });

  asset.status = 'disposed';
  asset.disposalDate = disposalDate;
  asset.disposalAmount = disposalAmount;
  asset.netBookValue = 0;
  asset.updatedAt = new Date().toISOString();
  await containers.inventory().item(assetId, companyId).replace(asset);

  await emitEvent({
    companyId,
    type: 'asset.disposed',
    actor: createdBy,
    documentType: 'fixed-asset',
    documentId: assetId,
    data: { code: asset.code, name: asset.name, gainOrLoss, disposalAmount },
  });

  return asset;
}

// ─── List ───────────────────────────────────────────────────

export async function listFixedAssets(companyId: string): Promise<FixedAsset[]> {
  const { resources } = await containers
    .inventory()
    .items.query<FixedAsset>({
      query:
        "SELECT * FROM c WHERE c.companyId = @cid AND c.docType = 'fixed-asset' ORDER BY c.code",
      parameters: [{ name: '@cid', value: companyId }],
    })
    .fetchAll();
  return resources;
}
