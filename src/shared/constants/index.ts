export const APP_NAME = 'era';
export const APP_FULL_NAME = 'Enterprise Resource Agent(s)';
export const APP_VERSION = '0.1.0';

export const DEFAULT_CURRENCY = 'EUR';
export const DEFAULT_COUNTRY = 'LV';
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
  FINANCE: 'finance',
  INVENTORY: 'inventory',
  SALES: 'sales',
  PROCUREMENT: 'procurement',
  REPORTING: 'reporting',
} as const;

export const INVOICE_STATUS = {
  DRAFT: 'draft',
  POSTED: 'posted',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
} as const;

export const JOURNAL_STATUS = {
  DRAFT: 'draft',
  POSTED: 'posted',
  REVERSED: 'reversed',
} as const;

export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;

// Cosmos DB container names
export const CONTAINERS = {
  COMPANIES: 'companies',
  USERS: 'users',
  LEDGER: 'ledger',
  DOCUMENTS: 'documents',
  CONTACTS: 'contacts',
  INVENTORY: 'inventory',
  AGENT_STATE: 'agent-state',
  CHAT: 'chat',
  FEEDBACK: 'feedback',
  EVENTS: 'events',
  RULES: 'rules',
} as const;

// ─── Default GL Account Codes (Latvian chart of accounts) ─────
// These defaults are used when company-specific settings are not configured.
// Multi-country support: override per company via company.settings.accountCodes
export const DEFAULT_GL_ACCOUNTS = {
  /** Accounts Receivable (trade debtors) */
  ACCOUNTS_RECEIVABLE: '2210',
  /** Accounts Payable (trade creditors) */
  ACCOUNTS_PAYABLE: '4220',
  /** Cash and Bank */
  BANK: '2420',
  /** VAT Output (collected) */
  VAT_OUTPUT: '4230',
  /** VAT Input (paid) */
  VAT_INPUT: '2310',
  /** Unrealized FX Gain */
  FX_GAIN_UNREALIZED: '8190',
  /** Unrealized FX Loss */
  FX_LOSS_UNREALIZED: '8290',
  /** Retained Earnings */
  RETAINED_EARNINGS: '3100',
  /** Income Summary (year-end close) */
  INCOME_SUMMARY: '3190',
} as const;

// ─── Account Code Ranges (for report classification) ──────────
export const ACCOUNT_RANGES = {
  ASSETS: { from: '1000', to: '2999' },
  LIABILITIES: { from: '4000', to: '4999' },
  EQUITY: { from: '3000', to: '3999' },
  REVENUE: { from: '5000', to: '5999' },
  EXPENSES: { from: '6000', to: '8999' },
} as const;
