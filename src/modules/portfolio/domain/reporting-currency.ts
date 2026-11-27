import { Prisma } from "@/generated/prisma/client";

export type ReportingAmounts = { USD: number | null; EUR: number | null; BRL: number };
export type ReportingChange = { amounts: ReportingAmounts | null; percentUsd: number | null };

/** Rates are BRL per unit. Never substitute a current rate for a missing historical rate. */
export function convertBrl(value: number, rate: number | null): number | null {
  return rate !== null && Number.isFinite(rate) && rate > 0 && Number.isFinite(value)
    ? new Prisma.Decimal(value).div(rate).toNumber()
    : null;
}

export function reportingAmounts(totalBrl: number, usdBrl: number | null, eurBrl: number | null): ReportingAmounts {
  return { USD: convertBrl(totalBrl, usdBrl), EUR: convertBrl(totalBrl, eurBrl), BRL: totalBrl };
}

/** Balance changes include cash flows and FX; they are not time-weighted investment returns. */
export function reportingChange(current: ReportingAmounts, previous: ReportingAmounts | null): ReportingChange {
  if (!previous) return { amounts: null, percentUsd: null };
  const subtract = (a: number | null, b: number | null) => a === null || b === null ? null : new Prisma.Decimal(a).minus(b).toNumber();
  const usd = subtract(current.USD, previous.USD);
  return {
    amounts: { USD: usd, EUR: subtract(current.EUR, previous.EUR), BRL: subtract(current.BRL, previous.BRL)! },
    percentUsd: usd === null || previous.USD === null || previous.USD === 0
      ? null : new Prisma.Decimal(usd).div(previous.USD).mul(100).toNumber(),
  };
}
