// Fixed assets — acquisition, depreciation, disposal
// Sprint 4 feature

import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import { postJournalEntry, GLError } from "./ledger.js";
import { emitEvent } from "./events.js";
import type { JournalLine } from "@shared/types";

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Types ──────────────────────────────────────────────────

export interface FixedAsset {
  id: string;
  companyId: string;
  docType: "fixed-asset";
  code: string;
  name: string;
  description?: string;
  assetAccountCode: string;       // e.g. "1210" Land and buildings
  depreciationAccountCode: string; // e.g. "1240" Accumulated depreciation
  expenseAccountCode: string;      // e.g. "6380" Depreciation expense
  acquisitionDate: string;
  acquisitionCost: number;
  residualValue: number;
  usefulLifeMonths: number;
  depreciationMethod: "straight-line";
  accumulatedDepreciation: number;
  netBookValue: number;
  status: "active" | "fully-depreciated" | "disposed";
  disposalDate?: string;
  disposalAmount?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
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
  createdBy: string;
}

export async function acquireAsset(input: AcquireAssetInput): Promise<FixedAsset> {
  const now = new Date().toISOString();
  const asset: FixedAsset = {
    id: uuidv4(),
    companyId: input.companyId,
    docType: "fixed-asset" as const,
    code: input.code,
    name: input.name,
    description: input.description,
    assetAccountCode: input.assetAccountCode,
    depreciationAccountCode: input.depreciationAccountCode,
    expenseAccountCode: input.expenseAccountCode,
    acquisitionDate: input.acquisitionDate,
    acquisitionCost: input.acquisitionCost,
    residualValue: input.residualValue,
    usefulLifeMonths: input.usefulLifeMonths,
    depreciationMethod: "straight-line",
    accumulatedDepreciation: 0,
    netBookValue: input.acquisitionCost,
    status: "active",
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
      { accountCode: input.assetAccountCode, accountName: input.name, debit: input.acquisitionCost, credit: 0, description: `Acquisition — ${input.name}` },
      { accountCode: "2420", accountName: "Bank accounts", debit: 0, credit: input.acquisitionCost, description: `Payment for ${input.name}` },
    ],
    sourceType: "manual",
    sourceId: asset.id,
    createdBy: input.createdBy,
  });

  await containers.inventory().items.create(asset);

  await emitEvent({
    companyId: input.companyId,
    type: "asset.acquired",
    actor: input.createdBy,
    documentType: "fixed-asset",
    documentId: asset.id,
    data: { code: asset.code, name: asset.name, cost: asset.acquisitionCost },
  });

  return asset;
}

// ─── Depreciate ─────────────────────────────────────────────

export async function runDepreciation(
  companyId: string,
  period: string,
  createdBy: string
): Promise<{ assetsDepreciated: number; totalAmount: number; journalEntryId?: string }> {
  const { resources: assets } = await containers.inventory().items
    .query<FixedAsset>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND c.docType = 'fixed-asset' AND c.status = 'active'",
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();

  if (assets.length === 0) return { assetsDepreciated: 0, totalAmount: 0 };

  const lines: JournalLine[] = [];
  let totalAmount = 0;

  for (const asset of assets) {
    const depreciableAmount = asset.acquisitionCost - asset.residualValue;
    const monthlyDepreciation = roundCurrency(depreciableAmount / asset.usefulLifeMonths);
    const remaining = roundCurrency(depreciableAmount - asset.accumulatedDepreciation);

    if (remaining <= 0) continue;

    const amount = Math.min(monthlyDepreciation, remaining);

    lines.push(
      { accountCode: asset.expenseAccountCode, accountName: `Depreciation — ${asset.name}`, debit: amount, credit: 0, description: `Monthly depreciation ${period}` },
      { accountCode: asset.depreciationAccountCode, accountName: `Accum. depreciation — ${asset.name}`, debit: 0, credit: amount, description: `Monthly depreciation ${period}` },
    );

    asset.accumulatedDepreciation = roundCurrency(asset.accumulatedDepreciation + amount);
    asset.netBookValue = roundCurrency(asset.acquisitionCost - asset.accumulatedDepreciation);
    if (asset.accumulatedDepreciation >= depreciableAmount) asset.status = "fully-depreciated";
    asset.updatedAt = new Date().toISOString();
    await containers.inventory().item(asset.id, companyId).replace(asset);

    totalAmount += amount;
  }

  if (lines.length === 0) return { assetsDepreciated: 0, totalAmount: 0 };

  const [y, m] = period.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const entry = await postJournalEntry({
    companyId,
    date: `${period}-${lastDay}`,
    description: `Monthly depreciation — ${period}`,
    lines,
    sourceType: "adjustment",
    createdBy,
  });

  return { assetsDepreciated: assets.filter(a => a.status === "active").length, totalAmount: roundCurrency(totalAmount), journalEntryId: entry.id };
}

// ─── Dispose ────────────────────────────────────────────────

export async function disposeAsset(
  companyId: string,
  assetId: string,
  disposalDate: string,
  disposalAmount: number,
  createdBy: string
): Promise<FixedAsset> {
  const { resource: asset } = await containers.inventory()
    .item(assetId, companyId).read<FixedAsset>();
  if (!asset) throw new GLError("NOT_FOUND", "Asset not found");
  if (asset.status === "disposed") throw new GLError("ALREADY_DISPOSED", "Asset already disposed");

  const gainOrLoss = roundCurrency(disposalAmount - asset.netBookValue);
  const lines: JournalLine[] = [
    // Remove accumulated depreciation
    { accountCode: asset.depreciationAccountCode, accountName: "Accum. depreciation", debit: asset.accumulatedDepreciation, credit: 0, description: "Remove accumulated depreciation" },
    // Remove asset cost
    { accountCode: asset.assetAccountCode, accountName: asset.name, debit: 0, credit: asset.acquisitionCost, description: "Remove asset cost" },
  ];

  if (disposalAmount > 0) {
    lines.push({ accountCode: "2420", accountName: "Bank accounts", debit: disposalAmount, credit: 0, description: `Disposal proceeds — ${asset.name}` });
  }

  if (gainOrLoss > 0) {
    lines.push({ accountCode: "5230", accountName: "Other operating income", debit: 0, credit: gainOrLoss, description: "Gain on disposal" });
  } else if (gainOrLoss < 0) {
    lines.push({ accountCode: "6390", accountName: "Other administrative expenses", debit: Math.abs(gainOrLoss), credit: 0, description: "Loss on disposal" });
  }

  await postJournalEntry({ companyId, date: disposalDate, description: `Dispose: ${asset.name}`, lines, sourceType: "adjustment", sourceId: assetId, createdBy });

  asset.status = "disposed";
  asset.disposalDate = disposalDate;
  asset.disposalAmount = disposalAmount;
  asset.netBookValue = 0;
  asset.updatedAt = new Date().toISOString();
  await containers.inventory().item(assetId, companyId).replace(asset);

  return asset;
}

// ─── List ───────────────────────────────────────────────────

export async function listFixedAssets(companyId: string): Promise<FixedAsset[]> {
  const { resources } = await containers.inventory().items
    .query<FixedAsset>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND c.docType = 'fixed-asset' ORDER BY c.code",
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();
  return resources;
}

