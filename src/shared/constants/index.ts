export const APP_NAME = "ERA";
export const APP_FULL_NAME = "Enterprise Resource Agent(s)";
export const APP_VERSION = "0.1.0";

export const DEFAULT_CURRENCY = "EUR";
export const DEFAULT_COUNTRY = "LV";
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// Latvian VAT rates
export const VAT_RATES = {
  STANDARD: 21,
  REDUCED: 12,
  SUPER_REDUCED: 5,
  ZERO: 0,
} as const;

export const VAT_REGISTRATION_THRESHOLD = 40_000; // EUR per 12 months

export const ERP_MODULES = {
  FINANCE: "finance",
  INVENTORY: "inventory",
  SALES: "sales",
  PROCUREMENT: "procurement",
  REPORTING: "reporting",
} as const;

export const INVOICE_STATUS = {
  DRAFT: "draft",
  POSTED: "posted",
  PARTIALLY_PAID: "partially_paid",
  PAID: "paid",
  OVERDUE: "overdue",
  CANCELLED: "cancelled",
} as const;

export const JOURNAL_STATUS = {
  DRAFT: "draft",
  POSTED: "posted",
  REVERSED: "reversed",
} as const;

export const ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
] as const;

// Cosmos DB container names
export const CONTAINERS = {
  COMPANIES: "companies",
  USERS: "users",
  LEDGER: "ledger",
  DOCUMENTS: "documents",
  CONTACTS: "contacts",
  INVENTORY: "inventory",
  AGENT_STATE: "agent-state",
  CHAT: "chat",
} as const;
