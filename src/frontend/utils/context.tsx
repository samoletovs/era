import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { NumberFormat, DateFormat, DateTimeFormat } from "@shared/types";
import { getAuthToken, setAuthToken, clearAuthToken } from "./api";

interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  provider: "google" | "microsoft";
}

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
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  companyId: string;
  setCompanyId: (id: string) => void;
  companies: CompanyInfo[];
  setCompanies: (list: CompanyInfo[]) => void;
  refreshCompanies: () => Promise<void>;
  numberFormat: NumberFormat;
  dateFormat: DateFormat;
  dateTimeFormat: DateTimeFormat;
  toast: (message: string, type?: "error" | "success" | "info") => void;
  dismissToast: (id: number) => void;
  toasts: ToastItem[];
}

const AppContext = createContext<AppState>({
  user: null,
  isAuthenticated: false,
  login: async () => {},
  logout: () => {},
  companyId: "",
  setCompanyId: () => {},
  companies: [],
  setCompanies: () => {},
  refreshCompanies: async () => {},
  numberFormat: "space_comma",
  dateFormat: "dd.MM.yyyy",
  dateTimeFormat: "24h",
  toast: () => {},
  dismissToast: () => {},
  toasts: [],
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [companyId, setCompanyIdState] = useState(
    () => localStorage.getItem("era_companyId") || "",
  );
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastCounter = React.useRef(0);

  const toast = useCallback(
    (message: string, type: "error" | "success" | "info" = "error") => {
      const id = ++toastCounter.current;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        4000,
      );
    },
    [],
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  function setCompanyId(id: string) {
    setCompanyIdState(id);
    if (id) localStorage.setItem("era_companyId", id);
  }

  async function fetchMe(): Promise<AuthUser | null> {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data ?? null;
    } catch {
      return null;
    }
  }

  const login = useCallback(async (token: string) => {
    setAuthToken(token);
    const me = await fetchMe();
    if (me) {
      setUser(me);
    } else {
      clearAuthToken();
    }
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    setUser(null);
    setCompanies([]);
    setCompanyIdState("");
    localStorage.removeItem("era_companyId");
  }, []);

  async function refreshCompanies() {
    try {
      const res = await fetch("/api/companies", {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.status === 401) {
        logout();
        return;
      }
      const json = await res.json();
      if (json.data) {
        setCompanies(
          json.data.map((c: any) => ({
            id: c.id,
            code: c.code || "-",
            name: c.name,
            shortName: c.shortName,
            numberFormat: c.settings?.numberFormat,
            dateFormat: c.settings?.dateFormat,
            dateTimeFormat: c.settings?.dateTimeFormat,
          })),
        );
        // If no company selected but list has items, select first
        if (!companyId && json.data.length > 0) {
          setCompanyId(json.data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load companies:", err);
    }
  }

  // Check auth on mount — also handle OAuth redirect response
  useEffect(() => {
    // Check for OAuth redirect response (id_token in URL hash)
    const hash = window.location.hash;
    if (hash && hash.includes("id_token=")) {
      const params = new URLSearchParams(hash.slice(1));
      const idToken = params.get("id_token");
      if (idToken) {
        // Clear the hash and login with the token
        window.history.replaceState(null, "", window.location.pathname);
        setAuthToken(idToken);
        fetchMe().then((me) => {
          if (me) setUser(me);
          else clearAuthToken();
          setAuthChecked(true);
        });
        return;
      }
    }

    const token = getAuthToken();
    if (token && token !== "dev-bypass") {
      fetchMe().then((me) => {
        if (me) setUser(me);
        setAuthChecked(true);
      });
    } else if (
      token === "dev-bypass" &&
      process.env.NODE_ENV !== "production"
    ) {
      // Dev bypass — set a fake user
      setUser({
        id: "dev-user",
        email: "dev@era.local",
        displayName: "Developer",
        provider: "google",
      });
      setAuthChecked(true);
    } else {
      setAuthChecked(true);
    }
  }, []);

  // Load companies once authenticated
  useEffect(() => {
    if (user) refreshCompanies();
  }, [user]);

  const isAuthenticated = !!user;

  const activeCompany = companies.find((c) => c.id === companyId);
  const numberFormat: NumberFormat =
    activeCompany?.numberFormat || "space_comma";
  const dateFormat: DateFormat = activeCompany?.dateFormat || "dd.MM.yyyy";
  const dateTimeFormat: DateTimeFormat = activeCompany?.dateTimeFormat || "24h";

  // Show nothing until auth check completes to avoid flash
  if (!authChecked) return null;

  return (
    <AppContext.Provider
      value={{
        user,
        isAuthenticated,
        login,
        logout,
        companyId,
        setCompanyId,
        companies,
        setCompanies,
        refreshCompanies,
        numberFormat,
        dateFormat,
        dateTimeFormat,
        toast,
        dismissToast,
        toasts,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
