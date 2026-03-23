import { useState, useMemo } from "react";

interface TableControlsOptions<T> {
  /** Fields to search across (string values) */
  searchFields: (keyof T)[];
  /** Default sort field */
  defaultSort: keyof T;
  /** Default sort direction */
  defaultDir?: "asc" | "desc";
}

interface TableControls<T, K extends keyof T> {
  search: string;
  setSearch: (q: string) => void;
  sortKey: K;
  sortDir: "asc" | "desc";
  toggleSort: (key: K) => void;
  filtered: T[];
}

/**
 * Universal hook for table search + sort. Replaces the repeated pattern across pages.
 *
 * @example
 * const { search, setSearch, sortKey, sortDir, toggleSort, filtered } = useTableControls(
 *   invoices, { searchFields: ["invoiceNumber", "contactName"], defaultSort: "date", defaultDir: "desc" }
 * );
 */
export function useTableControls<T extends Record<string, unknown>>(
  data: T[] | null,
  options: TableControlsOptions<T>,
): TableControls<T, keyof T> {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof T>(options.defaultSort);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(options.defaultDir || "asc");

  const toggleSort = (key: keyof T) => {
    if (key === sortKey) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase().trim();

    const list = q
      ? data.filter(item =>
          options.searchFields.some(field => {
            const val = item[field];
            return typeof val === "string" && val.toLowerCase().includes(q);
          })
        )
      : [...data];

    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null || av === undefined) { return (bv === null || bv === undefined) ? 0 : 1; }
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const sa = String(av).toLowerCase();
      const sb = String(bv).toLowerCase();
      if (sa < sb) return sortDir === "asc" ? -1 : 1;
      if (sa > sb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [data, search, sortKey, sortDir, options.searchFields]);

  return { search, setSearch, sortKey, sortDir, toggleSort, filtered };
}
