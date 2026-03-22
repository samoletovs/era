import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import { buildAccountsForCompany } from "./chart-of-accounts.js";
import type { Company, CompanySettings } from "@shared/types";

interface CreateCompanyInput {
  name: string;
  registrationNumber: string;
  vatNumber?: string;
  legalAddress: Company["legalAddress"];
  createdBy: string;
}

export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  const id = uuidv4();
  const now = new Date().toISOString();

  const settings: CompanySettings = {
    vatRegistered: !!input.vatNumber,
    vatRate: 21,
    defaultPaymentTermsDays: 30,
    invoiceNumberPrefix: "INV",
    nextInvoiceNumber: 1,
  };

  const company: Company = {
    id,
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
