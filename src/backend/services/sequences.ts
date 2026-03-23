// Number sequence generator — atomic next-number allocation for all record types
import { containers } from "./cosmos.js";
import type { Company, SequenceType, NumberSequence } from "@shared/types";
import { DEFAULT_SEQUENCES } from "@shared/types";

/**
 * Format a number using a sequence config.
 * Uses natural numbers without zero-padding:
 * INV-1, INV-2, ..., INV-10, ..., INV-100, INV-1000, etc.
 */
export function formatSequenceNumber(seq: NumberSequence, num: number): string {
  const sep = seq.separator ?? "-";
  const suffix = seq.suffix ? `${sep}${seq.suffix}` : "";
  return `${seq.prefix}${sep}${num}${suffix}`;
}

/**
 * Atomically get the next number for a given sequence type.
 * Reads the company, increments the counter, writes back, and returns the formatted number.
 * Falls back to DEFAULT_SEQUENCES if the company has no custom sequence for the type.
 */
export async function getNextNumber(companyId: string, type: SequenceType): Promise<string> {
  const container = containers.companies();
  const { resource: company } = await container.item(companyId, companyId).read<Company>();
  if (!company) throw new Error("Company not found");

  const sequences = company.settings.sequences || {};
  const seq: NumberSequence = sequences[type]
    ? { ...sequences[type] }
    : { ...DEFAULT_SEQUENCES[type] };

  const num = seq.nextNumber;
  const formatted = formatSequenceNumber(seq, num);

  // Increment and persist
  if (!company.settings.sequences) {
    company.settings.sequences = {};
  }
  company.settings.sequences[type] = {
    ...seq,
    nextNumber: num + 1,
  };
  company.updatedAt = new Date().toISOString();
  await container.item(company.id, company.id).replace(company);

  return formatted;
}
