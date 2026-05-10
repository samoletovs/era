// Fixed-asset register printout
// =============================================================
//
// Three layers (mirrors annual-report-pdf):
//
//   1. `formatAssetRegister()`  — pure function, takes a list of
//      FixedAsset records and an as-of date and returns a
//      FormattedAssetRegister ready to render. Locale-aware.
//
//   2. `renderAssetRegisterPdf()` — wraps the formatted structure
//      into a landscape A4 PDF using PDFKit. Used by the
//      `GET /companies/:companyId/fixed-assets/register/pdf`
//      endpoint.
//
// Why landscape? The register has 7 columns (Code | Name |
// Acquired | Cost | Accum.dep | NBV | Status). In portrait this
// truncates name aggressively.

import PDFDocument from 'pdfkit';

import type { FixedAsset } from './fixed-assets.js';

export type AssetRegisterLocale = 'en' | 'lv';

export interface FormattedAssetRow {
  code: string;
  name: string;
  acquisitionDate: string;
  acquisitionCost: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  status: string;
  method: string;
}

export interface FormattedAssetRegister {
  title: string;
  companyName: string;
  asOfDate: string;
  asOfLabel: string;
  columns: {
    code: string;
    name: string;
    acquired: string;
    cost: string;
    accumulated: string;
    nbv: string;
    status: string;
    method: string;
  };
  rows: FormattedAssetRow[];
  totals: {
    cost: number;
    accumulated: number;
    nbv: number;
  };
  footer: string;
}

const I18N: Record<
  AssetRegisterLocale,
  {
    title: string;
    asOf: (date: string) => string;
    code: string;
    name: string;
    acquired: string;
    cost: string;
    accumulated: string;
    nbv: string;
    status: string;
    method: string;
    statusActive: string;
    statusFullyDepreciated: string;
    statusDisposed: string;
    methodStraightLine: string;
    methodDecliningBalance: string;
    footer: (n: number) => string;
  }
> = {
  en: {
    title: 'Fixed asset register',
    asOf: (date) => `As of ${date}`,
    code: 'Code',
    name: 'Asset',
    acquired: 'Acquired',
    cost: 'Cost',
    accumulated: 'Accum. dep.',
    nbv: 'Net book value',
    status: 'Status',
    method: 'Method',
    statusActive: 'Active',
    statusFullyDepreciated: 'Fully depreciated',
    statusDisposed: 'Disposed',
    methodStraightLine: 'Straight-line',
    methodDecliningBalance: 'Declining-balance',
    footer: (n) => `${n} asset${n === 1 ? '' : 's'} on register`,
  },
  lv: {
    title: 'Pamatlīdzekļu reģistrs',
    asOf: (date) => `Uz ${date}`,
    code: 'Kods',
    name: 'Pamatlīdzeklis',
    acquired: 'Iegādāts',
    cost: 'Iegādes vērtība',
    accumulated: 'Uzkrātais nolietojums',
    nbv: 'Atlikušā vērtība',
    status: 'Statuss',
    method: 'Metode',
    statusActive: 'Aktīvs',
    statusFullyDepreciated: 'Pilnīgi nolietots',
    statusDisposed: 'Atsavināts',
    methodStraightLine: 'Lineārā',
    methodDecliningBalance: 'Degresīvā',
    footer: (n) => `${n} pamatlīdzeklis reģistrā`,
  },
};

function statusLabel(asset: FixedAsset, t: (typeof I18N)['en']): string {
  switch (asset.status) {
    case 'active':
      return t.statusActive;
    case 'fully-depreciated':
      return t.statusFullyDepreciated;
    case 'disposed':
      return `${t.statusDisposed} ${asset.disposalDate ?? ''}`.trim();
    default:
      return asset.status;
  }
}

function methodLabel(asset: FixedAsset, t: (typeof I18N)['en']): string {
  return asset.depreciationMethod === 'declining-balance'
    ? t.methodDecliningBalance
    : t.methodStraightLine;
}

/**
 * Pure formatter — converts raw FixedAsset rows into a
 * FormattedAssetRegister. Sorted by code ascending. Excludes nothing
 * (callers can pre-filter).
 */
export function formatAssetRegister(
  assets: FixedAsset[],
  options: {
    companyName: string;
    asOfDate: string;
    locale?: AssetRegisterLocale;
  },
): FormattedAssetRegister {
  const locale: AssetRegisterLocale = options.locale ?? 'en';
  const t = I18N[locale];
  const sorted = [...assets].sort((a, b) => a.code.localeCompare(b.code));

  const rows: FormattedAssetRow[] = sorted.map((a) => ({
    code: a.code,
    name: a.name,
    acquisitionDate: a.acquisitionDate,
    acquisitionCost: a.acquisitionCost,
    accumulatedDepreciation: a.accumulatedDepreciation,
    netBookValue: a.netBookValue,
    status: statusLabel(a, t),
    method: methodLabel(a, t),
  }));

  const totals = rows.reduce(
    (acc, r) => ({
      cost: acc.cost + r.acquisitionCost,
      accumulated: acc.accumulated + r.accumulatedDepreciation,
      nbv: acc.nbv + r.netBookValue,
    }),
    { cost: 0, accumulated: 0, nbv: 0 },
  );

  return {
    title: t.title,
    companyName: options.companyName,
    asOfDate: options.asOfDate,
    asOfLabel: t.asOf(options.asOfDate),
    columns: {
      code: t.code,
      name: t.name,
      acquired: t.acquired,
      cost: t.cost,
      accumulated: t.accumulated,
      nbv: t.nbv,
      status: t.status,
      method: t.method,
    },
    rows,
    totals: {
      cost: round2(totals.cost),
      accumulated: round2(totals.accumulated),
      nbv: round2(totals.nbv),
    },
    footer: t.footer(rows.length),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatMoney(n: number): string {
  return n.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const A4_LANDSCAPE_WIDTH = 842;

export function renderAssetRegisterPdf(formatted: FormattedAssetRegister): Promise<Buffer> {
  const margin = 36;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const innerWidth = A4_LANDSCAPE_WIDTH - 2 * margin;

    // Header
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1C1C1C').text(formatted.companyName);
    doc.fontSize(13).font('Helvetica-Bold').text(formatted.title);
    doc.fontSize(10).font('Helvetica').fillColor('#555555').text(formatted.asOfLabel);
    doc.moveDown(1);

    // Column layout (in pt, sums to innerWidth)
    const cols = [
      { key: 'code' as const, label: formatted.columns.code, width: 60, align: 'left' as const },
      { key: 'name' as const, label: formatted.columns.name, width: 180, align: 'left' as const },
      {
        key: 'acquired' as const,
        label: formatted.columns.acquired,
        width: 75,
        align: 'left' as const,
      },
      { key: 'cost' as const, label: formatted.columns.cost, width: 80, align: 'right' as const },
      {
        key: 'accumulated' as const,
        label: formatted.columns.accumulated,
        width: 90,
        align: 'right' as const,
      },
      { key: 'nbv' as const, label: formatted.columns.nbv, width: 80, align: 'right' as const },
      {
        key: 'status' as const,
        label: formatted.columns.status,
        width: 110,
        align: 'left' as const,
      },
      {
        key: 'method' as const,
        label: formatted.columns.method,
        width: innerWidth - 60 - 180 - 75 - 80 - 90 - 80 - 110,
        align: 'left' as const,
      },
    ];

    const drawRow = (cells: string[], opts: { isBold?: boolean; hasRule?: boolean }) => {
      const y = doc.y;
      if (opts.hasRule) {
        doc
          .moveTo(margin, y - 2)
          .lineTo(margin + innerWidth, y - 2)
          .strokeColor('#CCCCCC')
          .stroke();
      }
      doc
        .font(opts.isBold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .fillColor('#1C1C1C');
      let x = margin;
      cols.forEach((col, i) => {
        doc.text(cells[i] ?? '', x, y, { width: col.width, align: col.align });
        x += col.width;
      });
      doc.y = y + 14;
    };

    drawRow(
      cols.map((c) => c.label),
      { isBold: true, hasRule: true },
    );

    for (const row of formatted.rows) {
      // Soft page-break before each row if we run out of space.
      if (doc.y > 540) doc.addPage();
      drawRow(
        [
          row.code,
          row.name,
          row.acquisitionDate,
          formatMoney(row.acquisitionCost),
          formatMoney(row.accumulatedDepreciation),
          formatMoney(row.netBookValue),
          row.status,
          row.method,
        ],
        {},
      );
    }

    // Totals row
    drawRow(
      [
        '',
        '',
        '',
        formatMoney(formatted.totals.cost),
        formatMoney(formatted.totals.accumulated),
        formatMoney(formatted.totals.nbv),
        '',
        '',
      ],
      { isBold: true, hasRule: true },
    );

    doc.moveDown(1);
    doc.fontSize(9).fillColor('#666666').text(formatted.footer);

    doc.end();
  });
}
