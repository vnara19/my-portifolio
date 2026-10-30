import { datedFx, type FxPoint } from "./position-money";

/** Convert every index observation before computing returns; never convert a percentage. */
export function benchmarkInEur(points: { day: string; value: number }[], usd: FxPoint[], eur: FxPoint[]) {
  const converted: { day: string; value: number }[] = [];
  for (const point of points) {
    const dollar = datedFx(point.day, null, "USD", usd, new Map());
    const euro = datedFx(point.day, null, "EUR", eur, new Map());
    if (!dollar || !euro) return null;
    const value = point.value * dollar.rate / euro.rate;
    if (!Number.isFinite(value) || value <= 0) return null;
    converted.push({ day: point.day, value });
  }
  return converted;
}
