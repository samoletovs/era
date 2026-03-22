import React, { createContext, useContext, useState, useEffect } from "react";

interface CompanyInfo {
  id: string;
  name: string;
}

interface AppState {
  companyId: string;
  setCompanyId: (id: string) => void;
  companies: CompanyInfo[];
  setCompanies: (list: CompanyInfo[]) => void;
  refreshCompanies: () => Promise<void>;
}

const AppContext = createContext<AppState>({
  companyId: "",
  setCompanyId: () => {},
  companies: [],
  setCompanies: () => {},
  refreshCompanies: async () => {},
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
        setCompanies(json.data.map((c: any) => ({ id: c.id, name: c.name })));
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

  return (
    <AppContext.Provider value={{ companyId, setCompanyId, companies, setCompanies, refreshCompanies }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
