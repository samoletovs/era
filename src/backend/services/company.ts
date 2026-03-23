import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import { buildAccountsForCompany } from "./chart-of-accounts.js";
import { emitEvent } from "./events.js";
import type { Company, CompanySettings } from "@shared/types";

interface CreateCompanyInput {
  name: string;
  code?: string;
  registrationNumber: string;
  vatNumber?: string;
  legalAddress: Company["legalAddress"];
  createdBy: string;
}

// Generate a short code from company name (max 5 chars, uppercase)
// "SIA DAIS" → "DAIS", "Sabiedrība ar ierobežotu atbildību \"DAIS\"" → "DAIS"
function generateCode(name: string): string {
  // Try to extract quoted name first (common in LV register)
  const quoted = name.match(/[""]([^""]+)[""]/) || name.match(/"([^"]+)"/);
  const cleanName = quoted ? quoted[1] : name;

  // Remove common prefixes
  const stripped = cleanName
    .replace(/^(SIA|AS|IK|ZS|PS)\s+/i, "")
    .replace(/^Sabiedrība ar ierobežotu atbildību\s*/i, "")
    .trim();

  // Take first 5 meaningful characters, uppercase
  return stripped
    .replace(/[^a-zA-ZāčēģīķļņšūžĀČĒĢĪĶĻŅŠŪŽ0-9]/g, "")
    .slice(0, 5)
    .toUpperCase();
}

/**
 * Generate a friendly short name from a registered company/contact name.
 * Strips legal form prefixes, quotes, and excess formatting.
 *
 * Examples:
 *   'Sabiedrība ar ierobežotu atbildību "DAIS"' → 'Dais'
 *   '"MICROSOFT TEHNOLOĢIJU LIETOTĀJU BIEDRĪBA"' → 'Microsoft Tehnoloģiju Lietotāju Biedrība'
 *   'SIA "DAIS GRĀMATVEDĪBA"' → 'Dais Grāmatvedība'
 *   'DAISY ADVERTISING SIA' → 'Daisy Advertising'
 *   'SIA ERA Demo' → 'ERA Demo'
 */
export function generateShortName(officialName: string): string {
  let name = officialName.trim();

  // 1. Extract content from quotes if present (Latvian register often wraps in quotes)
  const quoted = name.match(/[""\u201C\u201D]([^""\u201C\u201D]+)[""\u201C\u201D]/);
  if (quoted) {
    name = quoted[1].trim();
  }

  // 2. Remove common Latvian/Baltic legal form prefixes and suffixes
  const legalForms = [
    /^Sabiedr[iī]ba ar ierobe[zž]otu atbild[iī]bu\s*/i,
    /^Akciju sabiedr[iī]ba\s*/i,
    /^Individu[aā]lais uz[nņ][eē]mums\s*/i,
    /^Zemnieku saimniec[iī]ba\s*/i,
    /^Pilnsabiedr[iī]ba\s*/i,
    /^Kooperat[iī]v[aā] sabiedr[iī]ba\s*/i,
    /^Biedr[iī]ba\s*/i,
    /^Nodibin[aā]jums\s*/i,
    /^(SIA|AS|IK|ZS|PS|SE|O[UÜ]|GmbH|Ltd\.?|LLC|Inc\.?|AG|AB|UAB|Oy|ApS)\s+/i,
    /\s+(SIA|AS|IK|ZS|PS|SE|O[UÜ]|GmbH|Ltd\.?|LLC|Inc\.?|AG|AB|UAB|Oy|ApS)$/i,
  ];
  for (const re of legalForms) {
    name = name.replace(re, "").trim();
  }

  // 3. Remove remaining outer quotes
  name = name.replace(/^[""\u201C\u201D]+|[""\u201C\u201D]+$/g, "").trim();

  // 4. Title-case if all uppercase (many register names are ALL CAPS)
  if (name === name.toUpperCase() && name.length > 3) {
    name = name
      .toLowerCase()
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  // 5. Limit length for display
  if (name.length > 40) {
    name = name.slice(0, 38).replace(/\s+\S*$/, "") + "…";
  }

  return name || officialName;
}

export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const code = input.code || generateCode(input.name);

  const settings: CompanySettings = {
    isVatRegistered: !!input.vatNumber,
    vatRate: 21,
    defaultPaymentTermsDays: 30,
    invoiceNumberPrefix: "INV",
    nextInvoiceNumber: 1,
    currency: {
      accountingCurrency: "EUR",
      accountingRateType: "daily",
      exchangeRateSource: "ecb",
    },
  };

  const company: Company = {
    id,
    code,
    name: input.name,
    shortName: generateShortName(input.name),
    registrationNumber: input.registrationNumber,
    vatNumber: input.vatNumber,
    legalAddress: input.legalAddress,
    bankAccounts: [],
    fiscalYearStart: 1,
    currency: "EUR",
    country: "LV",
    settings,
    createdAt: now,
    updatedAt: now,
  };

  // Create company
  await containers.companies().items.create(company);

  // Pre-populate Latvian Chart of Accounts
  const accounts = buildAccountsForCompany(id, input.createdBy);
  const ledgerContainer = containers.ledger();
  for (const account of accounts) {
    await ledgerContainer.items.create(account);
  }

  await emitEvent({
    companyId: id,
    type: "company.created",
    actor: input.createdBy,
    documentType: "company",
    documentId: id,
    data: { name: company.name, code: company.code },
  });

  return company;
}

export async function getCompany(id: string): Promise<Company | null> {
  try {
    const { resource } = await containers.companies().item(id, id).read<Company>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export async function updateCompany(
  id: string,
  updates: Partial<Pick<Company, "code" | "name" | "shortName" | "vatNumber" | "settings" | "bankAccounts" | "legalAddress">>
): Promise<Company | null> {
  const company = await getCompany(id);
  if (!company) return null;

  Object.assign(company, updates, { updatedAt: new Date().toISOString() });
  if (updates.name && !updates.shortName) {
    company.shortName = generateShortName(updates.name);
  }
  const { resource } = await containers.companies().item(id, id).replace(company);
  return resource ?? null;
}

export async function getCompanyStats(id: string): Promise<{ transactionCount: number }> {
  const { resources: txns } = await containers.ledger().items
    .query<number>({
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.companyId = @companyId AND c.docType != 'account'",
      parameters: [{ name: "@companyId", value: id }],
    })
    .fetchAll();
  return { transactionCount: txns[0] ?? 0 };
}

export async function deleteCompany(id: string): Promise<{ isDeleted: boolean }> {
  const company = await getCompany(id);
  if (!company) throw new Error("Company not found");

  // Delete all ledger items (accounts, journal entries, etc.)
  const { resources: ledgerItems } = await containers.ledger().items
    .query<{ id: string }>({
      query: "SELECT c.id FROM c WHERE c.companyId = @companyId",
      parameters: [{ name: "@companyId", value: id }],
    })
    .fetchAll();
  for (const item of ledgerItems) {
    await containers.ledger().item(item.id, id).delete();
  }

  // Delete documents (invoices)
  const { resources: docs } = await containers.documents().items
    .query<{ id: string }>({
      query: "SELECT c.id FROM c WHERE c.companyId = @companyId",
      parameters: [{ name: "@companyId", value: id }],
    })
    .fetchAll();
  for (const doc of docs) {
    await containers.documents().item(doc.id, id).delete();
  }

  // Delete contacts
  const { resources: contacts } = await containers.contacts().items
    .query<{ id: string }>({
      query: "SELECT c.id FROM c WHERE c.companyId = @companyId",
      parameters: [{ name: "@companyId", value: id }],
    })
    .fetchAll();
  for (const contact of contacts) {
    await containers.contacts().item(contact.id, id).delete();
  }

  // Delete inventory
  const { resources: items } = await containers.inventory().items
    .query<{ id: string }>({
      query: "SELECT c.id FROM c WHERE c.companyId = @companyId",
      parameters: [{ name: "@companyId", value: id }],
    })
    .fetchAll();
  for (const item of items) {
    await containers.inventory().item(item.id, id).delete();
  }

  // Delete events
  const { resources: events } = await containers.events().items
    .query<{ id: string }>({
      query: "SELECT c.id FROM c WHERE c.companyId = @companyId",
      parameters: [{ name: "@companyId", value: id }],
    })
    .fetchAll();
  for (const event of events) {
    await containers.events().item(event.id, id).delete();
  }

  // Delete the company itself
  await containers.companies().item(id, id).delete();

  return { isDeleted: true };
}
