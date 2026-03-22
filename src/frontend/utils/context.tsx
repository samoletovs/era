import React, { createContext, useContext, useState, useEffect } from "react";

interface AppState {
  companyId: string;
  setCompanyId: (id: string) => void;
}

const AppContext = createContext<AppState>({
  companyId: "",
  setCompanyId: () => {},
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [companyId, setCompanyId] = useState(() =>
    localStorage.getItem("era_companyId") || ""
  );

  useEffect(() => {
    if (companyId) localStorage.setItem("era_companyId", companyId);
  }, [companyId]);

  return (
    <AppContext.Provider value={{ companyId, setCompanyId }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
