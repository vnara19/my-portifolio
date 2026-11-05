/** Shared rolling periods (1M is 30 days). Every chart starts with the complete recorded history. */
export const CHART_PERIODS = [
  { key: "1m", label: "1M", months: 1 },
  { key: "3m", label: "3M", months: 3 },
  { key: "6m", label: "6M", months: 6 },
  { key: "ytd", label: "YTD", months: "ytd" },
  { key: "1y", label: "1Y", months: 12 },
  { key: "all", label: "All", months: "all" },
] as const;
export type ChartPeriod = typeof CHART_PERIODS[number]["key"];
export function periodStart(end: number, period: ChartPeriod): number {
  if (period === "all") return -Infinity;
  if (period === "1m") return end - 30 * 86400000;
  const date = new Date(end);
  if (period === "ytd") return Date.UTC(date.getUTCFullYear(), 0, 1);
  const months = CHART_PERIODS.find(p=>p.key===period)!.months as number;
  const day = date.getUTCDate();
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth()-months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth()+1, 0)).getUTCDate();
  return Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day,last));
}

/** Monthly observations keep their real bucket dates; they are never interpolated to a daily return. */
export function monthlyObservationTime(month: string, now = Date.now()): number {
  const end = Date.UTC(Number(month.slice(0,4)), Number(month.slice(5,7)), 0);
  return Math.min(end, Math.floor(now / 86400000) * 86400000);
}
