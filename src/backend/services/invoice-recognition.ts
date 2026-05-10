// Invoice recognition using Azure OpenAI GPT-4o vision.
//
// Pipeline:
//   1. recognizeInvoiceMultiPage(pages)
//        - Calls GPT-4o vision once per page with EXTRACTION_PROMPT.
//        - Each page returns a RecognizedInvoice + per-field confidence.
//   2. mergeRecognitions(perPage)
//        - Pure function. Merges multi-page results: vendor info from
//          page with highest field confidence, line items concatenated,
//          totals from the last page (which holds the summary), per-
//          field confidence taken as the *best* across pages.
//   3. retryLowConfidenceFields(merged, pages)
//        - If any critical field is still 'low' after merge, makes one
//          targeted retry call with a focused prompt asking the model
//          to re-read just those fields. Bounded by RETRY_FIELDS to
//          keep latency in check.
//
// recognizeInvoice(image, mimeType) is preserved for callers that have
// only a single image; it is now a thin wrapper around the multi-page
// pipeline.

import { AzureOpenAI } from 'openai';

let client: AzureOpenAI;

function getClient(): AzureOpenAI {
  if (!client) {
    client = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      apiVersion: '2024-10-21',
    });
  }
  return client;
}

export interface RecognizedInvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  lineTotal: number;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** Per-field self-reported confidence. Optional fields. The keys are
 *  intentionally named to mirror the data fields on RecognizedInvoice
 *  (e.g. `invoiceDate` here corresponds to the `invoiceDate` data field
 *  there); the suffix-typing lint rule is suppressed because the values
 *  are confidence levels, not the underlying field's type. */
/* eslint-disable era/field-suffixes */
export interface FieldConfidence {
  vendorName?: ConfidenceLevel;
  vendorRegistrationNumber?: ConfidenceLevel;
  vendorVatNumber?: ConfidenceLevel;
  invoiceNumber?: ConfidenceLevel;
  invoiceDate?: ConfidenceLevel;
  dueDate?: ConfidenceLevel;
  total?: ConfidenceLevel;
  vatAmount?: ConfidenceLevel;
  subtotal?: ConfidenceLevel;
  bankAccount?: ConfidenceLevel;
  lines?: ConfidenceLevel;
}
/* eslint-enable era/field-suffixes */

export interface RecognizedInvoice {
  vendorName: string;
  vendorRegistrationNumber?: string;
  vendorVatNumber?: string;
  vendorAddress?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  currency: string;
  lines: RecognizedInvoiceLine[];
  subtotal: number;
  vatAmount: number;
  total: number;
  bankAccount?: string;
  reference?: string;
  confidence: ConfidenceLevel;
  /** Per-field confidence — populated by GPT-4o; merged across pages. */
  fieldConfidence?: FieldConfidence;
  /** Number of pages successfully extracted. */
  pageCount?: number;
  rawText?: string;
}

export interface InvoicePage {
  imageBase64: string;
  mimeType: string;
}

const EXTRACTION_PROMPT = `You are an expert invoice data extractor for Latvian companies. Extract structured data from this invoice image.

Return ONLY valid JSON with this exact structure (no markdown, no backticks):
{
  "vendorName": "full company name as shown on invoice",
  "vendorRegistrationNumber": "11-digit number or null",
  "vendorVatNumber": "LV + number or null",
  "vendorAddress": "full address or null",
  "invoiceNumber": "invoice number/ID",
  "invoiceDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD or null",
  "currency": "EUR",
  "lines": [
    {
      "description": "item/service description",
      "quantity": 1,
      "unitPrice": 100.00,
      "vatRate": 21,
      "lineTotal": 121.00
    }
  ],
  "subtotal": 100.00,
  "vatAmount": 21.00,
  "total": 121.00,
  "bankAccount": "IBAN or null",
  "reference": "payment reference or null",
  "confidence": "high",
  "fieldConfidence": {
    "vendorName": "high",
    "vendorRegistrationNumber": "high",
    "vendorVatNumber": "high",
    "invoiceNumber": "high",
    "invoiceDate": "high",
    "dueDate": "high",
    "subtotal": "high",
    "vatAmount": "high",
    "total": "high",
    "bankAccount": "high",
    "lines": "high"
  }
}

Rules:
- All amounts in EUR (convert if needed)
- VAT rates in Latvia: 21% (standard), 12% (reduced), 5% (super-reduced), 0% (exempt)
- Dates in YYYY-MM-DD format
- If you can't read a field clearly, set it to null
- For each field in fieldConfidence, score how confident you are reading it: "high" if crisp and unambiguous, "medium" if partially obscured or required inference, "low" if smudged/cropped/missing.
- Set top-level confidence to the WORST per-field score (e.g. one "low" field => overall "low").
- lineTotal should be the gross amount (net + VAT) for that line
- subtotal is sum of all net amounts, vatAmount is total VAT, total is subtotal + vatAmount`;

/**
 * Critical fields that trigger a retry pass when their confidence is 'low'.
 * Order matters — the retry prompt names them in this order.
 */
const RETRY_FIELDS: Array<keyof FieldConfidence> = [
  'vendorName',
  'vendorRegistrationNumber',
  'vendorVatNumber',
  'invoiceNumber',
  'invoiceDate',
  'total',
  'vatAmount',
  'bankAccount',
];

const RANK: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1 };

function bestConfidence(
  a: ConfidenceLevel | undefined,
  b: ConfidenceLevel | undefined,
): ConfidenceLevel | undefined {
  if (!a) return b;
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

/**
 * Worst per-field confidence across the populated fields, used to derive
 * the top-level `confidence` when the model omits it.
 */
export function worstFieldConfidence(fc: FieldConfidence | undefined): ConfidenceLevel {
  if (!fc) return 'medium';
  let worst: ConfidenceLevel = 'high';
  for (const v of Object.values(fc) as Array<ConfidenceLevel | undefined>) {
    if (!v) continue;
    if (RANK[v] < RANK[worst]) worst = v;
  }
  return worst;
}

/** Names of fields whose confidence is below `threshold`. */
export function lowConfidenceFields(
  fc: FieldConfidence | undefined,
  threshold: ConfidenceLevel = 'low',
): Array<keyof FieldConfidence> {
  if (!fc) return [];
  const cutoff = RANK[threshold];
  return RETRY_FIELDS.filter((k) => {
    const v = fc[k];
    return v && RANK[v] <= cutoff;
  });
}

/**
 * Merge multi-page recognitions into one. Pure function.
 *
 *   - Vendor / header fields: picked from the page where that field has
 *     the highest reported confidence (ties broken by first non-empty).
 *   - Line items: concatenated in page order.
 *   - Subtotal / VAT / total: taken from the last page (which carries the
 *     totals block on multi-page invoices), falling back to first non-zero.
 *   - fieldConfidence: max per field across pages.
 */
export function mergeRecognitions(pages: RecognizedInvoice[]): RecognizedInvoice {
  if (pages.length === 0) {
    throw new Error('mergeRecognitions: no pages');
  }
  if (pages.length === 1) {
    return { ...pages[0], pageCount: 1 };
  }

  const pickByConfidence = <K extends keyof FieldConfidence, V>(
    field: K,
    extract: (p: RecognizedInvoice) => V | undefined,
  ): V | undefined => {
    let best: { value: V; rank: number } | null = null;
    for (const p of pages) {
      const v = extract(p);
      if (v === undefined || v === null || v === '') continue;
      const conf = p.fieldConfidence?.[field] ?? p.confidence;
      const rank = RANK[conf];
      if (!best || rank > best.rank) best = { value: v, rank };
    }
    return best?.value;
  };

  const allLines = pages.flatMap((p) => p.lines ?? []);

  // Totals: prefer the last page's totals (summary block); fall back to any non-zero page.
  const totalsSource =
    [...pages].reverse().find((p) => (p.total ?? 0) > 0) ?? pages[pages.length - 1];

  const fieldConfidence: FieldConfidence = {};
  for (const k of Object.keys(pages[0].fieldConfidence ?? {}) as Array<keyof FieldConfidence>) {
    fieldConfidence[k] = pages.reduce<ConfidenceLevel | undefined>(
      (acc, p) => bestConfidence(acc, p.fieldConfidence?.[k]),
      undefined,
    );
  }
  for (const p of pages) {
    for (const k of Object.keys(p.fieldConfidence ?? {}) as Array<keyof FieldConfidence>) {
      fieldConfidence[k] = bestConfidence(fieldConfidence[k], p.fieldConfidence?.[k]);
    }
  }

  return {
    vendorName: pickByConfidence('vendorName', (p) => p.vendorName) ?? pages[0].vendorName,
    vendorRegistrationNumber: pickByConfidence(
      'vendorRegistrationNumber',
      (p) => p.vendorRegistrationNumber,
    ),
    vendorVatNumber: pickByConfidence('vendorVatNumber', (p) => p.vendorVatNumber),
    vendorAddress: pages.find((p) => p.vendorAddress)?.vendorAddress,
    invoiceNumber:
      pickByConfidence('invoiceNumber', (p) => p.invoiceNumber) ?? pages[0].invoiceNumber,
    invoiceDate: pickByConfidence('invoiceDate', (p) => p.invoiceDate) ?? pages[0].invoiceDate,
    dueDate: pickByConfidence('dueDate', (p) => p.dueDate),
    currency: pages[0].currency || 'EUR',
    lines: allLines,
    subtotal: totalsSource.subtotal,
    vatAmount: totalsSource.vatAmount,
    total: totalsSource.total,
    bankAccount: pickByConfidence('bankAccount', (p) => p.bankAccount),
    reference: pages.find((p) => p.reference)?.reference,
    confidence: worstFieldConfidence(fieldConfidence),
    fieldConfidence,
    pageCount: pages.length,
  };
}

function buildRetryPrompt(fields: Array<keyof FieldConfidence>): string {
  return `You previously extracted invoice data but flagged the following fields as low confidence:

${fields.map((f) => `  - ${f}`).join('\n')}

Please look more carefully at the image and re-read just these fields. Pay attention to faint print, stamps, or partially obscured text. Return JSON with the same structure as before, but populate ONLY these fields plus an updated fieldConfidence covering them. If a field is still unreadable, set it to null and keep its confidence as "low".`;
}

interface ExtractOptions {
  /** Override the deployment name (test seam). Defaults to env var. */
  deployment?: string;
}

async function extractFromImage(
  imageBase64: string,
  mimeType: string,
  options: ExtractOptions = {},
  systemPrompt: string = EXTRACTION_PROMPT,
): Promise<RecognizedInvoice> {
  const deployment = options.deployment ?? process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o';

  const response = await getClient().chat.completions.create({
    model: deployment,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
              detail: 'high',
            },
          },
          {
            type: 'text',
            text: 'Please extract all invoice data from this image.',
          },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 2500,
  });

  const content = response.choices[0]?.message?.content || '';

  // Parse JSON from response (handle potential markdown wrapping)
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(jsonStr) as RecognizedInvoice;

    // Validate and set defaults
    if (!parsed.invoiceDate) parsed.invoiceDate = new Date().toISOString().slice(0, 10);
    if (!parsed.currency) parsed.currency = 'EUR';
    if (!parsed.lines) parsed.lines = [];
    if (!parsed.confidence) {
      parsed.confidence = worstFieldConfidence(parsed.fieldConfidence);
    }

    // Recalculate totals if needed
    if (parsed.lines.length > 0 && !parsed.subtotal) {
      parsed.subtotal = parsed.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
      parsed.vatAmount = parsed.lines.reduce(
        (s, l) => s + (l.unitPrice * l.quantity * l.vatRate) / 100,
        0,
      );
      parsed.total = parsed.subtotal + parsed.vatAmount;
    }

    parsed.rawText = content;
    return parsed;
  } catch {
    throw new Error(`Failed to parse invoice data: ${content.slice(0, 200)}`);
  }
}

/**
 * Multi-page entry point. Pass one page when there's only one image.
 * Runs extraction per page in parallel, merges, then optionally retries
 * for low-confidence critical fields (bounded to one extra call).
 */
export async function recognizeInvoiceMultiPage(pages: InvoicePage[]): Promise<RecognizedInvoice> {
  if (pages.length === 0) throw new Error('recognizeInvoiceMultiPage: no pages provided');

  const perPage = await Promise.all(pages.map((p) => extractFromImage(p.imageBase64, p.mimeType)));

  const merged = mergeRecognitions(perPage);

  const stillLow = lowConfidenceFields(merged.fieldConfidence);
  if (stillLow.length > 0) {
    // Pick the first page (typically the cover with the header info) and
    // do one targeted retry asking the model to re-read just those fields.
    try {
      const retried = await extractFromImage(
        pages[0].imageBase64,
        pages[0].mimeType,
        {},
        buildRetryPrompt(stillLow),
      );
      // Merge retry on top of original — retry has authority for its fields.
      return mergeRecognitions([merged, retried]);
    } catch {
      // Retry is best-effort; preserve original on failure.
      return merged;
    }
  }

  return merged;
}

/**
 * Backwards-compatible single-image API. New code should prefer
 * `recognizeInvoiceMultiPage` directly.
 */
export async function recognizeInvoice(
  imageBase64: string,
  mimeType: string,
): Promise<RecognizedInvoice> {
  return recognizeInvoiceMultiPage([{ imageBase64, mimeType }]);
}
