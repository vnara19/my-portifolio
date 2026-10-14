
/** English formatting for dates, prices and percentages. Accept English numeric input and legacy Brazilian decimal input. */
export function formatBrl(value: number, options?: { compact?: boolean }) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "BRL",
    notation: options?.compact ? "compact" : "standard",
    maximumFractionDigits: options?.compact ? 1 : 2,
  }).format(value);
}


export function formatPriceBrl(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(value);
}

export function parseLocaleNumber(value: string) {
  const trimmed = value.trim().replace(/\s/g, "");
  const comma = trimmed.lastIndexOf(",");
  const dot = trimmed.lastIndexOf(".");
  // Accept English grouping and decimal separators, plus legacy Brazilian input.
  const normalized = comma >= 0 && dot >= 0
    ? comma > dot ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed.replace(/,/g, "")
    : comma >= 0 ? /^\d{1,3}(,\d{3})+$/.test(trimmed) ? trimmed.replace(/,/g, "") : trimmed.replace(",", ".")
    : trimmed;

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  return Number(normalized);
}

export function formatSharePercent(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(value / 100);
}

export function formatMonthCompact(date: Date) {
  const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" })
    .format(date)
    .replace(".", "");

  return `${month.charAt(0).toLocaleUpperCase("en-GB")}${month.slice(1)}/${String(
    date.getUTCFullYear(),
  ).slice(2)}`;
}

export function formatMonth(date: Date, short = false) {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    month: short ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

  return formatted.charAt(0).toLocaleUpperCase("en-GB") + formatted.slice(1);
}

/** Explicit ISO currency labels make the reporting order unambiguous. */
export function formatCurrency(value: number, currency: "USD" | "EUR" | "BRL", signed = false, decimals = 2) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency", currency, currencyDisplay: "code",
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(value);
}
