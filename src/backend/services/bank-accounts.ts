import { containers } from './cosmos.js';
import type { Company } from '@shared/types';
import { DEFAULT_GL_ACCOUNTS } from '@shared/constants';

export interface BankAccountLedgerLink {
  iban: string;
  name: string;
  bankName: string;
  isDefault: boolean;
  ledgerAccountCodes: string[];
}

function normalizeLedgerCodes(codes?: string[]): string[] {
  const normalized = (codes || []).map((c) => c.trim()).filter(Boolean);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : [DEFAULT_GL_ACCOUNTS.BANK];
}

export async function getCompanyBankAccountLinks(
  companyId: string,
): Promise<BankAccountLedgerLink[]> {
  const { resource: company } = await containers
    .companies()
    .item(companyId, companyId)
    .read<Company>();
  if (!company) return [];
  return (company.bankAccounts || []).map((account) => ({
    iban: account.iban,
    name: account.name,
    bankName: account.bankName,
    isDefault: account.isDefault,
    ledgerAccountCodes: normalizeLedgerCodes(account.ledgerAccountCodes),
  }));
}

export async function getCashAccountCodes(companyId: string): Promise<string[]> {
  const links = await getCompanyBankAccountLinks(companyId);
  const codes = links.flatMap((l) => l.ledgerAccountCodes);
  return codes.length > 0 ? Array.from(new Set(codes)) : [DEFAULT_GL_ACCOUNTS.BANK];
}

export async function resolveBankLedgerAccountCode(
  companyId: string,
  bankAccountIban?: string,
): Promise<string> {
  const links = await getCompanyBankAccountLinks(companyId);
  if (links.length === 0) return DEFAULT_GL_ACCOUNTS.BANK;
  const normalizedIban = (bankAccountIban || '').trim();
  const matchedByIban = normalizedIban
    ? links.find((l) => l.iban.toLowerCase() === normalizedIban.toLowerCase())
    : undefined;
  const selected = matchedByIban || links.find((l) => l.isDefault) || links[0];
  return selected.ledgerAccountCodes[0] || DEFAULT_GL_ACCOUNTS.BANK;
}
