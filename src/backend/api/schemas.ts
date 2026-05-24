// Zod schemas for API request body validation
// Used with the validate() middleware at route entry points

import { z } from 'zod';
import {
  AccountCode,
  ISODate,
  MoneyAmount,
  FiscalPeriodFormat,
  CurrencyCode,
} from '@shared/types/data-types';

// ─── Company ────────────────────────────────────────────────

export const CreateCompanySchema = z
  .object({
    name: z.string().min(1).max(200),
    code: z
      .string()
      .regex(/^[A-Z0-9]{1,5}$/)
      .optional(),
    registrationNumber: z.string().max(20).optional(),
    vatNumber: z.string().max(20).optional(),
    legalAddress: z
      .object({
        street: z.string().max(200).optional(),
        city: z.string().max(100).optional(),
        postalCode: z.string().max(20).optional(),
        country: z.string().max(2).optional(),
      })
      .optional(),
    country: z.string().max(2).optional(),
  })
  .strict();

export const UpdateCompanySchema = CreateCompanySchema.partial();

// ─── Journal Entry ──────────────────────────────────────────

const JournalLineSchema = z.object({
  accountCode: AccountCode,
  debit: MoneyAmount.optional(),
  credit: MoneyAmount.optional(),
  description: z.string().max(500).optional(),
  contactId: z.string().optional(),
  taxCode: z.string().optional(),
  currencyCode: CurrencyCode.optional(),
  exchangeRate: z.number().positive().optional(),
});

export const PostJournalEntrySchema = z.object({
  date: ISODate,
  description: z.string().min(1).max(500),
  lines: z.array(JournalLineSchema).min(2),
  sourceType: z.string().optional(),
  sourceId: z.string().optional(),
  period: FiscalPeriodFormat.optional(),
});

// ─── Invoice ────────────────────────────────────────────────

const InvoiceLineSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPrice: MoneyAmount,
  vatRate: z.number().min(0).max(100),
  accountCode: AccountCode.optional(),
  itemCode: z.string().optional(),
});

export const CreateInvoiceSchema = z.object({
  type: z.enum(['sales', 'purchase']),
  contactId: z.string().min(1),
  contactName: z.string().min(1).max(200),
  date: ISODate,
  dueDate: ISODate.optional(),
  lines: z.array(InvoiceLineSchema).min(1),
  reference: z.string().max(100).optional(),
  vendorInvoiceNumber: z.string().max(50).optional(),
  currencyCode: CurrencyCode.optional(),
  exchangeRate: z.number().positive().optional(),
});

// ─── Payment ────────────────────────────────────────────────

export const CreatePaymentSchema = z.object({
  type: z.enum(['incoming', 'outgoing']),
  contactId: z.string().min(1),
  contactName: z.string().min(1).max(200),
  date: ISODate,
  amount: z.number().positive(),
  bankAccountIban: z.string().max(34).optional(),
  reference: z.string().max(100).optional(),
  invoiceAllocations: z
    .array(
      z.object({
        invoiceId: z.string().min(1),
        invoiceNumber: z.string().min(1),
        amount: z.number().positive(),
      }),
    )
    .optional()
    .default([]),
  currencyCode: CurrencyCode.optional(),
  exchangeRate: z.number().positive().optional(),
});

// ─── Contact ────────────────────────────────────────────────

export const CreateContactSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['customer', 'vendor', 'both']).optional(),
  registrationNumber: z.string().max(20).optional(),
  vatNumber: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  address: z
    .object({
      line1: z.string().max(500).optional(),
      line2: z.string().max(500).optional(),
      city: z.string().max(100).optional(),
      postalCode: z.string().max(20).optional(),
      country: z.string().max(100).optional(),
    })
    .optional(),
  bankAccount: z
    .object({
      iban: z.string().max(34),
      swift: z.string().max(11).optional(),
      bankName: z.string().max(200).optional(),
    })
    .optional(),
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  notes: z.string().max(2000).optional(),
});

// ─── Item ───────────────────────────────────────────────────

export const CreateItemSchema = z.object({
  code: z.string().min(1).max(20).optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  unitOfMeasure: z.string().max(20).optional(),
  sellingPrice: MoneyAmount.optional(),
  purchasePrice: MoneyAmount.optional(),
  vatRate: z.number().min(0).max(100).optional(),
  revenueAccountCode: AccountCode.optional(),
  expenseAccountCode: AccountCode.optional(),
});

// ─── Feedback ───────────────────────────────────────────────

export const SubmitFeedbackSchema = z.object({
  page: z.string().max(200),
  message: z.string().min(1).max(2000),
  companyId: z.string().optional(),
});

// ─── Fixed Asset ────────────────────────────────────────────

export const AcquireAssetSchema = z.object({
  name: z.string().min(1).max(200),
  assetAccountCode: AccountCode,
  depreciationAccountCode: AccountCode,
  expenseAccountCode: AccountCode,
  acquisitionDate: ISODate,
  acquisitionCost: z.number().positive(),
  usefulLifeMonths: z.number().int().positive(),
  residualValue: MoneyAmount.optional(),
  depreciationMethod: z.enum(['straight-line']).optional(),
});

// ─── PEPPOL ─────────────────────────────────────────────────

export const DispatchPeppolSchema = z.object({
  invoiceId: z.string().min(1),
});

// ─── Annual report sign-off ─────────────────────────────────

export const LockAnnualReportSchema = z.object({
  signatoryName: z.string().min(1).max(200),
  signatoryRole: z.string().min(1).max(200),
  signatoryRegistrationNumber: z.string().max(50).optional(),
});

// ─── VID submission ─────────────────────────────────────────

export const SubmitVidSchema = z.object({
  kind: z.enum(['pvn-declaration', 'annual-report']),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).optional(),
});
