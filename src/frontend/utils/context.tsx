import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { NumberFormat, DateFormat, DateTimeFormat } from "@shared/types";

interface CompanyInfo {
  id: string;
  code: string;
  name: string;
  shortName?: string;
  numberFormat?: NumberFormat;
  dateFormat?: DateFormat;
  dateTimeFormat?: DateTimeFormat;
}

interface ToastItem {
  id: number;
  message: string;
  type: "error" | "success" | "info";
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
  toast: (message: string, type?: "error" | "success" | "info") => void;
  toasts: ToastItem[];
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
  toast: () => {},
  toasts: [],
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [companyId, setCompanyIdState] = useState(() =>
    localStorage.getItem("era_companyId") || ""
  );
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastCounter = React.useRef(0);

  const toast = useCallback((message: string, type: "error" | "success" | "info" = "error") => {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

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
        setCompanies(json.data.map((c: any) => ({ id: c.id, code: c.code || "-", name: c.name, shortName: c.shortName, numberFormat: c.settings?.numberFormat, dateFormat: c.settings?.dateFormat, dateTimeFormat: c.settings?.dateTimeFormat })));
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
    <AppContext.Provider value={{ companyId, setCompanyId, companies, setCompanies, refreshCompanies, numberFormat, dateFormat, dateTimeFormat, toast, toasts }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
