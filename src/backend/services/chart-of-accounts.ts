// Latvian Chart of Accounts — based on Cabinet Regulation No. 775
// Pre-populated when a new SIA company is created
// Classes 1-7, with main groups and key posting accounts

import type { Account } from "@shared/types";

interface AccountTemplate {
  code: string;
  name: string;
  nameLv: string;
  type: Account["type"];
  level: number;
  isPostable: boolean;
  normalSide: "debit" | "credit";
  parentCode?: string;
}

export const LATVIAN_CHART_OF_ACCOUNTS: AccountTemplate[] = [
  // ═══ Class 1: Long-term assets ═══
  { code: "1000", name: "Long-term assets", nameLv: "Ilgtermiņa ieguldījumi", type: "asset", level: 1, isPostable: false, normalSide: "debit" },
  { code: "1100", name: "Intangible assets", nameLv: "Nemateriālie ieguldījumi", type: "asset", level: 2, isPostable: false, normalSide: "debit", parentCode: "1000" },
  { code: "1110", name: "Development costs", nameLv: "Attīstības izmaksas", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "1100" },
  { code: "1120", name: "Concessions, patents, licences", nameLv: "Koncesijas, patenti, licences", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "1100" },
  { code: "1130", name: "Goodwill", nameLv: "Nemateriālā vērtība", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "1100" },
  { code: "1200", name: "Fixed assets", nameLv: "Pamatlīdzekļi", type: "asset", level: 2, isPostable: false, normalSide: "debit", parentCode: "1000" },
  { code: "1210", name: "Land and buildings", nameLv: "Zemes gabali un ēkas", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "1200" },
  { code: "1220", name: "Equipment and machinery", nameLv: "Iekārtas un mašīnas", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "1200" },
  { code: "1230", name: "Other fixed assets", nameLv: "Pārējie pamatlīdzekļi", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "1200" },
  { code: "1240", name: "Accumulated depreciation", nameLv: "Uzkrātais nolietojums", type: "asset", level: 3, isPostable: true, normalSide: "credit", parentCode: "1200" },
  { code: "1300", name: "Long-term financial assets", nameLv: "Ilgtermiņa finanšu ieguldījumi", type: "asset", level: 2, isPostable: false, normalSide: "debit", parentCode: "1000" },
  { code: "1310", name: "Investments in subsidiaries", nameLv: "Līdzdalība meitas uzņēmumos", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "1300" },

  // ═══ Class 2: Current assets ═══
  { code: "2000", name: "Current assets", nameLv: "Apgrozāmie līdzekļi", type: "asset", level: 1, isPostable: false, normalSide: "debit" },
  { code: "2100", name: "Inventories", nameLv: "Krājumi", type: "asset", level: 2, isPostable: false, normalSide: "debit", parentCode: "2000" },
  { code: "2110", name: "Raw materials", nameLv: "Izejvielas un materiāli", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "2100" },
  { code: "2120", name: "Work in progress", nameLv: "Nepabeigtie ražojumi", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "2100" },
  { code: "2130", name: "Finished goods", nameLv: "Gatavie ražojumi un preces", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "2100" },
  { code: "2140", name: "Goods for resale", nameLv: "Preces pārdošanai", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "2100" },
  { code: "2200", name: "Trade receivables", nameLv: "Pircēju un pasūtītāju parādi", type: "asset", level: 2, isPostable: false, normalSide: "debit", parentCode: "2000" },
  { code: "2210", name: "Accounts receivable", nameLv: "Debitoru parādi", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "2200" },
  { code: "2220", name: "Doubtful receivables provision", nameLv: "Šaubīgo debitoru uzkrājums", type: "asset", level: 3, isPostable: true, normalSide: "credit", parentCode: "2200" },
  { code: "2300", name: "Other receivables", nameLv: "Citas prasības", type: "asset", level: 2, isPostable: false, normalSide: "debit", parentCode: "2000" },
  { code: "2310", name: "VAT receivable", nameLv: "PVN priekšnodoklis", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "2300" },
  { code: "2320", name: "Prepaid expenses", nameLv: "Avansa maksājumi un nākamo periodu izmaksas", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "2300" },
  { code: "2330", name: "Other debtors", nameLv: "Pārējie debitori", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "2300" },
  { code: "2400", name: "Cash and bank", nameLv: "Nauda un tās ekvivalenti", type: "asset", level: 2, isPostable: false, normalSide: "debit", parentCode: "2000" },
  { code: "2410", name: "Cash in hand", nameLv: "Kase", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "2400" },
  { code: "2420", name: "Bank accounts", nameLv: "Norēķinu konts bankā", type: "asset", level: 3, isPostable: true, normalSide: "debit", parentCode: "2400" },

  // ═══ Class 3: Equity ═══
  { code: "3000", name: "Equity", nameLv: "Pašu kapitāls", type: "equity", level: 1, isPostable: false, normalSide: "credit" },
  { code: "3100", name: "Share capital", nameLv: "Pamatkapitāls", type: "equity", level: 2, isPostable: false, normalSide: "credit", parentCode: "3000" },
  { code: "3110", name: "Subscribed share capital", nameLv: "Parakstītais pamatkapitāls", type: "equity", level: 3, isPostable: true, normalSide: "credit", parentCode: "3100" },
  { code: "3200", name: "Reserves", nameLv: "Rezerves", type: "equity", level: 2, isPostable: false, normalSide: "credit", parentCode: "3000" },
  { code: "3210", name: "Legal reserves", nameLv: "Likumā noteiktās rezerves", type: "equity", level: 3, isPostable: true, normalSide: "credit", parentCode: "3200" },
  { code: "3220", name: "Other reserves", nameLv: "Pārējās rezerves", type: "equity", level: 3, isPostable: true, normalSide: "credit", parentCode: "3200" },
  { code: "3300", name: "Retained earnings", nameLv: "Nesadalītā peļņa", type: "equity", level: 2, isPostable: false, normalSide: "credit", parentCode: "3000" },
  { code: "3310", name: "Retained earnings prior years", nameLv: "Iepriekšējo gadu nesadalītā peļņa", type: "equity", level: 3, isPostable: true, normalSide: "credit", parentCode: "3300" },
  { code: "3320", name: "Current year result", nameLv: "Pārskata gada peļņa/zaudējumi", type: "equity", level: 3, isPostable: true, normalSide: "credit", parentCode: "3300" },

  // ═══ Class 4: Liabilities ═══
  { code: "4000", name: "Liabilities", nameLv: "Kreditori", type: "liability", level: 1, isPostable: false, normalSide: "credit" },
  { code: "4100", name: "Long-term liabilities", nameLv: "Ilgtermiņa kreditori", type: "liability", level: 2, isPostable: false, normalSide: "credit", parentCode: "4000" },
  { code: "4110", name: "Long-term bank loans", nameLv: "Ilgtermiņa aizņēmumi no bankām", type: "liability", level: 3, isPostable: true, normalSide: "credit", parentCode: "4100" },
  { code: "4200", name: "Current liabilities", nameLv: "Īstermiņa kreditori", type: "liability", level: 2, isPostable: false, normalSide: "credit", parentCode: "4000" },
  { code: "4210", name: "Short-term bank loans", nameLv: "Īstermiņa aizņēmumi no bankām", type: "liability", level: 3, isPostable: true, normalSide: "credit", parentCode: "4200" },
  { code: "4220", name: "Trade payables", nameLv: "Parādi piegādātājiem", type: "liability", level: 3, isPostable: true, normalSide: "credit", parentCode: "4200" },
  { code: "4230", name: "VAT payable", nameLv: "PVN saistības", type: "liability", level: 3, isPostable: true, normalSide: "credit", parentCode: "4200" },
  { code: "4240", name: "Corporate income tax payable", nameLv: "Uzņēmumu ienākuma nodoklis", type: "liability", level: 3, isPostable: true, normalSide: "credit", parentCode: "4200" },
  { code: "4250", name: "Salary payable", nameLv: "Darba algas saistības", type: "liability", level: 3, isPostable: true, normalSide: "credit", parentCode: "4200" },
  { code: "4260", name: "Social security payable", nameLv: "Sociālā nodokļa saistības", type: "liability", level: 3, isPostable: true, normalSide: "credit", parentCode: "4200" },
  { code: "4270", name: "Other current liabilities", nameLv: "Pārējās īstermiņa saistības", type: "liability", level: 3, isPostable: true, normalSide: "credit", parentCode: "4200" },
  { code: "4280", name: "Accrued expenses", nameLv: "Uzkrātās saistības", type: "liability", level: 3, isPostable: true, normalSide: "credit", parentCode: "4200" },

  // ═══ Class 5: Revenue ═══
  { code: "5000", name: "Revenue", nameLv: "Ieņēmumi", type: "revenue", level: 1, isPostable: false, normalSide: "credit" },
  { code: "5100", name: "Sales revenue", nameLv: "Neto apgrozījums", type: "revenue", level: 2, isPostable: false, normalSide: "credit", parentCode: "5000" },
  { code: "5110", name: "Product sales", nameLv: "Preču pārdošanas ieņēmumi", type: "revenue", level: 3, isPostable: true, normalSide: "credit", parentCode: "5100" },
  { code: "5120", name: "Service revenue", nameLv: "Pakalpojumu ieņēmumi", type: "revenue", level: 3, isPostable: true, normalSide: "credit", parentCode: "5100" },
  { code: "5130", name: "Sales discounts", nameLv: "Atlaides pircējiem", type: "revenue", level: 3, isPostable: true, normalSide: "debit", parentCode: "5100" },
  { code: "5200", name: "Other income", nameLv: "Pārējie ieņēmumi", type: "revenue", level: 2, isPostable: false, normalSide: "credit", parentCode: "5000" },
  { code: "5210", name: "Interest income", nameLv: "Procentu ieņēmumi", type: "revenue", level: 3, isPostable: true, normalSide: "credit", parentCode: "5200" },
  { code: "5220", name: "Foreign exchange gains", nameLv: "Valūtas kursa peļņa", type: "revenue", level: 3, isPostable: true, normalSide: "credit", parentCode: "5200" },
  { code: "5230", name: "Other operating income", nameLv: "Pārējie saimnieciskās darbības ieņēmumi", type: "revenue", level: 3, isPostable: true, normalSide: "credit", parentCode: "5200" },

  // ═══ Class 6: Expenses ═══
  { code: "6000", name: "Expenses", nameLv: "Izmaksas", type: "expense", level: 1, isPostable: false, normalSide: "debit" },
  { code: "6100", name: "Cost of goods sold", nameLv: "Pārdotās produkcijas ražošanas izmaksas", type: "expense", level: 2, isPostable: false, normalSide: "debit", parentCode: "6000" },
  { code: "6110", name: "Cost of goods sold - products", nameLv: "Pārdoto preču izmaksas", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6100" },
  { code: "6120", name: "Cost of services sold", nameLv: "Pārdoto pakalpojumu izmaksas", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6100" },
  { code: "6200", name: "Selling expenses", nameLv: "Pārdošanas izmaksas", type: "expense", level: 2, isPostable: false, normalSide: "debit", parentCode: "6000" },
  { code: "6210", name: "Marketing and advertising", nameLv: "Mārketinga un reklāmas izmaksas", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6200" },
  { code: "6220", name: "Transport and delivery", nameLv: "Transporta un piegādes izmaksas", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6200" },
  { code: "6300", name: "Administrative expenses", nameLv: "Administrācijas izmaksas", type: "expense", level: 2, isPostable: false, normalSide: "debit", parentCode: "6000" },
  { code: "6310", name: "Salaries and wages", nameLv: "Darba alga", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6300" },
  { code: "6320", name: "Social security contributions", nameLv: "Sociālais nodoklis", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6300" },
  { code: "6330", name: "Rent and utilities", nameLv: "Nomas un komunālie maksājumi", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6300" },
  { code: "6340", name: "Office supplies", nameLv: "Biroja izdevumi", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6300" },
  { code: "6350", name: "Professional services", nameLv: "Profesionālo pakalpojumu izmaksas", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6300" },
  { code: "6360", name: "Communication expenses", nameLv: "Sakaru izmaksas", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6300" },
  { code: "6370", name: "Insurance", nameLv: "Apdrošināšana", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6300" },
  { code: "6380", name: "Depreciation", nameLv: "Nolietojums", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6300" },
  { code: "6390", name: "Other administrative expenses", nameLv: "Pārējās administrācijas izmaksas", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6300" },
  { code: "6400", name: "Financial expenses", nameLv: "Finanšu izmaksas", type: "expense", level: 2, isPostable: false, normalSide: "debit", parentCode: "6000" },
  { code: "6410", name: "Interest expense", nameLv: "Procentu maksājumi", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6400" },
  { code: "6420", name: "Foreign exchange losses", nameLv: "Valūtas kursa zaudējumi", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6400" },
  { code: "6430", name: "Bank fees", nameLv: "Bankas komisijas maksas", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6400" },
  { code: "6500", name: "Corporate income tax", nameLv: "Uzņēmumu ienākuma nodoklis", type: "expense", level: 2, isPostable: false, normalSide: "debit", parentCode: "6000" },
  { code: "6510", name: "CIT on distributed profit", nameLv: "UIN no sadalītās peļņas", type: "expense", level: 3, isPostable: true, normalSide: "debit", parentCode: "6500" },
];

export function buildAccountsForCompany(companyId: string, createdBy: string): Account[] {
  const now = new Date().toISOString();
  return LATVIAN_CHART_OF_ACCOUNTS.map((t) => ({
    id: `${companyId}-acct-${t.code}`,
    companyId,
    code: t.code,
    name: t.name,
    nameLv: t.nameLv,
    type: t.type,
    level: t.level,
    isPostable: t.isPostable,
    normalSide: t.normalSide,
    parentCode: t.parentCode,
    balance: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy,
  }));
}
