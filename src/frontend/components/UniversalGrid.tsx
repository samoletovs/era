import React, { useMemo, useState } from "react";

export type GridSortDirection = "asc" | "desc";

export interface GridColumn<T> {
  id: string;
  header: string;
  accessor: (row: T) => unknown;
  render?: (row: T) => React.ReactNode;
  /** Mobile-only renderer — shown instead of `render` on small screens */
  renderMobile?: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  width?: string | number;
  sortable?: boolean;
  filterable?: boolean;
  searchable?: boolean;
  className?: string;
  /** Hide this column on mobile (≤768px) */
  hideOnMobile?: boolean;
}

interface UniversalGridProps<T> {
  rows: T[];
  columns: GridColumn<T>[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
  initialSort?: {
    columnId: string;
    direction?: GridSortDirection;
  };
}

function compareGridValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined)
    return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;

  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();
  return sa.localeCompare(sb);
}

export function UniversalGrid<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  searchPlaceholder = "Search...",
  emptyMessage = "No matching rows.",
  initialSort,
}: UniversalGridProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchColumn, setSearchColumn] = useState<string>("__all__");
  const [sortColumnId, setSortColumnId] = useState<string | null>(
    initialSort?.columnId ?? null,
  );
  const [sortDirection, setSortDirection] = useState<GridSortDirection>(
    initialSort?.direction ?? "asc",
  );
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>(
    {},
  );
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters = Object.values(columnFilters).some(
    (v) => v.trim() !== "",
  );

  const processedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    let filtered = rows.filter((row) => {
      const matchesGlobal =
        !q ||
        (() => {
          if (searchColumn === "__all__") {
            return columns
              .filter((col) => col.searchable !== false)
              .some((col) =>
                String(col.accessor(row) ?? "")
                  .toLowerCase()
                  .includes(q),
              );
          }

          const selectedColumn = columns.find((col) => col.id === searchColumn);
          if (!selectedColumn) return true;
          return String(selectedColumn.accessor(row) ?? "")
            .toLowerCase()
            .includes(q);
        })();

      if (!matchesGlobal) return false;

      return columns
        .filter((col) => col.filterable !== false)
        .every((col) => {
          const filter = (columnFilters[col.id] ?? "").trim().toLowerCase();
          if (!filter) return true;
          return String(col.accessor(row) ?? "")
            .toLowerCase()
            .includes(filter);
        });
    });

    if (sortColumnId) {
      const sortColumn = columns.find((col) => col.id === sortColumnId);
      if (sortColumn && sortColumn.sortable !== false) {
        filtered = [...filtered].sort((a, b) => {
          const cmp = compareGridValues(
            sortColumn.accessor(a),
            sortColumn.accessor(b),
          );
          return sortDirection === "asc" ? cmp : -cmp;
        });
      }
    }

    return filtered;
  }, [
    rows,
    columns,
    searchQuery,
    searchColumn,
    columnFilters,
    sortColumnId,
    sortDirection,
  ]);

  function handleSort(column: GridColumn<T>) {
    if (column.sortable === false) return;

    if (sortColumnId === column.id) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortColumnId(column.id);
    setSortDirection("asc");
  }

  return (
    <div className="universal-grid-wrap">
      <div className="filter-bar universal-grid-toolbar">
        <input
          type="text"
          className="table-search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label="Search table"
        />

        <select
          className="table-filter-select"
          value={searchColumn}
          onChange={(e) => setSearchColumn(e.target.value)}
          aria-label="Search column"
        >
          <option value="__all__">Search all columns</option>
          {columns
            .filter((col) => col.searchable !== false)
            .map((col) => (
              <option key={col.id} value={col.id}>
                {col.header}
              </option>
            ))}
        </select>

        <button
          className={`grid-filter-toggle${showFilters ? " active" : ""}${hasActiveFilters ? " has-filters" : ""}`}
          onClick={() => setShowFilters((prev) => !prev)}
          aria-label={
            showFilters ? "Hide column filters" : "Show column filters"
          }
          title="Column filters"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1.5 2h13M4 6h8M6 10h4M7 14h2" />
          </svg>
          {hasActiveFilters && <span className="grid-filter-dot" />}
        </button>

        <span className="universal-grid-count">
          {processedRows.length} result{processedRows.length !== 1 ? "s" : ""}
        </span>
      </div>

      <table className="data-table universal-data-table">
        <thead>
          <tr>
            {columns.map((column) => {
              const isSorted = sortColumnId === column.id;
              return (
                <th
                  key={column.id}
                  className={`${column.sortable === false ? "" : `sortable-th${isSorted ? " sorted" : ""}`}${column.hideOnMobile ? " hide-on-mobile" : ""}`}
                  onClick={
                    column.sortable === false
                      ? undefined
                      : () => handleSort(column)
                  }
                  aria-sort={
                    isSorted
                      ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  style={{
                    textAlign: column.align,
                    width: column.width,
                  }}
                >
                  {column.header}
                  {isSorted && (
                    <span className="sort-indicator">
                      {sortDirection === "asc" ? " ▲" : " ▼"}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
          {showFilters && (
            <tr className="universal-grid-filter-row">
              {columns.map((column) => (
                <th
                  key={`${column.id}-filter`}
                  className={column.hideOnMobile ? "hide-on-mobile" : ""}
                  style={{ textAlign: column.align }}
                >
                  {column.filterable === false ? null : (
                    <input
                      type="text"
                      className="table-search-input universal-grid-filter-input"
                      value={columnFilters[column.id] ?? ""}
                      onChange={(e) => {
                        const next = e.target.value;
                        setColumnFilters((prev) => ({
                          ...prev,
                          [column.id]: next,
                        }));
                      }}
                      placeholder={`Filter ${column.header.toLowerCase()}...`}
                      aria-label={`Filter ${column.header}`}
                    />
                  )}
                </th>
              ))}
            </tr>
          )}
        </thead>

        <tbody>
          {processedRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="universal-grid-empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            processedRows.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? "row-clickable" : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={`${rowKey(row, index)}-${column.id}`}
                    className={`${column.className || ""}${column.hideOnMobile ? " hide-on-mobile" : ""}`}
                    style={{ textAlign: column.align }}
                  >
                    {column.render
                      ? column.render(row)
                      : String(column.accessor(row) ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
