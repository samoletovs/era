/** Universal status badge — single source of truth for status display across all pages */
export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replace(/\s+/g, "_");
  return <span className={`badge badge-${normalized}`}>{status.replace(/_/g, " ")}</span>;
}
