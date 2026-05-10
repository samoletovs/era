// ERA — Enterprise Resource Agent(s)
// Core entity types — Latvian SIA company compliance

// ─── Base ────────────────────────────────────────────────────

export interface BaseEntity {
  id: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  isActive: boolean;
  _etag?: string;
}

// ─── Company ─────────────────────────────────────────────────

export interface Company {
  id: string;
  code: string; // Short code, max 5 chars (e.g. "DAIS", "ERATC")
  name: string;
  shortName?: string; // Display name / "known as" (e.g. "Dais" instead of 'Sabiedrība "DAIS"')
  registrationNumber: string; // Latvian reg number (e.g. 40003XXXXXX)
  vatNumber?: string; // LV + 11 digits
  legalAddress: Address;
  bankAccounts: BankAccount[];
  fiscalYearStart: number; // month 1-12 (usually 1 for calendar year)
  currency: string; // ISO 4217 (default "EUR")
  country: string; // ISO 3166-1 alpha-2 (default "LV")
  settings: CompanySettings;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySettings {
  isVatRegistered: boolean;
  vatRate: number; // default 21
  defaultPaymentTermsDays: number;
  invoiceNumberPrefix: string;
  nextInvoiceNumber: number;
  numberFormat?: NumberFormat;
  dateFormat?: DateFormat;
  dateTimeFormat?: DateTimeFormat;
  sequences?: Record<string, NumberSequence>;
  currency?: CurrencySettings;
}

// Configurable number sequences for all document/record types
export type SequenceType =
  | 'salesInvoice'
  | 'purchaseInvoice'
  | 'creditNote'
  | 'payment'
  | 'journalEntry'
  | 'fixedAsset'
  | 'item'
  | 'contact';

export interface NumberSequence {
  prefix: string; // e.g. "INV", "PAY", "FA"
  nextNumber: number; // current counter, incremented on use
  padding?: number; // legacy — ignored, kept for backward compat
  suffix?: string; // optional suffix after number, e.g. "-2026"
  separator?: string; // between prefix and number, default "-"
}

// Default sequences applied when a company is created
export const DEFAULT_SEQUENCES: Record<SequenceType, NumberSequence> = {
  salesInvoice: { prefix: 'INV', nextNumber: 1, separator: '-' },
  purchaseInvoice: { prefix: 'PINV', nextNumber: 1, separator: '-' },
  creditNote: { prefix: 'CN', nextNumber: 1, separator: '-' },
  payment: { prefix: 'PAY', nextNumber: 1, separator: '-' },
  journalEntry: { prefix: 'JE', nextNumber: 1, separator: '-' },
  fixedAsset: { prefix: 'FA', nextNumber: 1, separator: '-' },
  item: { prefix: 'ITEM', nextNumber: 1, separator: '-' },
  contact: { prefix: 'C', nextNumber: 1, separator: '-' },
};

export const SEQUENCE_LABELS: Record<SequenceType, string> = {
  salesInvoice: 'Sales invoices',
  purchaseInvoice: 'Purchase invoices',
  creditNote: 'Credit notes',
  payment: 'Payments',
  journalEntry: 'Journal entries',
  fixedAsset: 'Fixed assets',
  item: 'Items',
  contact: 'Contacts',
};

export type NumberFormat =
  | 'space_comma'
  | 'dot_comma'
  | 'comma_dot'
  | 'space_dot'
  | 'none_dot'
  | 'none_comma';
// "space_comma"  → 1 234 567,89  (Latvian/French)
// "dot_comma"    → 1.234.567,89  (German/Italian)
// "comma_dot"    → 1,234,567.89  (English/US)
// "space_dot"    → 1 234 567.89
// "none_dot"     → 1234567.89
// "none_comma"   → 1234567,89

export type DateFormat =
  | 'dd.MM.yyyy'
  | 'dd/MM/yyyy'
  | 'MM/dd/yyyy'
  | 'yyyy-MM-dd'
  | 'dd-MM-yyyy'
  | 'dd MMM yyyy';
// "dd.MM.yyyy"   → 22.03.2026  (Latvia, Germany)
// "dd/MM/yyyy"   → 22/03/2026  (UK, France)
// "MM/dd/yyyy"   → 03/22/2026  (US)
// "yyyy-MM-dd"   → 2026-03-22  (ISO)
// "dd-MM-yyyy"   → 22-03-2026
// "dd MMM yyyy"  → 22 Mar 2026

export type DateTimeFormat = '24h' | '12h';
// "24h" → 14:30   (European)
// "12h" → 2:30 PM (US/UK)

export interface BankAccount {
  name: string;
  iban: string;
  swift: string;
  bankName: string;
  isDefault: boolean;
}

// ─── Multi-Currency (D365 F&O dual-currency model) ──────────
//
// Transaction currency  — per-document (invoice, payment), any ISO 4217 code
// Accounting currency   — company's statutory/local currency for GL & authority reporting
// Reporting currency    — optional group/consolidation currency (independent conversion from transaction currency)
//
// Exchange rate types:
//   daily  — spot/current rate from the exchange rate source (default for all transactions)
//   budget — rates set manually for budget/forecast scenarios
//
// Closing rate = the daily rate on the last business day of the period (auto-derived)
// Monthly average = calculated from stored daily rates (auto-derived)
// No user selection needed — the system determines which rate to use per IAS 21.

export type ExchangeRateType = 'daily' | 'budget';

// System rate sources (shared globally across all users and companies):
//   "ecb" — European Central Bank, auto-imported ~16:00 CET daily
//           Latvian Accounting Law §5 mandates ECB reference rates for all accounting.
// Custom sources are user-defined, identified by UUID, stored in company settings.
export type SystemRateSource = 'ecb';

export const SYSTEM_RATE_SOURCES: { id: SystemRateSource; name: string }[] = [
  { id: 'ecb', name: 'European Central Bank (ECB)' },
];

export interface CustomRateSource {
  id: string; // UUID
  name: string; // user-defined label, e.g. "Internal treasury", "Group rates"
}

export interface CurrencySettings {
  accountingCurrency: string; // ISO 4217, required — set at company creation
  reportingCurrency?: string; // ISO 4217, optional — for group consolidation
  accountingRateSource: string; // source ID: "ecb" | custom UUID
  reportingRateSource?: string; // source ID for reporting currency conversion
  budgetRateSource?: string; // source ID for budget/forecast rates
  customRateSources?: CustomRateSource[]; // user-defined manual sources (max 5)
  // FX gain/loss accounts are resolved automatically from posting rules (documentType: "fx-revaluation")
  // No manual configuration needed — the system uses country-specific rules
}

export interface ExchangeRate {
  id: string;
  docType?: 'exchange-rate'; // Cosmos discriminator
  fromCurrency: string; // ISO 4217
  toCurrency: string; // ISO 4217
  rateType: ExchangeRateType; // "daily" for imported/manual, "budget" for forecasts
  rate: number; // 1 fromCurrency = rate toCurrency
  effectiveDate: string; // ISO date
  source: string; // "ecb" | custom source UUID
  companyId?: string; // null = shared (system sources), companyId for custom sources
  createdAt: string;
}

// ─── Chart of Accounts ──────────────────────────────────────

export interface Account extends BaseEntity {
  docType: 'account';
  code: string; // e.g. "1210" per LV CoA
  name: string;
  nameLv: string; // Latvian name for official reports
  type: AccountType;
  parentCode?: string;
  level: number; // 1=class, 2=group, 3=account, 4=sub-account
  isPostable: boolean; // only level 3-4 accounts accept journal entries
  balance: number;
  normalSide: 'debit' | 'credit';
  // Foreign currency revaluation (D365 F&O: per-account flag)
  currencyCode?: string; // foreign currency if denominated (e.g., USD bank account)
  isForeignCurrencyRevaluation?: boolean; // include in month-end FX revaluation
}

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

// ─── General Ledger ─────────────────────────────────────────

// Account type on journal lines — determines which subledger entity the line targets
// Inspired by D365 F&O general journal but simplified for agent-driven workflows:
//   ledger      — direct GL account posting (default)
//   customer    — AR subledger: contactId required, accountCode = AR control account
//   vendor      — AP subledger: contactId required, accountCode = AP control account
//   bank        — bank account posting: accountCode = bank GL account (e.g. 2420)
//   fixed-asset — asset posting: fixedAssetId required, accountCode = asset GL account
//   item        — inventory posting: itemId required, accountCode = inventory GL account
export type JournalLineAccountType =
  | 'ledger'
  | 'customer'
  | 'vendor'
  | 'bank'
  | 'fixed-asset'
  | 'item';

export interface JournalEntry extends BaseEntity {
  docType: 'journal-entry';
  entryNumber: string;
  date: string; // ISO date
  description: string;
  lines: JournalLine[];
  status: 'draft' | 'posted' | 'reversed';
  period: string; // "2026-03"
  sourceType?: 'manual' | 'invoice' | 'payment' | 'adjustment' | 'closing';
  sourceId?: string; // reference to originating document
  totalDebit: number;
  totalCredit: number;
  // OpenTelemetry trace ID set when the entry is posted via an instrumented
  // path (chat/tool flow). Lets ops drill from a GL row in Application
  // Insights all the way back to the user message that produced it.
  traceId?: string;
}

export interface JournalLine {
  accountType?: JournalLineAccountType; // default "ledger" for backward compat
  accountCode: string;
  accountName: string;
  debit: number; // amount in accounting currency
  credit: number; // amount in accounting currency
  description?: string;
  /** @deprecated Use taxCode instead */
  vatCode?: string;
  // Enriched dimensions — enables subledger-free AR/AP/tax/inventory reporting
  contactId?: string;
  contactName?: string; // display name for customer/vendor lines
  itemId?: string;
  itemCode?: string; // display code for item lines
  fixedAssetId?: string; // reference for fixed-asset lines
  fixedAssetCode?: string; // display code for fixed-asset lines
  taxCode?: string; // e.g. "LV-21", "LV-12", "LV-0"
  taxAmount?: number;
  // Transaction currency (per D365 F&O dual-currency model)
  currencyCode?: string; // ISO 4217 transaction currency
  exchangeRate?: number; // transaction → accounting rate (1.0 if same)
  amountInCurrency?: number; // original amount in transaction currency
  // Reporting currency (parallel conversion from transaction currency, not via accounting)
  reportingCurrencyAmount?: number; // amount in reporting currency
  reportingExchangeRate?: number; // transaction → reporting rate
  // ── Provenance (Phase 2 explainability) ─────────────────
  // When this line was generated by a posting-rule evaluation, these
  // fields carry the rule identity so the UI can show a "🤖 Agent ·
  // LV-rules-v1.2 · sales-invoice" badge and the audit page can link
  // straight to the rule that produced it. All optional → fully
  // backward-compatible with hand-posted manual entries.
  postingRuleId?: string;
  postingRuleVersion?: number;
  postingRuleCountry?: string;
  postingRuleDocumentType?: PostingRule['documentType'];
  /**
   * Short excerpt of the agent's reasoning when this line was generated
   * via a chat tool call. Free text, ≤ 280 chars by convention. The full
   * reasoning lives on the originating ChatMessage / AgentAction; this
   * is just for the tooltip.
   */
  agentReasoningExcerpt?: string;
}

// ─── VID (Latvian Tax Authority) enrichment data ────────────

export interface VidVatStatus {
  isRegistered: boolean; // Whether company is a registered VAT payer
  vatNumber?: string; // Full VAT number (e.g. "LV40003999999")
  registeredDate?: string; // Date registered as VAT payer
  excludedDate?: string; // Date excluded from VAT register (if any)
  isConstruction?: boolean; // Construction services reverse-charge flag
  checkedAt: string; // ISO timestamp of last check
}

export interface VidSuspendedStatus {
  isSuspended: boolean; // Whether business operations are currently suspended
  companyName?: string; // Name from VID register
  decisionDate?: string; // Date of suspension decision
  suspendedFrom?: string; // Prohibited from doing business from
  suspendedUntil?: string; // Prohibited from doing business until
  restorationDate?: string; // Date operations were restored (if any)
  checkedAt: string; // ISO timestamp of last check
}

// ─── Contacts (Customers & Vendors) ─────────────────────────

export interface Contact extends BaseEntity {
  contactNumber?: string;
  type: 'customer' | 'vendor' | 'both';
  name: string;
  shortName?: string; // Display name / "known as" — auto-generated from official name
  registrationNumber?: string;
  vatNumber?: string;
  email?: string;
  phone?: string;
  address: Address;
  bankAccount?: BankAccount;
  paymentTermsDays: number;
  notes?: string;
  // VID (Latvian Tax Authority) enrichment — populated via "Verify contact"
  vidVatStatus?: VidVatStatus;
  vidSuspendedStatus?: VidSuspendedStatus;
}

// ─── Invoices ───────────────────────────────────────────────

export interface Invoice extends BaseEntity {
  docType: 'invoice';
  invoiceNumber: string; // ERA internal number (INV-00001, PINV-00002)
  vendorInvoiceNumber?: string; // Original invoice number from vendor/supplier
  type: 'sales' | 'purchase';
  contactId: string;
  contactName: string;
  date: string;
  dueDate: string;
  lines: InvoiceLine[];
  subtotal: number;
  vatAmount: number;
  total: number;
  amountPaid: number;
  status: 'draft' | 'posted' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  currency: string; // ISO 4217 (default "EUR")
  exchangeRate?: number; // override rate (transaction → EUR); omit = system rate
  // Latvian source document requirements (Section 7)
  documentNumber: string; // registration number
  documentDate: string;
  // GL posting references
  journalEntryId?: string;
  reversalJournalEntryId?: string;
  paymentJournalEntryIds: string[];
  // Recognition metadata
  recognitionConfidence?: 'high' | 'medium' | 'low';
  sourceFile?: string; // original filename
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number; // 0, 5, 12, or 21
  vatAmount: number;
  lineTotal: number;
  accountCode: string; // GL account for this line
  itemId?: string;
}

// ─── Payments ───────────────────────────────────────────────

export interface Payment extends BaseEntity {
  docType: 'payment';
  paymentNumber?: string;
  type: 'incoming' | 'outgoing';
  contactId: string;
  contactName: string;
  date: string;
  amount: number;
  currency: string; // ISO 4217 (default "EUR")
  exchangeRate?: number; // override rate (transaction → EUR); omit = system rate
  bankAccountIban: string;
  reference: string;
  invoiceAllocations: PaymentAllocation[];
  journalEntryId?: string;
  status: 'draft' | 'posted';
}

export interface PaymentAllocation {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}

// ─── Inventory ──────────────────────────────────────────────

export interface Item extends BaseEntity {
  docType: 'item';
  code: string;
  name: string;
  description?: string;
  type: 'product' | 'service';
  unitOfMeasure: string;
  costPrice: number;
  sellingPrice: number;
  vatRate: number; // default VAT rate for this item
  quantityOnHand: number; // 0 for services
  purchaseAccountCode: string; // default GL account for purchases
  salesAccountCode: string; // default GL account for sales
}

export interface StockMovement extends BaseEntity {
  docType: 'stock-movement';
  itemId: string;
  itemCode: string;
  type: 'purchase_receipt' | 'sales_delivery' | 'adjustment';
  quantity: number; // positive = in, negative = out
  unitCost: number;
  totalCost: number;
  sourceType: 'invoice' | 'manual';
  sourceId?: string;
  date: string;
  balanceAfter: number;
}

// ─── VAT ────────────────────────────────────────────────────

export interface VatReturn extends BaseEntity {
  docType: 'vat-return';
  period: string; // "2026-03"
  startDate: string;
  endDate: string;
  outputVat: number; // VAT on sales
  inputVat: number; // VAT on purchases
  vatPayable: number; // output - input
  status: 'draft' | 'submitted' | 'accepted';
  lines: VatReturnLine[];
}

export interface VatReturnLine {
  vatRate: number;
  taxableAmount: number;
  vatAmount: number;
  type: 'output' | 'input';
}

// ─── Agent ──────────────────────────────────────────────────

export interface AgentAction extends BaseEntity {
  agentType: 'orchestrator' | 'finance' | 'purchase' | 'sales';
  action: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  isApprovalRequired: boolean;
  approvedBy?: string;
  approvedAt?: string;
  error?: string;
}

export interface ChatMessage {
  id: string;
  companyId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  agentType?: string;
  actionId?: string;
}

// ─── Business Events (immutable audit log) ──────────────────

export interface BusinessEvent {
  id: string;
  companyId: string;
  type: string; // e.g. "invoice.posted", "payment.applied", "entry.reversed"
  timestamp: string;
  actor: string; // userId or "system"
  documentType?: string; // "invoice" | "payment" | "journal-entry" | "item"
  documentId?: string;
  journalEntryId?: string;
  data?: Record<string, unknown>;
  // OpenTelemetry trace ID — when present, ties this event back to the request
  // / chat / tool-call span tree in Application Insights. Always undefined in
  // local dev and tests where telemetry is disabled.
  traceId?: string;
}

// ─── Posting Rules (configurable per country) ───────────────

export type PostingRuleCondition = {
  field: string; // e.g. "invoice.type", "line.vatRate"
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'in' | 'exists';
  value: unknown;
};

export interface PostingRuleLine {
  accountCode: string;
  accountName: string;
  side: 'debit' | 'credit';
  amountExpr: string; // e.g. "invoice.total", "line.netAmount", "line.vatAmount"
  description?: string;
  taxCode?: string;
}

export interface PostingRule {
  id: string;
  country: string; // ISO 3166-1 alpha-2
  documentType:
    | 'sales-invoice'
    | 'purchase-invoice'
    | 'incoming-payment'
    | 'outgoing-payment'
    | 'manual-entry'
    | 'fx-revaluation';
  name: string;
  description: string;
  version: number;
  conditions: PostingRuleCondition[];
  lines: PostingRuleLine[];
  effectiveFrom: string; // ISO date
  effectiveTo?: string; // null = current
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  source?: string; // High-level legal source, e.g. "LV-Cabinet-Regulation-775-2015"
  legalBasis?: string[]; // Specific paragraph citations for auditability, e.g. ["Reg 775 §50", "Reg 775 §52"]
}

// ─── PEPPOL e-invoicing (BIS Billing 3.0) ───────────────────
//
// PEPPOL B2G is mandatory in Latvia since 1 January 2026 (Cabinet
// Regulation No. 879). era's outbox-and-dispatch model lets you swap the
// AccessPoint provider (Storecove, Tickstar, …) without touching the UBL
// generation or the persistence layer.

export type PeppolOutboxStatus =
  | 'pending' // UBL built, not yet handed to AccessPoint
  | 'sending' // AccessPoint call in flight
  | 'sent' // AccessPoint accepted the document
  | 'acknowledged' // Recipient AccessPoint acknowledged delivery (MLR)
  | 'failed' // Permanent failure — see lastError
  | 'cancelled'; // Manually cancelled before send

export interface PeppolOutboxEntry extends BaseEntity {
  docType: 'peppol-outbox';
  invoiceId: string;
  invoiceNumber: string;
  direction: 'outbound' | 'inbound';
  status: PeppolOutboxStatus;
  // Document body — UBL 2.1 BIS Billing 3.0 XML.
  ubl: string;
  // PEPPOL identification
  supplierEndpoint: { schemeID: string; value: string };
  customerEndpoint: { schemeID: string; value: string };
  // Provider tracking
  provider: string; // "noop" | "mock" | "storecove" | "tickstar"
  providerMessageId?: string;
  // Retry bookkeeping
  attempts: number;
  lastAttemptAt?: string;
  lastError?: { code: string; message: string };
  // Lifecycle
  sentAt?: string;
  acknowledgedAt?: string;
}

// ─── VID submission (Latvian Tax Authority) ─────────────────
//
// VID accepts the monthly VAT declaration (PVN deklarācija) via its EDS
// portal. era generates the declaration locally; the VidSubmission
// entity tracks state of an attempt to push it to VID. With creds
// missing, the MockVidClient writes the payload to disk and marks the
// submission acknowledged so end-to-end flows can be exercised.

export type VidSubmissionStatus =
  | 'draft' // Generated, not yet submitted
  | 'queued' // Awaiting first attempt
  | 'submitting' // Submission in flight
  | 'accepted' // VID accepted (success)
  | 'rejected' // VID rejected with validation errors (do not retry)
  | 'failed' // Transient failure — eligible for retry
  | 'cancelled'; // Manually cancelled

export type VidDocumentKind = 'pvn-declaration' | 'annual-report';

export interface VidSubmissionAttempt {
  attemptedAt: string;
  outcome: 'accepted' | 'rejected' | 'failed';
  // Provider/transport response — populated when available.
  responseCode?: string;
  responseMessage?: string;
  // Validation errors from VID, if any.
  validationErrors?: Array<{ field?: string; code: string; message: string }>;
}

export interface VidSubmission extends BaseEntity {
  docType: 'vid-submission';
  kind: VidDocumentKind;
  // Period the document covers — for PVN: "2026-04"; for annual: "2026".
  period: string;
  // Reference to the source data — e.g. monthly VAT declaration is
  // re-derivable from year/month + companyId; annual report from year.
  sourcePeriod: { year: number; month?: number };
  status: VidSubmissionStatus;
  payload: { contentType: 'application/xml' | 'application/json'; body: string };
  attempts: VidSubmissionAttempt[];
  maxAttempts: number; // capped retry count (default 5)
  nextAttemptAt?: string; // exponential backoff schedule
  receiptId?: string; // VID-issued confirmation number once accepted
  acknowledgedAt?: string;
  provider: string; // "noop" | "mock" | "vid-eds"
}

// ─── Annual report sign-off ─────────────────────────────────
//
// A locked annual report is one that has been signed off by management
// and is ready for VID submission / publication. Locking freezes the
// underlying period (no further postings) and stamps the signatory
// metadata required by the Annual Reports Law (signatory name, role,
// signing date).

export type AnnualReportLockStatus = 'unlocked' | 'locked' | 'submitted';

export interface AnnualReportApproval extends BaseEntity {
  docType: 'annual-report-approval';
  fiscalYear: number;
  status: AnnualReportLockStatus;
  // Sign-off metadata
  signatoryName?: string;
  signatoryRole?: string; // e.g. "Valdes loceklis"
  signatoryRegistrationNumber?: string;
  signedAt?: string;
  // Snapshot of the report at sign-off time — used to detect drift if
  // someone re-runs the generator after locking.
  snapshotHash?: string;
  // VID submission reference, when submitted.
  vidSubmissionId?: string;
  submittedAt?: string;
}

// ─── Feedback / Dev Tasks ───────────────────────────────────

export interface Feedback {
  id: string;
  page: string;
  message: string;
  status: 'open' | 'in-progress' | 'done' | 'dismissed';
  submittedBy: string;
  submittedAt: string;
  resolvedAt?: string;
  companyId?: string;
}

// ─── Auth / User ────────────────────────────────────────────

export interface UserProfile {
  id: string; // provider UID
  email: string;
  displayName: string;
  photoUrl?: string;
  provider: 'google' | 'microsoft';
  companies: UserCompanyRole[];
  createdAt: string;
  lastLoginAt: string;
}

export interface UserCompanyRole {
  companyId: string;
  companyName: string;
  role: 'owner' | 'accountant' | 'viewer';
  sharedBy?: string; // userId of the user who shared this company (absent for owners)
  sharedAt?: string; // ISO timestamp when access was granted
}

// ─── Company Sharing ────────────────────────────────────────

export interface CompanySharingEntry {
  userId: string;
  email: string;
  displayName: string;
  role: 'accountant' | 'viewer';
  sharedBy: string;
  sharedAt: string;
}

// ─── Fiscal Period ──────────────────────────────────────────

export interface FiscalPeriod {
  id: string;
  companyId: string;
  docType: 'fiscal-period';
  period: string; // "2026-03"
  status: 'open' | 'closed';
  closedBy?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Period Close Runs ──────────────────────────────────────

export interface PeriodCloseStep {
  name: string;
  status: 'completed' | 'skipped' | 'failed';
  detail: string;
  error?: string;
  journalEntryIds?: string[];
}

export interface PeriodCloseRun {
  id: string;
  companyId: string;
  docType: 'period-close-run';
  type: 'month-end' | 'year-end' | 'vat-return';
  period?: string; // "2026-03" for month-end
  fiscalYear?: number; // 2025 for year-end
  steps: PeriodCloseStep[];
  closingEntryId?: string; // year-end closing journal entry
  netResult?: number; // year-end P&L transfer amount
  status: 'completed' | 'partial' | 'failed';
  startedBy: string;
  startedAt: string;
  completedAt: string;
}

// ─── Shared ─────────────────────────────────────────────────

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
  country: string; // ISO 3166-1 alpha-2
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  continuationToken?: string;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: ApiError;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string>[];
}

// ─── Agent-Ready Operation Results ──────────────────────────
// Structured response types that agents can parse unambiguously.
// Every mutating operation should return an OperationResult so agents know:
// 1. What was done (operation)
// 2. What entity was affected (entityType + entityId)
// 3. What state it's in (status)
// 4. What to do next (suggestedActions)

export interface OperationResult {
  operation: 'create' | 'update' | 'delete' | 'post' | 'reverse' | 'close' | 'match' | 'execute';
  entityType:
    | 'company'
    | 'invoice'
    | 'payment'
    | 'contact'
    | 'item'
    | 'journal-entry'
    | 'fixed-asset'
    | 'bank-reconciliation'
    | 'recurring-template'
    | 'period'
    | 'vat-return';
  entityId: string;
  status: 'success' | 'partial' | 'failed';
  message: string;
  /** IDs of related entities affected by this operation */
  relatedEntities?: { type: string; id: string; description?: string }[];
  /** Next actions the agent can take on this entity */
  suggestedActions?: string[];
}

// ─── Agent Task Definition ──────────────────────────────────
// Structure for defining agent-executable tasks.

export interface AgentTask {
  id: string;
  type: 'invoice' | 'payment' | 'journal-entry' | 'period-close' | 'report' | 'reconciliation';
  intent: string; // Natural language description of what to do
  parameters: Record<string, unknown>; // Structured parameters for the operation
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'requires-approval';
  createdAt: string;
  completedAt?: string;
  result?: OperationResult;
  companyId: string;
}
