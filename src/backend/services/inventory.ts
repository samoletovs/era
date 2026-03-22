import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import { emitEvent } from "./events.js";
import type { Item, StockMovement } from "@shared/types";

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Items ──────────────────────────────────────────────────

interface CreateItemInput {
  companyId: string;
  code: string;
  name: string;
  description?: string;
  type: "product" | "service";
  unitOfMeasure: string;
  costPrice: number;
  sellingPrice: number;
  vatRate: number;
  purchaseAccountCode: string;
  salesAccountCode: string;
  createdBy: string;
}

export async function createItem(input: CreateItemInput): Promise<Item> {
  const now = new Date().toISOString();
  const item: Item = {
    id: uuidv4(),
    docType: "item" as const,
    companyId: input.companyId,
    code: input.code,
    name: input.name,
    description: input.description,
    type: input.type,
    unitOfMeasure: input.unitOfMeasure,
    costPrice: input.costPrice,
    sellingPrice: input.sellingPrice,
    vatRate: input.vatRate,
    quantityOnHand: 0,
    purchaseAccountCode: input.purchaseAccountCode,
    salesAccountCode: input.salesAccountCode,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  };

  await containers.inventory().items.create(item);

  await emitEvent({
    companyId: input.companyId,
    type: "item.created",
    actor: input.createdBy,
    documentType: "item",
    documentId: item.id,
    data: { code: item.code, name: item.name, type: item.type },
  });

  return item;
}

export async function getItem(companyId: string, itemId: string): Promise<Item | null> {
  try {
    const { resource } = await containers.inventory().item(itemId, companyId).read<Item>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export async function listItems(companyId: string): Promise<Item[]> {
  const { resources } = await containers.inventory().items
    .query<Item>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'item' OR IS_DEFINED(c.sellingPrice)) ORDER BY c.name",
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();
  return resources;
}

// ─── Stock Movements ────────────────────────────────────────

export async function recordStockMovement(input: {
  companyId: string;
  itemId: string;
  itemCode: string;
  type: StockMovement["type"];
  quantity: number;
  unitCost: number;
  sourceType: "invoice" | "manual";
  sourceId?: string;
  date: string;
  createdBy: string;
}): Promise<StockMovement> {
  // Get current item to update balance
  const item = await getItem(input.companyId, input.itemId);
  if (!item) throw new Error("Item not found");
  if (item.type === "service") throw new Error("Cannot track stock for service items");

  const balanceAfter = item.quantityOnHand + input.quantity;
  const now = new Date().toISOString();

  const movement: StockMovement = {
    id: uuidv4(),
    docType: "stock-movement" as const,
    companyId: input.companyId,
    itemId: input.itemId,
    itemCode: input.itemCode,
    type: input.type,
    quantity: input.quantity,
    unitCost: input.unitCost,
    totalCost: roundCurrency(Math.abs(input.quantity) * input.unitCost),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    date: input.date,
    balanceAfter,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  };

  await containers.inventory().items.create(movement);

  // Update item quantity
  item.quantityOnHand = balanceAfter;
  item.updatedAt = now;
  await containers.inventory().item(item.id, input.companyId).replace(item);

  return movement;
}
