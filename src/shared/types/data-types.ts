// ERA — Standard Data Types (Zod schemas)
// Inspired by D365 F&O Extended Data Types (EDT).
// Use these as reusable building blocks in entity schemas.
// See docs/development-standards.md §3 for full reference.

import { z } from "zod";

// ─── Identifiers ────────────────────────────────────────────

/** UUID v4 primary / foreign key */
export const EntityId = z.string().uuid();

/** Short uppercase alphanumeric business code (1–5 chars, e.g. "DAIS") */
export const CompanyCode = z.string().regex(/^[A-Z0-9]{1,5}$/, "Company code must be 1-5 uppercase alphanumeric characters");

/** 4-digit numeric GL account code (e.g. "2210") */
export const AccountCode = z.string().regex(/^\d{4}$/, "Account code must be exactly 4 digits");

/** Tax rule identifier: {CountryCode}-{rate} (e.g. "LV-21") */
export const TaxCode = z.string().regex(/^[A-Z]{2}-\d+$/, "Tax code must be in format CC-rate (e.g. LV-21)");

// ─── Monetary ───────────────────────────────────────────────

/** Monetary amount — always round with roundCurrency() before storing */
export const MoneyAmount = z.number();

/** Percentage value (0–100) */
export const Percentage = z.number().min(0).max(100);

/** Exchange rate to base currency — positive, up to 6 decimal places */
export const ExchangeRate = z.number().positive();

// ─── Date & Time ────────────────────────────────────────────

/** Date-only string: YYYY-MM-DD */
export const ISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

/** Full ISO 8601 timestamp */
export const ISOTimestamp = z.string().datetime();

/** Fiscal period: YYYY-MM */
export const FiscalPeriodFormat = z.string().regex(/^\d{4}-\d{2}$/, "Period must be in YYYY-MM format");

// ─── Geography & Standards ──────────────────────────────────

/** ISO 3166-1 alpha-2 country code (e.g. "LV") */
export const CountryCode = z.string().regex(/^[A-Z]{2}$/, "Country code must be 2 uppercase letters (ISO 3166-1)");

/** ISO 4217 currency code (e.g. "EUR") */
export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/, "Currency code must be 3 uppercase letters (ISO 4217)");

// ─── Contact Information ────────────────────────────────────

/** RFC 5322 email address */
export const Email = z.string().email();

/** E.164 international phone number (e.g. "+37120000000") */
export const PhoneE164 = z.string().regex(/^\+\d{7,15}$/, "Phone must be in E.164 format (e.g. +37120000000)");

/** EU VAT number: country prefix + 5-12 digits (e.g. "LV40003000000") */
export const VATNumber = z.string().regex(/^[A-Z]{2}\d{5,12}$/, "VAT number must be country prefix + 5-12 digits");

/** Business registration number (country-specific) */
export const RegistrationNo = z.string().min(1).max(20);

// ─── Document Type Discriminators (for shared containers) ───

/** Discriminator for the `documents` container */
export const DocumentsDocType = z.enum(["invoice", "payment", "credit-note", "vat-return"]);

/** Discriminator for the `ledger` container */
export const LedgerDocType = z.enum(["account", "journal-entry", "fiscal-period"]);

/** Discriminator for the `inventory` container */
export const InventoryDocType = z.enum(["item", "stock-movement"]);

// ─── Status Enums ───────────────────────────────────────────

export const INVOICE_STATUSES = ["draft", "posted", "partially_paid", "paid", "overdue", "cancelled"] as const;
export const InvoiceStatus = z.enum(INVOICE_STATUSES);

export const JOURNAL_STATUSES = ["draft", "posted", "reversed"] as const;
export const JournalStatus = z.enum(JOURNAL_STATUSES);

export const PAYMENT_STATUSES = ["draft", "posted"] as const;
export const PaymentStatus = z.enum(PAYMENT_STATUSES);

export const PERIOD_STATUSES = ["open", "closed"] as const;
export const PeriodStatus = z.enum(PERIOD_STATUSES);

export const VAT_RETURN_STATUSES = ["draft", "submitted", "accepted"] as const;
export const VatReturnStatus = z.enum(VAT_RETURN_STATUSES);

export const AGENT_ACTION_STATUSES = ["pending", "approved", "rejected", "executed", "failed"] as const;
export const AgentActionStatus = z.enum(AGENT_ACTION_STATUSES);

// ─── Error Code Prefixes ────────────────────────────────────

export const ERROR_PREFIXES = {
  VALIDATION: "VAL",
  BUSINESS: "BIZ",
  FINANCIAL: "FIN",
  AUTH: "AUTH",
  SYSTEM: "SYS",
  DUPLICATE: "DUP",
} as const;

// ─── Type Exports ───────────────────────────────────────────

export type EntityIdType = z.infer<typeof EntityId>;
export type CompanyCodeType = z.infer<typeof CompanyCode>;
export type AccountCodeType = z.infer<typeof AccountCode>;
export type TaxCodeType = z.infer<typeof TaxCode>;
export type MoneyAmountType = z.infer<typeof MoneyAmount>;
export type ISODateType = z.infer<typeof ISODate>;
export type ISOTimestampType = z.infer<typeof ISOTimestamp>;
export type FiscalPeriodFormatType = z.infer<typeof FiscalPeriodFormat>;
export type CountryCodeType = z.infer<typeof CountryCode>;
export type CurrencyCodeType = z.infer<typeof CurrencyCode>;
export type DocumentsDocTypeType = z.infer<typeof DocumentsDocType>;
export type LedgerDocTypeType = z.infer<typeof LedgerDocType>;
export type InventoryDocTypeType = z.infer<typeof InventoryDocType>;
export type InvoiceStatusType = z.infer<typeof InvoiceStatus>;
export type JournalStatusType = z.infer<typeof JournalStatus>;
export type PaymentStatusType = z.infer<typeof PaymentStatus>;
