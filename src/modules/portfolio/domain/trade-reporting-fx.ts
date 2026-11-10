import { Prisma } from "@/generated/prisma/client";
import type { MoneyCurrency } from "./position-money";

export type ReportingFxPoint = { day: string; rate: Prisma.Decimal; provider: string; fetchedAt: Date };
export type ReportingFxSeries = Record<"USD" | "EUR", ReportingFxPoint[]>;

const nativeMarker = /\bFX (\d+(?:\.\d+)?) BRL\/(USD|EUR|BRL)\./;

type StoredUsdReference = { tradeDay: string; day: string; currency: MoneyCurrency; usdPerUnit: string; fetchedAt: string };
const usdMarker = / USD valuation FX: (\d+(?:\.\d+)?) USD\/(USD|EUR|BRL) on (\d{4}-\d{2}-\d{2}) for trade (\d{4}-\d{2}-\d{2}) \(ECB reference, fetched (\d{4}-\d{2}-\d{2}T[\d:.]+Z)\)\./;

export function storedUsdReference(note: string | null): StoredUsdReference | null {
  const match = usdMarker.exec(note ?? "");
  if (!match || !Number.isFinite(Date.parse(match[5])) || !new Prisma.Decimal(match[1]).gt(0)) return null;
  return { tradeDay: match[4], day: match[3], currency: match[2] as MoneyCurrency, usdPerUnit: match[1], fetchedAt: match[5] };
}

export function usdReferenceNote(reference: StoredUsdReference) {
  return ` USD valuation FX: ${reference.usdPerUnit} USD/${reference.currency} on ${reference.day} for trade ${reference.tradeDay} (ECB reference, fetched ${reference.fetchedAt}).`;
}

const executionMarker = / USD execution FX: (\d+(?:\.\d+)?) USD\/(EUR|BRL) for trade (\d{4}-\d{2}-\d{2}) \(broker, recorded (\d{4}-\d{2}-\d{2}T[\d:.]+Z)\)\./g;

export function executionFxNote(currency: "EUR" | "BRL", rate: string, tradeDay: string, recordedAt: Date) {
  return ` USD execution FX: ${rate} USD/${currency} for trade ${tradeDay} (broker, recorded ${recordedAt.toISOString()}).`;
}

/** BRL is a storage bridge, not a broker exchange. For a known native
 * amount, use both reference legs from one observation day and provider.
 */
export function tradeReportingFx(day: string, note: string | null, target: "USD" | "EUR", series: ReportingFxSeries) {
  const marker = nativeMarker.exec(note ?? "");
  const native = marker?.[2] as MoneyCurrency | undefined;
  const stored = marker ? new Prisma.Decimal(marker[1]) : null;
  if (target === "USD" && stored?.gt(0) && native !== "USD") {
    const execution = [...(note ?? "").matchAll(executionMarker)].reverse().find(match =>
      match[2] === native && match[3] === day && Number.isFinite(Date.parse(match[4])) && new Prisma.Decimal(match[1]).gt(0));
    if (execution) {
      const nativeRate = new Prisma.Decimal(execution[1]);
      return { divisor: stored.div(nativeRate), nativeRate, reference: null };
    }
  }
  const snapshot = target === "USD" ? storedUsdReference(note) : null;
  if (snapshot && snapshot.tradeDay === day && snapshot.currency === native && snapshot.day <= day &&
    Date.parse(day) - Date.parse(snapshot.day) <= 7 * 86400000 && stored?.gt(0)) {
    const nativeRate = new Prisma.Decimal(snapshot.usdPerUnit);
    return { divisor: stored.div(nativeRate), nativeRate, reference: {
      day: snapshot.day, provider: "frankfurter-ecb", fetchedAt: new Date(snapshot.fetchedAt),
    } };
  }
  const direct = (currency: "USD" | "EUR") => series[currency].filter(point =>
    point.day <= day && Date.parse(day) - Date.parse(point.day) <= 7 * 86400000 && point.rate.gt(0));
  if (native === target && stored?.gt(0)) return { divisor: stored, nativeRate: new Prisma.Decimal(1), reference: null };
  if (native && native !== "BRL" && stored?.gt(0)) {
    const from = new Map(direct(native).map(point => [point.day, point]));
    for (const reference of direct(target).reverse()) {
      const base = from.get(reference.day);
      if (!base || base.provider !== reference.provider) continue;
      const nativeRate = base.rate.div(reference.rate);
      return { divisor: stored.div(nativeRate), nativeRate, reference };
    }
    return null;
  }
  const reference = direct(target).at(-1);
  return reference ? { divisor: reference.rate, nativeRate: native === "BRL" ? new Prisma.Decimal(1).div(reference.rate) : null, reference } : null;
}

export function reportingFxSeries(rows: { symbol: string; quoteDate: Date; valueBrl: Prisma.Decimal; provider: string; fetchedAt: Date }[]): ReportingFxSeries {
  return { USD: rows.filter(row => row.symbol === "USD").map(point), EUR: rows.filter(row => row.symbol === "EUR").map(point) };
}
function point(row: Parameters<typeof reportingFxSeries>[0][number]) {
  return { day: row.quoteDate.toISOString().slice(0, 10), rate: row.valueBrl, provider: row.provider, fetchedAt: row.fetchedAt };
}
