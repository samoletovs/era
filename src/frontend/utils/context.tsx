import React, { createContext, useContext, useState, useEffect } from "react";
import type { NumberFormat, DateFormat, DateTimeFormat } from "@shared/types";

interface CompanyInfo {
  id: string;
  code: string;
  name: string;
  numberFormat?: NumberFormat;
  dateFormat?: DateFormat;
  dateTimeFormat?: DateTimeFormat;
}

interface AppState {
  companyId: string;
  setCompanyId: (id: string) => void;
  companies: CompanyInfo[];
  setCompanies: (list: CompanyInfo[]) => void;
  refreshCompanies: () => Promise<void>;
  numberFormat: NumberFormat;
  dateFormat: DateFormat;
  dateTimeFormat: DateTimeFormat;
}

const AppContext = createContext<AppState>({
  companyId: "",
  setCompanyId: () => {},
  companies: [],
  setCompanies: () => {},
  refreshCompanies: async () => {},
  numberFormat: "space_comma",
  dateFormat: "dd.MM.yyyy",
  dateTimeFormat: "24h",
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [companyId, setCompanyIdState] = useState(() =>
    localStorage.getItem("era_companyId") || ""
  );
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);

  function setCompanyId(id: string) {
    setCompanyIdState(id);
    if (id) localStorage.setItem("era_companyId", id);
  }

  async function refreshCompanies() {
    try {
      const res = await fetch("/api/companies", {
        headers: { Authorization: "Bearer dev-bypass" },
      });
      const json = await res.json();
      if (json.data) {
        setCompanies(json.data.map((c: any) => ({ id: c.id, code: c.code || "-", name: c.name, numberFormat: c.settings?.numberFormat, dateFormat: c.settings?.dateFormat, dateTimeFormat: c.settings?.dateTimeFormat })));
        // If no company selected but list has items, select first
        if (!companyId && json.data.length > 0) {
          setCompanyId(json.data[0].id);
        }
      }
    } catch {
      // Ignore — API might not be running
    }
  }

  useEffect(() => {
    refreshCompanies();
  }, []);

  const activeCompany = companies.find((c) => c.id === companyId);
  const numberFormat: NumberFormat = activeCompany?.numberFormat || "space_comma";
  const dateFormat: DateFormat = activeCompany?.dateFormat || "dd.MM.yyyy";
  const dateTimeFormat: DateTimeFormat = activeCompany?.dateTimeFormat || "24h";

  return (
    <AppContext.Provider value={{ companyId, setCompanyId, companies, setCompanies, refreshCompanies, numberFormat, dateFormat, dateTimeFormat }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
