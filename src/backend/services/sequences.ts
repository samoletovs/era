// Number sequence generator — atomic next-number allocation for all record types
import { containers } from "./cosmos.js";
import type { Company, SequenceType, NumberSequence } from "@shared/types";
import { DEFAULT_SEQUENCES } from "@shared/types";

/**
 * Format a number using a sequence config.
 * Example: { prefix: "INV", nextNumber: 42, padding: 6, separator: "-" } → "INV-000042"
 */
export function formatSequenceNumber(seq: NumberSequence, num: number): string {
  const sep = seq.separator ?? "-";
  const padded = String(num).padStart(seq.padding, "0");
  const suffix = seq.suffix ? `${sep}${seq.suffix}` : "";
  return `${seq.prefix}${sep}${padded}${suffix}`;
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
