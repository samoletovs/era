import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import { buildAccountsForCompany } from "./chart-of-accounts.js";
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

export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const code = input.code || generateCode(input.name);

  const settings: CompanySettings = {
    vatRegistered: !!input.vatNumber,
    vatRate: 21,
    defaultPaymentTermsDays: 30,
    invoiceNumberPrefix: "INV",
    nextInvoiceNumber: 1,
  };

  const company: Company = {
    id,
    code,
    name: input.name,
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
  updates: Partial<Pick<Company, "code" | "name" | "vatNumber" | "settings" | "bankAccounts" | "legalAddress">>
): Promise<Company | null> {
  const company = await getCompany(id);
  if (!company) return null;

  Object.assign(company, updates, { updatedAt: new Date().toISOString() });
  const { resource } = await containers.companies().item(id, id).replace(company);
  return resource ?? null;
}
