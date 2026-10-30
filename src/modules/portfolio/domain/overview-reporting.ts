import { Prisma } from "@/generated/prisma/client";
import { unavailableGains, type PortfolioGains } from "./portfolio-gains";
import type { OverviewPerformanceMetrics } from "./overview-performance-metrics";

/** One EUR reference result, expressed in USD. Percentages are dimensionless and unchanged. */
export function eurToUsdRate(eurBrl: number | null, usdBrl: number | null): number | null {
  return eurBrl !== null && usdBrl !== null && Number.isFinite(eurBrl) && Number.isFinite(usdBrl) && eurBrl > 0 && usdBrl > 0
    ? new Prisma.Decimal(eurBrl).div(usdBrl).toNumber() : null;
}

export function expressEurGainsInUsd(gains: PortfolioGains, rate: number | null): PortfolioGains {
  if (rate === null || !Number.isFinite(rate) || rate <= 0) return { ...unavailableGains(), issue: "historical-fx" };
  const money = (value: number | null) => value === null ? null : new Prisma.Decimal(value).mul(rate).toDecimalPlaces(2).toNumber();
  return { ...gains, unrealizedUsd: money(gains.unrealizedUsd), realizedUsd: money(gains.realizedUsd), totalUsd: money(gains.totalUsd) };
}

export function expressEurMetricsInUsd(metrics: OverviewPerformanceMetrics, rate: number | null): OverviewPerformanceMetrics {
  return { ...metrics, dailyUsd: metrics.dailyUsd !== null && rate !== null && Number.isFinite(rate) && rate > 0
    ? new Prisma.Decimal(metrics.dailyUsd).mul(rate).toDecimalPlaces(2).toNumber() : null };
}
