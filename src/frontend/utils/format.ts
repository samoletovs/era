import type { NumberFormat, NumberSequence, DateFormat, DateTimeFormat } from "@shared/types";

const FORMAT_CONFIG: Record<NumberFormat, { thousands: string; decimal: string }> = {
  space_comma: { thousands: "\u00A0", decimal: "," },  // 1 234 567,89
  dot_comma:   { thousands: ".",     decimal: "," },     // 1.234.567,89
  comma_dot:   { thousands: ",",     decimal: "." },     // 1,234,567.89
  space_dot:   { thousands: "\u00A0", decimal: "." },  // 1 234 567.89
  none_dot:    { thousands: "",      decimal: "." },     // 1234567.89
  none_comma:  { thousands: "",      decimal: "," },     // 1234567,89
};

const FORMAT_LABELS: Record<NumberFormat, string> = {
  space_comma: "1 234 567,89",
  dot_comma:   "1.234.567,89",
  comma_dot:   "1,234,567.89",
  space_dot:   "1 234 567.89",
  none_dot:    "1234567.89",
  none_comma:  "1234567,89",
};

export { FORMAT_LABELS };

export function formatMoney(value: number | null | undefined, format: NumberFormat = "space_comma"): string {
  const num = value ?? 0;
  const { thousands, decimal } = FORMAT_CONFIG[format];
  const abs = Math.abs(num);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  const sign = num < 0 ? "−" : "";
  return `€${sign}${grouped}${decimal}${decPart}`;
}

/** Format money only if the value is truthy, otherwise return empty string */
export function formatMoneyOr(value: number | null | undefined, format: NumberFormat = "space_comma", fallback = ""): string {
  if (!value) return fallback;
  return formatMoney(value, format);
}

/** Preview a number sequence format, e.g. "INV-000001" */
export function formatSequencePreview(seq: NumberSequence): string {
  const sep = seq.separator ?? "-";
  const padded = String(seq.nextNumber).padStart(seq.padding, "0");
  const suffix = seq.suffix ? `${sep}${seq.suffix}` : "";
  return `${seq.prefix}${sep}${padded}${suffix}`;
}

// ─── Date Formatting ────────────────────────────────────────

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad2(n: number): string { return String(n).padStart(2, "0"); }

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  "dd.MM.yyyy":  "22.03.2026",
  "dd/MM/yyyy":  "22/03/2026",
  "MM/dd/yyyy":  "03/22/2026",
  "yyyy-MM-dd":  "2026-03-22",
  "dd-MM-yyyy":  "22-03-2026",
  "dd MMM yyyy": "22 Mar 2026",
};

export const DATETIME_FORMAT_LABELS: Record<DateTimeFormat, string> = {
  "24h": "14:30",
  "12h": "2:30 PM",
};

export function formatDate(value: string | null | undefined, format: DateFormat = "dd.MM.yyyy"): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const dd = pad2(d.getDate());
  const mm = pad2(d.getMonth() + 1);
  const yyyy = String(d.getFullYear());
  const mmm = MONTH_SHORT[d.getMonth()];
  switch (format) {
    case "dd.MM.yyyy":  return `${dd}.${mm}.${yyyy}`;
    case "dd/MM/yyyy":  return `${dd}/${mm}/${yyyy}`;
    case "MM/dd/yyyy":  return `${mm}/${dd}/${yyyy}`;
    case "yyyy-MM-dd":  return `${yyyy}-${mm}-${dd}`;
    case "dd-MM-yyyy":  return `${dd}-${mm}-${yyyy}`;
    case "dd MMM yyyy": return `${dd} ${mmm} ${yyyy}`;
    default:            return `${dd}.${mm}.${yyyy}`;
  }
}

export function formatTime(value: string | null | undefined, format: DateTimeFormat = "24h"): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const h = d.getHours();
  const m = pad2(d.getMinutes());
  if (format === "12h") {
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }
  return `${pad2(h)}:${m}`;
}

export function formatDateTime(value: string | null | undefined, dateFmt: DateFormat = "dd.MM.yyyy", timeFmt: DateTimeFormat = "24h"): string {
  if (!value) return "";
  return `${formatDate(value, dateFmt)} ${formatTime(value, timeFmt)}`;
}
