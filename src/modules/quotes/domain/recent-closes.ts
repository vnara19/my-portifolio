export type ClosingPoint = { day: string; value: number };
export type ClosingRate = { day: string; rate: number };

/** Preserve native closing prices; BRL is only storage, using the rate recorded for that day. */
export function completedCloses(points: ClosingPoint[], rates: ClosingRate[], currency: string, today: string) {
  if (!["BRL", "EUR", "USD"].includes(currency)) throw new Error("Unsupported closing-price currency.");
  const first = Date.parse(today) - 14 * 86400000;
  const seen = new Set<string>();
  return points.filter(p => p.day < today && Date.parse(p.day) >= first).map(p => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.day) || new Date(p.day).toISOString().slice(0, 10) !== p.day || !Number.isFinite(p.value) || p.value <= 0 || seen.has(p.day)) throw new Error("Invalid or duplicate closing price.");
    seen.add(p.day);
    const rate = currency === "BRL" ? { day: p.day, rate: 1 } : rates.filter(r => r.day <= p.day).sort((a, b) => b.day.localeCompare(a.day))[0];
    if (!rate || !Number.isFinite(rate.rate) || rate.rate <= 0 || Date.parse(p.day) - Date.parse(rate.day) > 7 * 86400000) throw new Error(`Missing dated exchange rate for ${p.day}.`);
    return { day: p.day, valueBrl: p.value * rate.rate };
  });
}
