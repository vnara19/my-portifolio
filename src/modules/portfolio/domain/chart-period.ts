/** Shared calendar periods. Every chart starts with the complete recorded history. */
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
  const date = new Date(end);
  if (period === "ytd") return Date.UTC(date.getUTCFullYear(), 0, 1);
  const months = CHART_PERIODS.find(p=>p.key===period)!.months as number;
  const day = date.getUTCDate();
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth()-months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth()+1, 0)).getUTCDate();
  return Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day,last));
}
