import { limitedBytes } from "@/lib/request-body";

/** Use the official Tesouro Direto base price, exact security type and maturity. Validate returned dates and reject future or invalid prices. */
import { calendarDay, toDateKey } from "@/modules/quotes/domain/calendar";
import type { QuoteRequest, QuoteResult } from "@/modules/quotes/domain/quote-types";
import { quoteFailure } from "@/modules/quotes/domain/quote-types";
import { latestTreasuryPoint, parseTreasuryCsv, parseTreasurySnapshot, TREASURY_PROVIDER, treasurySeriesOf, type TreasuryBook } from "@/modules/quotes/domain/treasury";
import { fetchProvider, describeProviderError, ProviderRefusalError, QuoteHttpError } from "@/modules/quotes/infrastructure/http";


// The official source publishes this URL; the old treasurybondsinfo.json returned HTTP 410.
export const TREASURY_CSV_URL = "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv";
const CACHE_MS = 60 * 60 * 1000;

export const TREASURY_CURRENT_URL = "https://www.tesourodireto.com.br/o/c/rentabilidades/?pageSize=200";
let current: { book: TreasuryBook; until: number } | null = null;
let currentPending: Promise<TreasuryBook> | null = null;

export async function readCurrentTreasuryBook(): Promise<TreasuryBook> {
  if (current && current.until > Date.now()) return current.book;
  if (currentPending) return currentPending;
  currentPending = (async () => {
    const response = await fetchProvider(TREASURY_CURRENT_URL, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new QuoteHttpError(response.status, `Tesouro listing responded with HTTP ${response.status}.`);
    const book = parseTreasurySnapshot(JSON.parse(new TextDecoder().decode(await limitedBytes(response.body,5_000_000,response.headers.get("content-length")))));
    current = { book, until: Date.now() + 5 * 60_000 };
    return book;
  })().finally(() => { currentPending = null; });
  return currentPending;
}

export type TreasuryBookLoader = () => Promise<TreasuryBook>;


export function createTreasurySource(loadText: () => Promise<string>, clock = Date.now): TreasuryBookLoader {
  let cached: { book: TreasuryBook; until: number } | null = null;
  let pending: Promise<TreasuryBook> | null = null;

  return async () => {
    if (cached && cached.until > clock()) return cached.book;
    if (pending) return pending;

    pending = loadText().then((text) => {
      const book = parseTreasuryCsv(text);
      cached = { book, until: clock() + CACHE_MS };
      return book;
    }).finally(() => { pending = null; });
    return pending;
  };
}

async function loadOfficialText() {
  const response = await fetchProvider(TREASURY_CSV_URL, { cache: "no-store", signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new QuoteHttpError(response.status, `Tesouro Direto responded with HTTP ${response.status}.`);
  return new TextDecoder().decode(await limitedBytes(response.body,100_000_000,response.headers.get("content-length")));
}

const globalForTreasury = globalThis as unknown as { treasuryBookLoader?: TreasuryBookLoader };
export const readTreasuryBook = (globalForTreasury.treasuryBookLoader ??= createTreasurySource(loadOfficialText));


export async function fetchTreasuryQuotes(
  requests: QuoteRequest[],
  { today = toDateKey(calendarDay(new Date())), loadBook = readCurrentTreasuryBook }: { today?: string; loadBook?: TreasuryBookLoader } = {},
): Promise<QuoteResult[]> {
  if (requests.length === 0) return [];

  let book: TreasuryBook;
  try {
    book = await loadBook();
  } catch (error) {
    const described = describeProviderError(error);
    return requests.map((request) => quoteFailure(request.symbol, TREASURY_PROVIDER, described.code, described.message));
  }

  return requests.map((request): QuoteResult => {
    const series = treasurySeriesOf(book, request);
    if (!series) return quoteFailure(request.symbol, TREASURY_PROVIDER, "NOT_FOUND", "Tesouro Direto has not published prices for this security and maturity.");
    if (series.maturityDate <= today) return quoteFailure(request.symbol, TREASURY_PROVIDER, "MATURED_TITLE", "This security has matured; confirm the amount received on liquidation.");
    const point = latestTreasuryPoint(series, today);
    if (!point) return quoteFailure(request.symbol, TREASURY_PROVIDER, "MISSING_QUOTE", "Tesouro Direto has no price for this security up to the requested date.");
    return { symbol: request.symbol, provider: TREASURY_PROVIDER, status: "SUCCESS", valueBrl: point.value, quoteDate: point.day };
  });
}


export async function fetchTreasuryPrice(symbol: string, providerId?: string | null, today?: string) {
  const [result] = await fetchTreasuryQuotes([{ symbol, providerId: providerId ?? undefined, instrumentType: "TESOURO", baseCurrency: "BRL" }], { today });
  if (result.status === "FAILED") throw new ProviderRefusalError(result.errorCode, result.errorMessage);
  return { price: result.valueBrl, quoteDate: result.quoteDate! };
}
