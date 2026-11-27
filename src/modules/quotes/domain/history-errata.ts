/** Vendor errata, not replacement prices. A corrected observation is automatically accepted. */
const CURRENCY_COLLISIONS = [
  // Both the EUR and CHF listings returned this identical, zero-volume NAV-like value.
  { symbol: "UETW.DE", day: "2025-10-24", value: 39.938499450683594 },
  // iShares publishes approximately USD 79.69 NAV on this date, not EUR 79.69.
  // https://www.ishares.com/uk/individual/en/products/258441/ishares-physical-gold-etc-fund
  { symbol: "EGLN.L", day: "2025-10-24", value: 79.68769836425781 },
];

export function usableHistoricalClose(symbol: string, day: string, value: number) {
  return !CURRENCY_COLLISIONS.some(p => p.symbol === symbol && p.day === day && Math.abs(p.value - value) < 1e-6);
}
