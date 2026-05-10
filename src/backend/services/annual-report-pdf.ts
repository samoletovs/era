// Annual report polish — formatter, PDF renderer, and sign-off lock
// =============================================================
//
// Three layers, each testable in isolation:
//
//   1. `formatAnnualReport()`  — pure function that converts an
//      `AnnualReport` into a structured `FormattedAnnualReport` ready
//      for rendering. Takes a locale ("en" | "lv") and a number
//      formatter.
//
//   2. `renderAnnualReportPdf()` — wraps the formatted structure into a
//      PDFKit document. Not unit-tested at the byte level (flaky); the
//      formatter shape is what matters.
//
//   3. `lockAnnualReport()` / `unlockAnnualReport()` — pure state
//      machine over `AnnualReportApproval`. Captures a snapshot hash
//      so callers can detect drift if someone re-runs the generator
//      after lock.

import PDFDocument from 'pdfkit';

import type { AnnualReportApproval, AnnualReportLockStatus } from '@shared/types';
import type { AnnualReport } from './reporting.js';

// ─── Formatter ───────────────────────────────────────────────

export type AnnualReportLocale = 'en' | 'lv';

export interface FormattedRow {
  label: string;
  amount: number;
  /** True if this row is a subtotal — usually rendered bolder and with a top rule. */
  isTotal?: boolean;
  /** Indentation level (0 = top, 1 = sub-line). */
  indent?: number;
}

export interface FormattedSection {
  title: string;
  rows: FormattedRow[];
  total?: { label: string; amount: number };
}

export interface FormattedSignaturePage {
  /** "Signed by" label. */
  signedByLabel: string;
  /** "Date" label. */
  dateLabel: string;
  /** "Role" / position label. */
  roleLabel: string;
  /** "Signature" label (printed above the line). */
  signatureLabel: string;
  /** Statutory line printed at the foot. */
  statutoryLine: string;
}

export interface FormattedAnnualReport {
  title: string;
  companyName: string;
  registrationNumber: string;
  fiscalYear: number;
  periodLabel: string;
  balanceSheet: FormattedSection;
  profitAndLoss: FormattedSection;
  signaturePage: FormattedSignaturePage;
  /** Stable, locale-independent canonical hash of the underlying report. */
  snapshotHash: string;
  /** Locked / signed-off marker — when set, watermarks the PDF. */
  lockBanner?: string;
}

const I18N: Record<
  AnnualReportLocale,
  {
    title: string;
    period: (year: number) => string;
    balanceSheet: string;
    profitLoss: string;
    longTermAssets: string;
    currentAssets: string;
    totalAssets: string;
    equity: string;
    longTermLiabilities: string;
    currentLiabilities: string;
    totalEquityAndLiabilities: string;
    netTurnover: string;
    costOfGoodsSold: string;
    grossProfit: string;
    sellingExpenses: string;
    administrativeExpenses: string;
    otherIncome: string;
    financialExpenses: string;
    profitBeforeTax: string;
    corporateIncomeTax: string;
    netProfit: string;
    signaturePageTitle: string;
    signedBy: string;
    date: string;
    role: string;
    signature: string;
    statutoryLine: string;
    lockedBanner: string;
  }
> = {
  en: {
    title: 'Annual report',
    period: (year) => `Fiscal year ${year} (1 Jan – 31 Dec)`,
    balanceSheet: 'Balance sheet',
    profitLoss: 'Profit and loss',
    longTermAssets: 'Long-term assets',
    currentAssets: 'Current assets',
    totalAssets: 'Total assets',
    equity: 'Equity',
    longTermLiabilities: 'Long-term liabilities',
    currentLiabilities: 'Current liabilities',
    totalEquityAndLiabilities: 'Total equity and liabilities',
    netTurnover: 'Net turnover',
    costOfGoodsSold: 'Cost of goods sold',
    grossProfit: 'Gross profit',
    sellingExpenses: 'Selling expenses',
    administrativeExpenses: 'Administrative expenses',
    otherIncome: 'Other operating income',
    financialExpenses: 'Financial expenses',
    profitBeforeTax: 'Profit before tax',
    corporateIncomeTax: 'Corporate income tax',
    netProfit: 'Net profit',
    signaturePageTitle: 'Sign-off',
    signedBy: 'Signed by',
    date: 'Date',
    role: 'Position',
    signature: 'Signature',
    statutoryLine:
      'Prepared in accordance with the Annual Reports and Consolidated Annual Reports Law and Cabinet Regulation No. 775.',
    lockedBanner: 'LOCKED — sign-off complete',
  },
  lv: {
    title: 'Gada pārskats',
    period: (year) => `Pārskata gads ${year} (1. janvāris – 31. decembris)`,
    balanceSheet: 'Bilance',
    profitLoss: 'Peļņas vai zaudējumu aprēķins',
    longTermAssets: 'Ilgtermiņa ieguldījumi',
    currentAssets: 'Apgrozāmie līdzekļi',
    totalAssets: 'Aktīvu kopsumma',
    equity: 'Pašu kapitāls',
    longTermLiabilities: 'Ilgtermiņa kreditori',
    currentLiabilities: 'Īstermiņa kreditori',
    totalEquityAndLiabilities: 'Pašu kapitāla un saistību kopsumma',
    netTurnover: 'Neto apgrozījums',
    costOfGoodsSold: 'Pārdotās produkcijas izmaksas',
    grossProfit: 'Bruto peļņa',
    sellingExpenses: 'Pārdošanas izmaksas',
    administrativeExpenses: 'Administrācijas izmaksas',
    otherIncome: 'Pārējie saimnieciskās darbības ieņēmumi',
    financialExpenses: 'Procentu maksājumi un tamlīdzīgas izmaksas',
    profitBeforeTax: 'Peļņa vai zaudējumi pirms uzņēmumu ienākuma nodokļa',
    corporateIncomeTax: 'Uzņēmumu ienākuma nodoklis',
    netProfit: 'Pārskata gada peļņa vai zaudējumi',
    signaturePageTitle: 'Apstiprinājums',
    signedBy: 'Parakstītājs',
    date: 'Datums',
    role: 'Amats',
    signature: 'Paraksts',
    statutoryLine:
      'Sagatavots saskaņā ar Gada pārskatu un konsolidēto gada pārskatu likumu un Ministru kabineta noteikumiem Nr. 775.',
    lockedBanner: 'BLOĶĒTS — apstiprinājums veikts',
  },
};

// ─── Hash ────────────────────────────────────────────────────

/**
 * Stable, deterministic snapshot hash of the structural content of an
 * annual report. Uses canonical JSON of the formatted balance-sheet
 * and P&L numbers — purely amounts, no titles or locale text. Allows
 * us to detect "the underlying numbers changed after sign-off" without
 * being noisy about cosmetic re-renders.
 *
 * Implementation note: we use a non-cryptographic FNV-1a hash to keep
 * this dependency-free. The goal is drift detection, not security; if
 * a stronger guarantee is needed later, swap to crypto.subtle.
 */
export function computeSnapshotHash(report: AnnualReport): string {
  const canonical = JSON.stringify(canonicalForHash(report));
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function canonicalForHash(report: AnnualReport): unknown {
  // Strip company-name fields; pick numbers only.
  return {
    fy: report.fiscalYear,
    bs: {
      la: round2(report.balanceSheetLv.longTermAssets),
      ca: round2(report.balanceSheetLv.currentAssets),
      ta: round2(report.balanceSheetLv.totalAssets),
      eq: round2(report.balanceSheetLv.equity),
      ll: round2(report.balanceSheetLv.longTermLiabilities),
      cl: round2(report.balanceSheetLv.currentLiabilities),
      tel: round2(report.balanceSheetLv.totalEquityAndLiabilities),
    },
    pl: {
      nt: round2(report.profitAndLossLv.netTurnover),
      cogs: round2(report.profitAndLossLv.costOfGoodsSold),
      gp: round2(report.profitAndLossLv.grossProfit),
      se: round2(report.profitAndLossLv.sellingExpenses),
      ae: round2(report.profitAndLossLv.administrativeExpenses),
      oi: round2(report.profitAndLossLv.otherIncome),
      fe: round2(report.profitAndLossLv.financialExpenses),
      pbt: round2(report.profitAndLossLv.profitBeforeTax),
      cit: round2(report.profitAndLossLv.corporateIncomeTax),
      np: round2(report.profitAndLossLv.netProfit),
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Format ──────────────────────────────────────────────────

export interface FormatOptions {
  locale?: AnnualReportLocale;
  /** Pre-existing approval (locked / unlocked) — adds a banner if present. */
  approval?: AnnualReportApproval | null;
}

export function formatAnnualReport(
  report: AnnualReport,
  opts: FormatOptions = {},
): FormattedAnnualReport {
  const locale = opts.locale ?? 'lv';
  const dict = I18N[locale];

  const bs = report.balanceSheetLv;
  const pl = report.profitAndLossLv;

  const balanceSheet: FormattedSection = {
    title: dict.balanceSheet,
    rows: [
      { label: dict.longTermAssets, amount: bs.longTermAssets },
      { label: dict.currentAssets, amount: bs.currentAssets },
      { label: dict.totalAssets, amount: bs.totalAssets, isTotal: true },
      { label: dict.equity, amount: bs.equity },
      { label: dict.longTermLiabilities, amount: bs.longTermLiabilities },
      { label: dict.currentLiabilities, amount: bs.currentLiabilities },
      {
        label: dict.totalEquityAndLiabilities,
        amount: bs.totalEquityAndLiabilities,
        isTotal: true,
      },
    ],
  };

  const profitAndLoss: FormattedSection = {
    title: dict.profitLoss,
    rows: [
      { label: dict.netTurnover, amount: pl.netTurnover },
      { label: dict.costOfGoodsSold, amount: -Math.abs(pl.costOfGoodsSold) },
      { label: dict.grossProfit, amount: pl.grossProfit, isTotal: true },
      { label: dict.sellingExpenses, amount: -Math.abs(pl.sellingExpenses) },
      { label: dict.administrativeExpenses, amount: -Math.abs(pl.administrativeExpenses) },
      { label: dict.otherIncome, amount: pl.otherIncome },
      { label: dict.financialExpenses, amount: -Math.abs(pl.financialExpenses) },
      { label: dict.profitBeforeTax, amount: pl.profitBeforeTax, isTotal: true },
      { label: dict.corporateIncomeTax, amount: -Math.abs(pl.corporateIncomeTax) },
      { label: dict.netProfit, amount: pl.netProfit, isTotal: true },
    ],
  };

  const isLocked = opts.approval?.status === 'locked' || opts.approval?.status === 'submitted';

  return {
    title: dict.title,
    companyName: report.companyName,
    registrationNumber: report.registrationNumber,
    fiscalYear: report.fiscalYear,
    periodLabel: dict.period(report.fiscalYear),
    balanceSheet,
    profitAndLoss,
    signaturePage: {
      signedByLabel: dict.signedBy,
      dateLabel: dict.date,
      roleLabel: dict.role,
      signatureLabel: dict.signature,
      statutoryLine: dict.statutoryLine,
    },
    snapshotHash: computeSnapshotHash(report),
    lockBanner: isLocked ? dict.lockedBanner : undefined,
  };
}

// ─── Sign-off state machine ──────────────────────────────────

export interface LockArgs {
  approval: AnnualReportApproval;
  report: AnnualReport;
  signatoryName: string;
  signatoryRole: string;
  signatoryRegistrationNumber?: string;
  signedAt: string;
}

export class LockError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'LockError';
  }
}

export function lockAnnualReport(args: LockArgs): AnnualReportApproval {
  const { approval, report, signatoryName, signatoryRole, signedAt } = args;
  if (approval.status === 'locked' || approval.status === 'submitted') {
    throw new LockError(
      'ALREADY_LOCKED',
      `Annual report for FY ${approval.fiscalYear} is already ${approval.status}`,
    );
  }
  if (!signatoryName.trim()) {
    throw new LockError('MISSING_SIGNATORY', 'signatoryName is required');
  }
  if (!signatoryRole.trim()) {
    throw new LockError('MISSING_ROLE', 'signatoryRole is required');
  }
  if (approval.fiscalYear !== report.fiscalYear) {
    throw new LockError(
      'FISCAL_YEAR_MISMATCH',
      `Approval is for FY ${approval.fiscalYear} but report is for FY ${report.fiscalYear}`,
    );
  }
  return {
    ...approval,
    status: 'locked',
    signatoryName: signatoryName.trim(),
    signatoryRole: signatoryRole.trim(),
    signatoryRegistrationNumber: args.signatoryRegistrationNumber?.trim() || undefined,
    signedAt,
    snapshotHash: computeSnapshotHash(report),
    updatedAt: signedAt,
  };
}

export function unlockAnnualReport(
  approval: AnnualReportApproval,
  now: string,
): AnnualReportApproval {
  if (approval.status === 'submitted') {
    throw new LockError(
      'ALREADY_SUBMITTED',
      `Annual report for FY ${approval.fiscalYear} has been submitted to VID — cannot unlock`,
    );
  }
  return {
    ...approval,
    status: 'unlocked',
    signatoryName: undefined,
    signatoryRole: undefined,
    signatoryRegistrationNumber: undefined,
    signedAt: undefined,
    snapshotHash: undefined,
    updatedAt: now,
  };
}

export function markSubmittedToVid(
  approval: AnnualReportApproval,
  vidSubmissionId: string,
  submittedAt: string,
): AnnualReportApproval {
  if (approval.status !== 'locked') {
    throw new LockError(
      'NOT_LOCKED',
      `Annual report must be locked before submission; current status: ${approval.status}`,
    );
  }
  return {
    ...approval,
    status: 'submitted',
    vidSubmissionId,
    submittedAt,
    updatedAt: submittedAt,
  };
}

export function statusTransitions(): Record<AnnualReportLockStatus, AnnualReportLockStatus[]> {
  return {
    unlocked: ['locked'],
    locked: ['unlocked', 'submitted'],
    submitted: [], // terminal
  };
}

// ─── PDF renderer ────────────────────────────────────────────

export interface RenderPdfOptions {
  /** Page margin in points; default 50 (matches invoice PDF). */
  margin?: number;
}

const A4_WIDTH = 595.28;

/** Render a FormattedAnnualReport to a PDF buffer using PDFKit. */
export function renderAnnualReportPdf(
  formatted: FormattedAnnualReport,
  options: RenderPdfOptions = {},
): Promise<Buffer> {
  const margin = options.margin ?? 50;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const innerWidth = A4_WIDTH - 2 * margin;

    // ─── Header ─────────────────────────────────────────
    doc.fontSize(20).font('Helvetica-Bold').text(formatted.companyName);
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#666666')
      .text(`Reg. Nr. ${formatted.registrationNumber}`);
    doc.moveDown(1);

    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1C1C1C').text(formatted.title);
    doc.fontSize(10).font('Helvetica').fillColor('#333333').text(formatted.periodLabel);

    if (formatted.lockBanner) {
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0A6F00').text(formatted.lockBanner);
      doc.fillColor('#333333');
    }

    doc.moveDown(1.5);

    // ─── Section renderer ───────────────────────────────
    const renderSection = (section: FormattedSection): void => {
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#1C1C1C').text(section.title);
      doc.moveDown(0.5);
      for (const row of section.rows) {
        const indent = (row.indent ?? 0) * 12;
        const labelX = margin + indent;
        const labelWidth = innerWidth - 100 - indent;
        const amountX = margin + innerWidth - 100;
        const y = doc.y;
        if (row.isTotal) {
          doc
            .moveTo(margin, y - 2)
            .lineTo(margin + innerWidth, y - 2)
            .strokeColor('#CCCCCC')
            .stroke();
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#1C1C1C');
        } else {
          doc.fontSize(10).font('Helvetica').fillColor('#333333');
        }
        doc.text(row.label, labelX, y, { width: labelWidth });
        doc.text(formatMoney(row.amount), amountX, y, { width: 100, align: 'right' });
        doc.y = y + 14;
      }
      doc.moveDown(1);
    };

    renderSection(formatted.balanceSheet);
    renderSection(formatted.profitAndLoss);

    // ─── Signature page ─────────────────────────────────
    doc.addPage();
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1C1C1C').text('');
    doc.moveDown(2);

    doc.fontSize(10).font('Helvetica').fillColor('#333333');
    const sig = formatted.signaturePage;
    const labelLine = (label: string) => {
      doc.font('Helvetica-Bold').text(`${label}:`);
      doc.font('Helvetica').text('');
      doc.moveDown(0.5);
      doc
        .moveTo(margin, doc.y)
        .lineTo(margin + innerWidth - 100, doc.y)
        .strokeColor('#888888')
        .stroke();
      doc.moveDown(1.5);
    };

    labelLine(sig.signedByLabel);
    labelLine(sig.roleLabel);
    labelLine(sig.dateLabel);
    labelLine(sig.signatureLabel);

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#888888').text(sig.statutoryLine, { width: innerWidth });
    doc.moveDown(0.5);
    doc.fontSize(7).fillColor('#AAAAAA').text(`snapshot: ${formatted.snapshotHash}`);

    doc.end();
  });
}

function formatMoney(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  // Thousands separator: non-breaking space (Latvian convention).
  const fixed = abs.toFixed(2);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  return `${sign}${grouped},${frac} EUR`;
}
