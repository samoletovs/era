import React, { useState } from "react";
import { useApp } from "../utils/context";

const API = "/api";
const TOKEN = "dev-bypass";

interface RegisterResult {
  registrationNumber: string;
  name: string;
  legalForm: string;
  address: string;
  registeredDate: string;
}

export function Onboarding() {
  const { setCompanyId } = useApp();
  const [step, setStep] = useState<"search" | "confirm" | "creating" | "done">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RegisterResult[]>([]);
  const [selected, setSelected] = useState<RegisterResult | null>(null);
  const [companyCode, setCompanyCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [createdCompany, setCreatedCompany] = useState<any>(null);

  // Generate code from company name (extract quoted part, take first 5 chars)
  function generateCode(name: string): string {
    const quoted = name.match(/[""\u201C\u201D]([^""\u201C\u201D]+)[""\u201C\u201D]/) || name.match(/"([^"]+)"/);
    const clean = (quoted ? quoted[1] : name).replace(/^(SIA|AS)\s+/i, "").trim();
    return clean.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5).toUpperCase();
  }

  function handleSelect(r: RegisterResult) {
    setSelected(r);
    setCompanyCode(generateCode(r.name));
    setStep("confirm");
  }

  async function handleSearch() {
    if (!query.trim() || query.trim().length < 2) return;
    setSearching(true);
    setError("");
    try {
      const res = await fetch(`${API}/register/search?q=${encodeURIComponent(query.trim())}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const json = await res.json();
      const data = json.data;
      if (data?.found && data.results?.length > 0) {
        setResults(data.results);
      } else {
        setResults([]);
        setError("No companies found. Try a different name or registration number.");
      }
    } catch {
      setError("Could not search the register. Try again.");
    } finally {
      setSearching(false);
    }
  }

  async function handleCreate() {
    if (!selected) return;
    setCreating(true);
    setStep("creating");
    try {
      // Parse address into parts
      const addressParts = selected.address.split(",").map((s) => s.trim());
      const city = addressParts.find((p) => /Rīga|Liepāja|Daugavpils|Jelgava|Jūrmala|Ventspils|Rēzekne/.test(p)) || addressParts[0] || "";
      const postalCode = addressParts.find((p) => /LV-\d{4}/.test(p)) || "";

      const res = await fetch(`${API}/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({
          name: selected.name,
          code: companyCode || generateCode(selected.name),
          registrationNumber: selected.registrationNumber,
          vatNumber: `LV${selected.registrationNumber}`,
          legalAddress: {
            line1: selected.address,
            city: city || "Rīga",
            postalCode: postalCode || "LV-1050",
            country: "LV",
          },
        }),
      });
      const json = await res.json();
      if (json.data) {
        setCreatedCompany(json.data);
        setCompanyId(json.data.id);
        setStep("done");
      } else {
        setError(json.error?.message || "Failed to create company");
        setStep("confirm");
      }
    } catch {
      setError("Failed to create company");
      setStep("confirm");
    } finally {
      setCreating(false);
    }
  }

  if (step === "done" && createdCompany) {
    return (
      <div className="onboarding-page">
        <div className="onboarding-card">
          <div className="onboarding-icon">✅</div>
          <h2>Company created</h2>
          <p className="onboarding-subtitle">
            <strong>{createdCompany.name}</strong> is ready with 70+ Latvian chart of accounts pre-populated.
          </p>
          <div className="onboarding-details">
            <div className="detail-row"><span className="detail-label">Registration</span><span>{createdCompany.registrationNumber}</span></div>
            <div className="detail-row"><span className="detail-label">VAT number</span><span>{createdCompany.vatNumber || "—"}</span></div>
            <div className="detail-row"><span className="detail-label">Currency</span><span>EUR</span></div>
            <div className="detail-row"><span className="detail-label">Country</span><span>Latvia</span></div>
          </div>
          <button className="btn-primary" style={{ marginTop: 24, width: "100%" }} onClick={() => window.location.href = "/"}>
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (step === "creating") {
    return (
      <div className="onboarding-page">
        <div className="onboarding-card">
          <div className="onboarding-icon">⏳</div>
          <h2>Setting up your company...</h2>
          <p className="onboarding-subtitle">Creating chart of accounts, configuring VAT rates, and preparing the ledger.</p>
        </div>
      </div>
    );
  }

  if (step === "confirm" && selected) {
    return (
      <div className="onboarding-page">
        <div className="onboarding-card" style={{ maxWidth: 520 }}>
          <h2>Confirm company details</h2>
          <p className="onboarding-subtitle">This data was retrieved from the Latvian Enterprise Register.</p>
          <div className="onboarding-details">
            <div className="detail-row">
              <span className="detail-label">Company code</span>
              <input
                className="code-input"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
                maxLength={5}
                placeholder="DAIS"
              />
            </div>
            <div className="detail-row"><span className="detail-label">Name</span><span><strong>{selected.name}</strong></span></div>
            <div className="detail-row"><span className="detail-label">Registration number</span><span className="mono">{selected.registrationNumber}</span></div>
            <div className="detail-row"><span className="detail-label">Legal form</span><span>{selected.legalForm}</span></div>
            <div className="detail-row"><span className="detail-label">Address</span><span>{selected.address}</span></div>
            <div className="detail-row"><span className="detail-label">Registered</span><span>{selected.registeredDate?.split("T")[0]}</span></div>
          </div>
          {error && <p style={{ color: "#FF3B30", fontSize: 13, marginTop: 12 }}>{error}</p>}
          <div className="btn-row" style={{ marginTop: 24 }}>
            <button className="btn-secondary" onClick={() => { setStep("search"); setSelected(null); }}>Back</button>
            <button className="btn-primary" style={{ flex: 1 }} onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : "Create this company"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Search step
  return (
    <div className="onboarding-page">
      <div className="onboarding-card" style={{ maxWidth: 600 }}>
        <div className="onboarding-icon">🏢</div>
        <h2>Add a company</h2>
        <p className="onboarding-subtitle">
          Search the Latvian Enterprise Register by company name or registration number.
          We'll auto-fill all the details for you.
        </p>

        <div className="search-bar">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="e.g. Dais, Microsoft, or 40003290084"
            autoFocus
          />
          <button className="btn-primary" onClick={handleSearch} disabled={searching}>
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {error && <p style={{ color: "#FF3B30", fontSize: 13, marginTop: 12 }}>{error}</p>}

        {results.length > 0 && (
          <div className="search-results">
            {results.map((r, i) => (
              <button key={i} className="search-result-card" onClick={() => handleSelect(r)}>
                <div className="result-name">{r.name}</div>
                <div className="result-meta">
                  <span className="mono">{r.registrationNumber}</span>
                  <span className="result-dot">·</span>
                  <span>{r.address}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
