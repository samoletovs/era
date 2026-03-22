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
const UR_REGISTER_RESOURCE = "25e80bf3-f107-4ab4-89ef-251b5b9571ac";

interface URCompanyRecord {
  regcode: string;           // Registration number (11 digits)
  name: string;              // Company name
  type: string;              // Legal form (SIA, AS, IK, etc.)
  registered: string;        // Registration date
  address: string;           // Legal address
  status?: string;           // Active/liquidated etc.
}

export interface CompanyLookupResult {
  found: boolean;
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

export async function searchCompanyByName(query: string): Promise<CompanyLookupResult> {
  try {
    // Try CKAN datastore search first
    const result = await ckanDatastoreSearch(query);
    if (result.found) return result;

    // Fallback: try the official info.ur.gov.lv search
    return await urGovSearch(query);
  } catch {
    return { found: false, results: [], source: "error — could not reach Latvian registers" };
  }
}

// ─── Search by registration number ─────────────────────────

export async function searchCompanyByRegNumber(regNumber: string): Promise<CompanyLookupResult> {
  try {
    const result = await ckanDatastoreSearchByRegCode(regNumber);
    if (result.found) return result;
    return await urGovSearch(regNumber);
  } catch {
    return { found: false, results: [], source: "error" };
  }
}

// ─── CKAN Datastore Search ──────────────────────────────────

async function ckanDatastoreSearch(query: string): Promise<CompanyLookupResult> {
  // Use datastore_search with full-text filter
  const url = new URL(`${CKAN_BASE}/datastore_search`);
  const params = {
    resource_id: UR_REGISTER_RESOURCE,
    q: query,
    limit: "10",
  };

  const res = await fetch(`${url}?${new URLSearchParams(params)}`, {
    headers: { "Accept": "application/json" },
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
      registrationNumber: r.regcode || r.registration_number || r.reg_code || "",
      name: r.name || r.nosaukums || "",
      legalForm: r.type || r.legal_form || r.tips || "",
      address: r.address || r.juridiska_adrese || r.adrese || "",
      registeredDate: r.registered || r.registration_date || r.reg_date || "",
    })),
    source: "data.gov.lv (Uzņēmumu reģistrs)",
  };
}

async function ckanDatastoreSearchByRegCode(regCode: string): Promise<CompanyLookupResult> {
  const url = new URL(`${CKAN_BASE}/datastore_search`);
  const filters = JSON.stringify({ regcode: regCode });
  const params = {
    resource_id: UR_REGISTER_RESOURCE,
    filters,
    limit: "5",
  };

  const res = await fetch(`${url}?${new URLSearchParams(params)}`, {
    headers: { "Accept": "application/json" },
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
      registrationNumber: r.regcode || r.registration_number || "",
      name: r.name || r.nosaukums || "",
      legalForm: r.type || r.legal_form || "",
      address: r.address || r.juridiska_adrese || "",
      registeredDate: r.registered || r.registration_date || "",
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
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { found: false, results: [], source: "info.ur.gov.lv — unavailable" };
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
    return { found: false, results: [], source: "info.ur.gov.lv — unavailable" };
  }
}
