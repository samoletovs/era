// Latvian Enterprise Register (Uzņēmumu reģistrs) — company lookup
// Sources:
// 1. data.gov.lv CKAN Datastore API (open data, updated daily)
// 2. info.ur.gov.lv (official portal — limited without auth)
//
// The data.gov.lv datastore has the "register" dataset with company details
// searchable via SQL-like queries on the CKAN datastore_search_sql endpoint.

const CKAN_BASE = "https://data.gov.lv/dati/api/3/action";

// Resource IDs from data.gov.lv for UR (Uzņēmumu reģistrs) datasets
// The main enterprise register resource (register dataset)
const UR_REGISTER_RESOURCE = "25e80bf3-f107-4ab4-89ef-251b5b9374e9";

// VID (Valsts ieņēmumu dienests) — Latvian Tax Authority datasets
// PVN maksātāji (VAT payers register) — updated daily
const VID_VAT_PAYERS_RESOURCE = "610910e9-e086-4c5b-a7ea-0a896a697672";
// Saimnieciskās darbības apturēšana (Suspended businesses) — updated daily
const VID_SUSPENDED_RESOURCE = "074fe277-64a8-47ea-a9f6-12aee57c8964";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in type guard patterns
interface URCompanyRecord {
  regcode: string; // Registration number (11 digits)
  name: string; // Company name
  type: string; // Legal form (SIA, AS, IK, etc.)
  registered: string; // Registration date
  address: string; // Legal address
  status?: string; // Active/liquidated etc.
}

export interface CompanyLookupResult {
  found: boolean; // eslint-disable-line era/field-suffixes -- API shape
  results: Array<{
    registrationNumber: string;
    name: string;
    legalForm: string;
    address: string;
    registeredDate: string;
  }>;
  source: string;
}

// ─── Search by name ─────────────────────────────────────────

export async function searchCompanyByName(
  query: string,
): Promise<CompanyLookupResult> {
  try {
    // Try CKAN datastore search first
    const result = await ckanDatastoreSearch(query);
    if (result.found) return result;

    // Fallback: try the official info.ur.gov.lv search
    return await urGovSearch(query);
  } catch {
    return {
      found: false,
      results: [],
      source: "error — could not reach Latvian registers",
    };
  }
}

// ─── Search by registration number ─────────────────────────

export async function searchCompanyByRegNumber(
  regNumber: string,
): Promise<CompanyLookupResult> {
  try {
    const result = await ckanDatastoreSearchByRegCode(regNumber);
    if (result.found) return result;
    return await urGovSearch(regNumber);
  } catch {
    return { found: false, results: [], source: "error" };
  }
}

// ─── CKAN Datastore Search ──────────────────────────────────

async function ckanDatastoreSearch(
  query: string,
): Promise<CompanyLookupResult> {
  // Use datastore_search with full-text filter
  const url = new URL(`${CKAN_BASE}/datastore_search`);
  const params = {
    resource_id: UR_REGISTER_RESOURCE,
    q: query,
    limit: "10",
  };

  const res = await fetch(`${url}?${new URLSearchParams(params)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    // Resource ID might be wrong — try alternative search
    return { found: false, results: [], source: "ckan-unavailable" };
  }

  const data = await res.json();
  if (!data.success || !data.result?.records?.length) {
    return { found: false, results: [], source: "data.gov.lv" };
  }

  return {
    found: true,
    results: data.result.records.map((r: Record<string, string>) => ({
      registrationNumber: String(r.regcode || ""),
      name: String(r.name || ""),
      legalForm: String(r.type_text || r.type || ""),
      address: String(r.address || ""),
      registeredDate: String(r.registered || ""),
    })),
    source: "data.gov.lv (Uzņēmumu reģistrs)",
  };
}

async function ckanDatastoreSearchByRegCode(
  regCode: string,
): Promise<CompanyLookupResult> {
  const url = new URL(`${CKAN_BASE}/datastore_search`);
  const filters = JSON.stringify({ regcode: regCode });
  const params = {
    resource_id: UR_REGISTER_RESOURCE,
    filters,
    limit: "5",
  };

  const res = await fetch(`${url}?${new URLSearchParams(params)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return { found: false, results: [], source: "ckan-unavailable" };

  const data = await res.json();
  if (!data.success || !data.result?.records?.length) {
    return { found: false, results: [], source: "data.gov.lv" };
  }

  return {
    found: true,
    results: data.result.records.map((r: Record<string, string>) => ({
      registrationNumber: String(r.regcode || ""),
      name: String(r.name || ""),
      legalForm: String(r.type_text || r.type || ""),
      address: String(r.address || ""),
      registeredDate: String(r.registered || ""),
    })),
    source: "data.gov.lv (Uzņēmumu reģistrs)",
  };
}

// ─── Fallback: info.ur.gov.lv search ────────────────────────

async function urGovSearch(query: string): Promise<CompanyLookupResult> {
  // info.ur.gov.lv has a public search endpoint (no auth needed for basic info)
  // This returns HTML, but we can parse basic results from the JSON API
  try {
    const url = `https://info.ur.gov.lv/api/companies?query=${encodeURIComponent(query)}&limit=10`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return {
        found: false,
        results: [],
        source: "info.ur.gov.lv — unavailable",
      };
    }

    const data = await res.json();
    if (!data?.length) {
      return { found: false, results: [], source: "info.ur.gov.lv" };
    }

    return {
      found: true,
      results: data.map((r: Record<string, string>) => ({
        registrationNumber: r.regcode || r.registration_number || "",
        name: r.name || "",
        legalForm: r.type || "",
        address: r.address || "",
        registeredDate: r.registered || "",
      })),
      source: "info.ur.gov.lv (Uzņēmumu reģistrs)",
    };
  } catch {
    return {
      found: false,
      results: [],
      source: "info.ur.gov.lv — unavailable",
    };
  }
}

// ─── EU VIES VAT Number Validation ──────────────────────────
// https://ec.europa.eu/taxation_customs/vies/

export interface ViesResult {
  valid: boolean;
  countryCode: string;
  vatNumber: string;
  name: string;
  address: string;
  requestDate: string;
  source: string;
}

const EU_COUNTRY_CODES = new Set([
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "EL",
  "ES",
  "FI",
  "FR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
  "XI", // XI = Northern Ireland
]);

/**
 * Parse a full VAT number like "LV40003999999" into { countryCode: "LV", number: "40003999999" }.
 * Handles spaces, dots, and dashes.
 */
function parseVatNumber(
  vatNumber: string,
): { countryCode: string; number: string } | null {
  const clean = vatNumber.replace(/[\s.\-]/g, "").toUpperCase();
  // EU VAT: 2-letter country code + 5-12 alphanumeric chars (NL has B01, IE has trailing letters)
  const match = clean.match(/^([A-Z]{2})([A-Z0-9]{5,12})$/);
  if (!match) return null;
  if (!EU_COUNTRY_CODES.has(match[1])) return null;
  return { countryCode: match[1], number: match[2] };
}

export async function checkViesVat(vatNumber: string): Promise<ViesResult> {
  const parsed = parseVatNumber(vatNumber);
  if (!parsed) {
    return {
      valid: false,
      countryCode: "",
      vatNumber,
      name: "",
      address: "",
      requestDate: new Date().toISOString().slice(0, 10),
      source:
        "Invalid EU VAT number format. Expected: country code + digits (e.g. LV40003999999)",
    };
  }

  try {
    const res = await fetch(
      "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          countryCode: parsed.countryCode,
          vatNumber: parsed.number,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!res.ok) {
      return {
        valid: false,
        countryCode: parsed.countryCode,
        vatNumber: parsed.number,
        name: "",
        address: "",
        requestDate: new Date().toISOString().slice(0, 10),
        source: `VIES service error (HTTP ${res.status})`,
      };
    }

    const data = await res.json();

    // Handle member state unavailable (actionSucceed: false)
    if (data.actionSucceed === false || data.errorWrappers) {
      const errCode = data.errorWrappers?.[0]?.error || "UNKNOWN";
      return {
        valid: false,
        countryCode: parsed.countryCode,
        vatNumber: parsed.number,
        name: "",
        address: "",
        requestDate: new Date().toISOString().slice(0, 10),
        source:
          errCode === "MS_UNAVAILABLE"
            ? `The ${parsed.countryCode} tax authority is temporarily unavailable. Try again later.`
            : `VIES error: ${errCode}`,
      };
    }

    return {
      valid: data.isValid === true || data.valid === true,
      countryCode: data.countryCode || parsed.countryCode,
      vatNumber: data.vatNumber || parsed.number,
      name: (data.name || "").replace(/---/g, "").trim(),
      address: (data.address || "")
        .replace(/\n/g, ", ")
        .replace(/---/g, "")
        .trim(),
      requestDate: data.requestDate || new Date().toISOString().slice(0, 10),
      source: "EU VIES (ec.europa.eu)",
    };
  } catch {
    return {
      valid: false,
      countryCode: parsed.countryCode,
      vatNumber: parsed.number,
      name: "",
      address: "",
      requestDate: new Date().toISOString().slice(0, 10),
      source: "VIES service unavailable — try again later",
    };
  }
}

// ─── VID: VAT Payer Check (PVN maksātāji) ───────────────────

import type { VidVatStatus, VidSuspendedStatus } from "@shared/types";

export interface VidStatusResult {
  vatPayer: VidVatStatus;
  suspended: VidSuspendedStatus;
}

/**
 * Check if a Latvian company is a registered VAT payer via VID open data.
 * Searches by registration number (e.g. "40003999999") — the dataset stores
 * VAT numbers as "LV" + regNumber.
 */
export async function checkVidVatPayer(
  regNumber: string,
): Promise<VidVatStatus> {
  const now = new Date().toISOString();
  const clean = regNumber.replace(/\s/g, "");
  const vatNum = clean.startsWith("LV") ? clean : `LV${clean}`;

  try {
    const url = new URL(`${CKAN_BASE}/datastore_search`);
    const params = {
      resource_id: VID_VAT_PAYERS_RESOURCE,
      filters: JSON.stringify({ Numurs: vatNum }),
      limit: "1",
    };

    const res = await fetch(`${url}?${new URLSearchParams(params)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { isRegistered: false, checkedAt: now };
    }

    const data = await res.json();
    const records = data.result?.records;
    if (!data.success || !records?.length) {
      return { isRegistered: false, checkedAt: now };
    }

    const r = records[0] as Record<string, string>;
    const isActive = (r.Aktivs || "").trim().toLowerCase() !== "nav";

    return {
      isRegistered: true,
      vatNumber: String(r.Numurs || "").trim(),
      registeredDate: String(r.Registrets || "").trim() || undefined,
      excludedDate: String(r.Izslegts || "").trim() || undefined,
      isConstruction:
        (r.Buvniecibas_pazime || "").trim().toLowerCase() !== "nav",
      checkedAt: now,
      // Override: if excluded and not active, mark as not registered
      ...(isActive ? {} : { isRegistered: false }),
    };
  } catch {
    return { isRegistered: false, checkedAt: now };
  }
}

// ─── VID: Suspended Business Check ──────────────────────────

/**
 * Check if a Latvian company has suspended business operations via VID open data.
 * Note: The dataset wraps registration codes in single quotes (e.g. "'40001005630'").
 */
export async function checkVidSuspended(
  regNumber: string,
): Promise<VidSuspendedStatus> {
  const now = new Date().toISOString();
  const clean = regNumber.replace(/\s/g, "");

  try {
    // VID stores reg codes with leading quote: "'40001005630'"
    const quotedCode = `'${clean}'`;

    const url = new URL(`${CKAN_BASE}/datastore_search`);
    const params = {
      resource_id: VID_SUSPENDED_RESOURCE,
      filters: JSON.stringify({ Registracijas_kods: quotedCode }),
      limit: "5",
    };

    const res = await fetch(`${url}?${new URLSearchParams(params)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { isSuspended: false, checkedAt: now };
    }

    const data = await res.json();
    const records = data.result?.records;
    if (!data.success || !records?.length) {
      return { isSuspended: false, checkedAt: now };
    }

    // Find the most recent suspension record
    const r = records[0] as Record<string, string>;
    const suspendedUntil = r.Aizliegts_veikt_darijumus_lidz
      ? new Date(r.Aizliegts_veikt_darijumus_lidz)
      : null;
    const hasRestoration =
      (r.Lemuma_par_atjaunosanu_datums || "").trim().length > 0;
    const isSuspended =
      !hasRestoration && (!suspendedUntil || suspendedUntil > new Date());

    return {
      isSuspended,
      companyName: String(r.Nosaukums || "").trim() || undefined,
      decisionDate: String(r.Lemuma_datums || "").trim() || undefined,
      suspendedFrom: r.Aizliegts_veikt_darijumus_no
        ? new Date(r.Aizliegts_veikt_darijumus_no).toISOString().slice(0, 10)
        : undefined,
      suspendedUntil: suspendedUntil
        ? suspendedUntil.toISOString().slice(0, 10)
        : undefined,
      restorationDate: hasRestoration
        ? String(r.Lemuma_par_atjaunosanu_datums).trim()
        : undefined,
      checkedAt: now,
    };
  } catch {
    return { isSuspended: false, checkedAt: now };
  }
}

// ─── VID: Combined Status Check ─────────────────────────────

/**
 * Run both VID checks (VAT payer + suspended) in parallel for a registration number.
 */
export async function checkVidStatus(
  regNumber: string,
): Promise<VidStatusResult> {
  const [vatPayer, suspended] = await Promise.all([
    checkVidVatPayer(regNumber),
    checkVidSuspended(regNumber),
  ]);
  return { vatPayer, suspended };
}
