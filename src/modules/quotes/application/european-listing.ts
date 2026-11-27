import { fetchYahooPrice, searchEuropeanListings } from "@/modules/quotes/infrastructure/yahoo";

export type EuropeanCandidate = { symbol: string; name: string; exchange: string; currency: string | null };

// A stable reference venue preference, not a claim about each instrument's liquidity.
const VENUES = ["DE", "PA", "AS", "MI", "F", "SG", "MU", "BE", "VI", "BR", "L"];
function rank(symbol: string) {
  const position = VENUES.indexOf(symbol.split(".").at(-1)!);
  return position < 0 ? VENUES.length : position;
}
function comparableName(name: string) {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Currency comes from a live listing quote, never its suffix or fund base-currency label. */
export function preferredEuroListing(listings: EuropeanCandidate[]): EuropeanCandidate | null {
  const euro = listings.filter((listing) => listing.currency === "EUR");
  if (!euro.length) return null;
  const major = euro.filter((listing) => ["DE", "PA", "AS", "MI"].includes(listing.symbol.split(".").at(-1)!));
  const eligible = major.length ? major : euro;
  const names = eligible.map((listing) => comparableName(listing.name));
  // Truncated provider names are acceptable only when they are long, matching prefixes.
  if (!names.every((name) => names.every((other) => name === other ||
    (Math.min(name.length, other.length) >= 30 && (name.startsWith(other) || other.startsWith(name)))))) return null;
  return [...eligible].sort((a, b) => rank(a.symbol) - rank(b.symbol) || a.symbol.localeCompare(b.symbol))[0];
}

const cache = new Map<string, { expires: number; result: Promise<EuropeanCandidate[]> }>();
async function search(query: string): Promise<EuropeanCandidate[]> {
  const found = await searchEuropeanListings(query);
  const exact = found.filter((listing) => listing.symbol.split(".")[0] === query);
  const candidates = [...(exact.length ? exact : found)].sort((a, b) => rank(a.symbol) - rank(b.symbol));
  // Bound fan-out and process four observations at a time. No private portfolio data is cached.
  const verified: EuropeanCandidate[] = [];
  for (let offset = 0; offset < Math.min(candidates.length, 8); offset += 4) {
    const batch = await Promise.allSettled(candidates.slice(offset, Math.min(offset + 4, 8)).map(async (listing) => {
      const quote = await fetchYahooPrice(listing.symbol, 5_000);
      return { ...listing, name: quote.name ?? listing.name, exchange: quote.exchange ?? listing.exchange, currency: quote.currency };
    }));
    for (const result of batch) if (result.status === "fulfilled") verified.push(result.value);
  }
  return verified;
}

export async function resolveEuropeanTicker(query: string) {
  const key = query.trim().toUpperCase();
  let entry = cache.get(key);
  if (!entry || entry.expires <= Date.now()) {
    entry = { expires: Date.now() + 60_000, result: search(key) };
    cache.set(key, entry);
    if (cache.size > 250) cache.delete(cache.keys().next().value!);
  }
  try {
    const listings = await entry.result;
    return { listings, preferred: preferredEuroListing(listings) };
  } catch (error) { cache.delete(key); throw error; }
}
