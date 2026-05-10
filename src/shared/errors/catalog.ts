/**
 * Shared error catalog — bilingual user-facing messages keyed by error code.
 *
 * Used by both backend (when stamping fallback `friendlyMessage` on responses)
 * and frontend (`formatApiError` for clean UI surfacing). The whole point is
 * that a non-developer user never sees "VAL-001: Validation failed" or a Zod
 * issue dump — they see "Please fill in all required fields" in their language.
 *
 * Conventions:
 *  - Codes are stable; rename only with a migration.
 *  - LV is the default for end users; EN is the developer / English-locale fallback.
 *  - Messages are short, action-oriented, no jargon.
 *  - When a code is unknown, callers fall back to the upstream `message`.
 */

export type Locale = 'lv' | 'en';

export interface CatalogEntry {
  /** Latvian — primary user-facing language. */
  lv: string;
  /** English — fallback / developer. */
  en: string;
}

/**
 * Canonical catalog of error codes. Anything not in here is treated as
 * developer-facing; the UI falls back to the server message verbatim.
 */
export const ERROR_CATALOG: Record<string, CatalogEntry> = {
  // ─── Validation ──────────────────────────────────────────
  'VAL-001': {
    lv: 'Lūdzu, pārbaudiet ievadītos datus.',
    en: 'Please check the values you entered.',
  },
  INVALID_INPUT: {
    lv: 'Ievadītā vērtība nav derīga.',
    en: 'The value you entered is not valid.',
  },
  MISSING_DATA: {
    lv: 'Trūkst nepieciešamo datu.',
    en: 'Required data is missing.',
  },

  // ─── Auth ────────────────────────────────────────────────
  'AUTH-001': {
    lv: 'Lūdzu, pierakstieties no jauna.',
    en: 'Please sign in again.',
  },
  'AUTH-003': {
    lv: 'Jums nav tiesību piekļūt šim uzņēmumam.',
    en: "You don't have access to this company.",
  },
  'AUTH-004': {
    lv: 'Jūsu tiesības neļauj veikt šo darbību.',
    en: 'Your role does not permit this action.',
  },

  // ─── Business / accounting ───────────────────────────────
  'BIZ-001': {
    lv: 'Šo darbību pašreizējā stāvoklī nevar izpildīt.',
    en: "This action can't be performed in the current state.",
  },
  MIN_LINES: {
    lv: 'Grāmatojumam jābūt vismaz divām rindām (debets un kredīts).',
    en: 'A journal entry must have at least two lines (debit and credit).',
  },
  MISSING_DATE: {
    lv: 'Grāmatojumam jānorāda datums.',
    en: 'The journal entry needs a date.',
  },
  MISSING_DESC: {
    lv: 'Grāmatojumam jānorāda apraksts.',
    en: 'The journal entry needs a description.',
  },
  NEGATIVE_AMOUNT: {
    lv: 'Summa nedrīkst būt negatīva.',
    en: 'Amounts must be non-negative.',
  },
  ALREADY_REVERSED: {
    lv: 'Šis grāmatojums jau ir atcelts.',
    en: 'This entry has already been reversed.',
  },
  NO_LINES: {
    lv: 'Rēķinam jābūt vismaz vienai rindai.',
    en: 'The invoice needs at least one line.',
  },
  UNBALANCED: {
    lv: 'Debets un kredīts nesakrīt.',
    en: 'Debit and credit do not match.',
  },

  // ─── Not found ───────────────────────────────────────────
  NOT_FOUND: {
    lv: 'Pieprasītais ieraksts nav atrasts.',
    en: 'The requested record was not found.',
  },
  AUDIT_EVENT_NOT_FOUND: {
    lv: 'Audita ķēde šim notikumam nav atrasta.',
    en: 'No audit chain found for this event.',
  },
  AUDIT_ENTRY_NOT_FOUND: {
    lv: 'Audita ķēde šim grāmatojumam nav atrasta.',
    en: 'No audit chain found for this journal entry.',
  },

  // ─── Rate limiting / system ──────────────────────────────
  RATE_LIMITED: {
    lv: 'Pārāk daudz pieprasījumu. Lūdzu, mēģiniet vēlāk.',
    en: 'Too many requests. Please try again shortly.',
  },
  'SYS-001': {
    lv: 'Sistēmas kļūda. Lūdzu, mēģiniet vēlāk.',
    en: 'A system error occurred. Please try again later.',
  },
  'SYS-002': {
    lv: 'Pieprasītā operācija nav atrasta.',
    en: 'The requested operation was not found.',
  },
  HEALTH_CHECK_FAILED: {
    lv: 'Veselības pārbaude neizdevās.',
    en: 'Health check failed.',
  },

  // ─── PEPPOL ──────────────────────────────────────────────
  PEPPOL_INVOICE_NOT_FOUND: {
    lv: 'PEPPOL: rēķins nav atrasts.',
    en: 'PEPPOL: invoice not found.',
  },
  PEPPOL_NOT_SALES: {
    lv: 'PEPPOL: tikai pārdošanas rēķinus var nosūtīt.',
    en: 'PEPPOL: only sales invoices can be dispatched.',
  },
  PEPPOL_NO_CONTACT: {
    lv: 'PEPPOL: rēķinam nav norādīts klients.',
    en: 'PEPPOL: invoice has no customer.',
  },
  PEPPOL_CONTACT_NOT_FOUND: {
    lv: 'PEPPOL: klients nav atrasts.',
    en: 'PEPPOL: contact not found.',
  },
  PEPPOL_COMPANY_NOT_FOUND: {
    lv: 'PEPPOL: uzņēmums nav atrasts.',
    en: 'PEPPOL: company not found.',
  },
  NOT_CONFIGURED: {
    lv: 'Šī integrācija vēl nav konfigurēta.',
    en: 'This integration is not configured yet.',
  },

  // ─── VID ─────────────────────────────────────────────────
  VID_NOT_FOUND: {
    lv: 'VID iesniegums nav atrasts.',
    en: 'VID submission not found.',
  },
  VID_MONTH_REQUIRED: {
    lv: 'Mēnesis ir obligāts PVN deklarācijai.',
    en: 'Month is required for the VAT declaration.',
  },

  // ─── Annual report ───────────────────────────────────────
  ANNUAL_BAD_YEAR: {
    lv: 'Norādītais gads nav derīgs.',
    en: 'The fiscal year is not valid.',
  },
  ANNUAL_NOT_FOUND: {
    lv: 'Gada pārskata apstiprinājums nav atrasts.',
    en: 'Annual report approval not found.',
  },
};

/**
 * Translate a Zod issue code (e.g. `invalid_type`, `too_small`) into a short
 * user-readable phrase. Used as a fallback when the upstream Zod message is
 * too technical (e.g. `Expected string, received undefined`).
 */
export const ZOD_ISSUE_CATALOG: Record<string, CatalogEntry> = {
  invalid_type: {
    lv: 'Lauks ir nepareizā formātā.',
    en: 'This field is in the wrong format.',
  },
  too_small: {
    lv: 'Vērtība ir pārāk maza.',
    en: 'The value is too short or too small.',
  },
  too_big: {
    lv: 'Vērtība ir pārāk liela.',
    en: 'The value is too long or too large.',
  },
  invalid_string: {
    lv: 'Lauka teksts nav derīgs.',
    en: 'This field has an invalid value.',
  },
  invalid_format: {
    lv: 'Lauka teksts nav derīgs.',
    en: 'This field has an invalid value.',
  },
  invalid_enum_value: {
    lv: 'Vērtība nav viena no pieļaujamajām.',
    en: 'The value is not one of the allowed options.',
  },
  invalid_union: {
    lv: 'Vērtība neatbilst nevienam no pieļaujamajiem variantiem.',
    en: "The value doesn't match any of the allowed shapes.",
  },
  unrecognized_keys: {
    lv: 'Sūtīti nepazīstami lauki.',
    en: 'Unknown fields were sent.',
  },
  custom: {
    lv: 'Lauka vērtība nav derīga.',
    en: 'This field is not valid.',
  },
};

/**
 * Pick the catalog message for an error code; falls back to the supplied
 * `fallback` (typically the server's verbatim message), then to a generic
 * "Something went wrong" in the requested locale.
 */
export function lookupErrorMessage(
  code: string | undefined,
  locale: Locale,
  fallback?: string,
): string {
  if (code) {
    const entry = ERROR_CATALOG[code];
    if (entry) return entry[locale];
  }
  if (fallback && fallback.trim()) return fallback;
  return locale === 'lv' ? 'Notikusi neparedzēta kļūda.' : 'Something went wrong.';
}

/** Translate a single Zod issue code; fallback to its English message. */
export function lookupZodMessage(
  zodCode: string | undefined,
  locale: Locale,
  fallback?: string,
): string {
  if (zodCode) {
    const entry = ZOD_ISSUE_CATALOG[zodCode];
    if (entry) return entry[locale];
  }
  return lookupErrorMessage(undefined, locale, fallback);
}

/**
 * Shape returned by the API on error: `{ error: { code, message, details? } }`.
 * `details` is an optional array of Zod-style field issues.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; code?: string; message?: string }>;
  };
}

/**
 * Format an API error envelope into a single user-facing string in the given
 * locale. If field-level details are present, they're concatenated as
 * "field: message; field: message" — keep the surface small (cap at 3 issues).
 */
export function formatApiErrorEnvelope(
  body: ApiErrorBody | null | undefined,
  locale: Locale,
): string {
  if (!body || !body.error) {
    return lookupErrorMessage(undefined, locale);
  }
  const { code, message, details } = body.error;
  const head = lookupErrorMessage(code, locale, message);

  if (details && details.length > 0) {
    const shown = details.slice(0, 3).map((d) => {
      const issueText = lookupZodMessage(d.code, locale, d.message);
      return d.field ? `${d.field}: ${issueText}` : issueText;
    });
    const rest = details.length - shown.length;
    const suffix = rest > 0 ? ` (+${rest} ${locale === 'lv' ? 'vēl' : 'more'})` : '';
    return `${head} — ${shown.join('; ')}${suffix}`;
  }
  return head;
}
