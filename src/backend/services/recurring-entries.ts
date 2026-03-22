// Recurring journal entry templates
// Save, list, and execute recurring entries

import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import { postJournalEntry } from "./ledger.js";
import { emitEvent } from "./events.js";
import type { JournalLine, JournalEntry } from "@shared/types";

// ─── Types ──────────────────────────────────────────────────

export interface RecurringTemplate {
  id: string;
  companyId: string;
  name: string;
  description: string;
  lines: JournalLine[];
  frequency: "monthly" | "quarterly" | "yearly";
  nextRunDate?: string;
  lastRunDate?: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}

// ─── CRUD ───────────────────────────────────────────────────

export async function createRecurringTemplate(input: {
  companyId: string;
  name: string;
  description: string;
  lines: JournalLine[];
  frequency: RecurringTemplate["frequency"];
  nextRunDate?: string;
  createdBy: string;
}): Promise<RecurringTemplate> {
  const now = new Date().toISOString();
  const template: RecurringTemplate = {
    id: uuidv4(),
    companyId: input.companyId,
    name: input.name,
    description: input.description,
    lines: input.lines,
    frequency: input.frequency,
    nextRunDate: input.nextRunDate,
    isActive: true,
    createdAt: now,
    createdBy: input.createdBy,
  };
  await containers.documents().items.create(template);
  return template;
}

export async function listRecurringTemplates(companyId: string): Promise<RecurringTemplate[]> {
  const { resources } = await containers.documents().items
    .query<RecurringTemplate>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND IS_DEFINED(c.frequency) AND IS_DEFINED(c.lines) AND NOT IS_DEFINED(c.invoiceNumber) ORDER BY c.name",
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();
  return resources;
}

// ─── Execute Template ───────────────────────────────────────

export async function executeRecurringTemplate(
  companyId: string,
  templateId: string,
  date: string,
  createdBy: string
): Promise<JournalEntry> {
  const { resource: template } = await containers.documents()
    .item(templateId, companyId).read<RecurringTemplate>();

  if (!template) throw new Error("Template not found");
  if (!template.isActive) throw new Error("Template is inactive");

  const entry = await postJournalEntry({
    companyId,
    date,
    description: `${template.name} — recurring`,
    lines: template.lines,
    sourceType: "manual",
    sourceId: templateId,
    createdBy,
  });

  // Update last/next run dates
  template.lastRunDate = date;
  const next = new Date(date);
  if (template.frequency === "monthly") next.setMonth(next.getMonth() + 1);
  else if (template.frequency === "quarterly") next.setMonth(next.getMonth() + 3);
  else next.setFullYear(next.getFullYear() + 1);
  template.nextRunDate = next.toISOString().slice(0, 10);
  await containers.documents().item(templateId, companyId).replace(template);

  await emitEvent({
    companyId,
    type: "recurring.executed",
    actor: createdBy,
    documentType: "journal-entry",
    documentId: entry.id,
    data: { templateName: template.name, templateId },
  });

  return entry;
}
