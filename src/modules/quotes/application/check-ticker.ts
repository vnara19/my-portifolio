
/** Verify the complete ticker against its provider before issuing a signed, short-lived proof for saving a position. */
import { getPrismaClient } from "@/lib/prisma";
import { currentUserId, getUserDb } from "@/lib/user-db";
import {
  ASSET_KIND_DEFINITIONS,
  baseCurrencyOf,
  normalizeTicker,
  providerForQuote,
  type AssetKind,
  type QuoteProvider,
} from "@/modules/portfolio/domain/asset-kinds";
import { getQuoteProviderConfiguration } from "@/modules/quotes/application/fetch-current-quotes";
import { readMonthQuoteValues } from "@/modules/quotes/application/month-quote-values";
import { createVerifiedTickerToken, readVerifiedTickerToken } from "@/modules/quotes/application/verified-ticker-token";
import { calendarDay, toDateKey } from "@/modules/quotes/domain/calendar";
import { providerLabel } from "@/modules/quotes/domain/quote-refresh";
import type { QuoteProviderConfiguration } from "@/modules/quotes/domain/quote-types";
import type { CoinCandidate, TickerCheckResponse } from "@/modules/quotes/domain/ticker-check";
import { lookupAlphaVantageSymbol } from "@/modules/quotes/infrastructure/alpha-vantage";
import { fetchUsdBrl } from "@/modules/quotes/infrastructure/awesome-api";
import {
  fetchCoinGeckoPrices,
  resolveCoinGeckoCoin,
  searchCoinGeckoCoins,
} from "@/modules/quotes/infrastructure/coingecko";
import { lookupFinnhubSymbol } from "@/modules/quotes/infrastructure/finnhub";
import { describeProviderError } from "@/modules/quotes/infrastructure/http";
import { fetchYahooPrice } from "@/modules/quotes/infrastructure/yahoo";
import { latestTreasuryPoint, treasurySeriesOf } from "@/modules/quotes/domain/treasury";
import { readTreasuryBook } from "@/modules/quotes/infrastructure/treasury";
import { isMarketKind } from "@/modules/portfolio/domain/market-assets";
import { lookupMarketListing } from "./market-listing";


export type { VerifiedTicker } from "@/modules/quotes/application/verified-ticker-token";
export const readVerifiedTicker = readVerifiedTickerToken;

const LOOKUP_TTL_MS = 60 * 1000;

type Lookup =
  | { state: "found"; priceBrl: number; coinId: string | null; name: string | null; quoteDate?: string; coins?: CoinCandidate[] }
  | { state: "not-found" }
  | { state: "unavailable"; code: string; message: string };


type CachedLookup = { lookup: Extract<Lookup, { state: "found" | "not-found" }>; fetchedAt: Date; expiresAt: number };

const globalForTickers = globalThis as unknown as {
  tickerLookupCache?: Map<string, CachedLookup>;
};
const lookupCache = (globalForTickers.tickerLookupCache ??= new Map<string, CachedLookup>());

export async function checkTicker(
  input: { monthId: string; kind: AssetKind; ticker: string; coinId?: string },
  options: { configuration?: QuoteProviderConfiguration; now?: Date } = {},
): Promise<TickerCheckResponse> {
  const definition = ASSET_KIND_DEFINITIONS[input.kind];

  if (definition.ticker !== "market" || !definition.provider || !definition.instrumentType) {
    return { status: "invalid", message: "This asset type has no ticker to verify." };
  }

  const symbol = normalizeTicker(input.kind, input.ticker);

  if (!symbol) {
    return { status: "invalid", message: "Enter a valid ticker for this asset type." };
  }

  const prisma = await getUserDb();

  if (!prisma) {
    throw new Error("The database is unavailable.");
  }

  const month = await prisma.portfolioMonth.findUnique({
    where: { id: input.monthId },
    select: { referenceDate: true },
  });

  if (!month) {
    return { status: "invalid", message: "The reporting month no longer exists." };
  }

  if (isMarketKind(input.kind)) {
    const now = options.now ?? new Date();
    try {
      const [listing, saved] = await Promise.all([lookupMarketListing(input.kind, symbol, toDateKey(now)), readMonthQuoteValues(prisma, month.referenceDate, [symbol])]);
      const existing = saved.get(symbol);
      const priceBrl = existing?.valueBrl.toNumber() ?? listing.priceBrl;
      const quoteDate = existing?.quoteDate ? toDateKey(existing.quoteDate) : listing.quoteDate;
      const token = createVerifiedTickerToken({ symbol, kind: input.kind, provider: "yahoo", status: "found", priceBrl, coinId: null,
        identity: listing.identity, quoteDate: new Date(`${quoteDate}T00:00:00Z`), fetchedAt: now }, { userId: await currentUserId(), monthId: input.monthId, now });
      return { status: "found", symbol, provider: "yahoo", priceBrl, name: listing.identity.name, quoteDate, token, identity: listing.identity };
    } catch (error) {
      return { status: "invalid", message: error instanceof Error ? error.message : "Could not verify this listing. Please try again." };
    }
  }

  const provider = providerForQuote(definition.instrumentType, baseCurrencyOf(input.kind, symbol));
  const [monthQuote, latestQuote, latestDaily] = await Promise.all([

    readMonthQuoteValues(prisma, month.referenceDate, [symbol]).then((quotes) => quotes.get(symbol)),
    prisma.marketQuote.findFirst({
      where: { symbol },
      orderBy: { referenceDate: "desc" },
      select: { instrumentType: true, baseCurrency: true },
    }),
    prisma.dailyQuote.findFirst({
      where: { symbol },
      orderBy: { quoteDate: "desc" },
      select: { instrumentType: true, baseCurrency: true },
    }),
  ]);


  const stored = monthQuote ?? latestQuote ?? latestDaily;
  if (stored && providerForQuote(stored.instrumentType, stored.baseCurrency) !== provider) {
    return {
      status: "conflict",
      symbol,
      message: `${symbol} is already quoted in the portfolio by another provider (${providerLabel(
        providerForQuote(stored.instrumentType, stored.baseCurrency),
      )}). Choose the corresponding type.`,
    };
  }

  if (monthQuote) {
    return { status: "known", symbol, priceBrl: monthQuote.valueBrl.toNumber() };
  }

  const now = options.now ?? new Date();
  const context = { userId: await currentUserId(), monthId: input.monthId, now };

  const cacheSymbol = provider === "coingecko" && input.coinId ? `${symbol}:${input.coinId}` : symbol;
  const { lookup, fetchedAt } = await cachedLookup(provider, cacheSymbol, now, async () => {


    const stored =
      provider === "coingecko"
        ? await getPrismaClient()!.asset.findFirst({
            where: { quoteSymbol: symbol, quoteProviderId: { not: null } },
            orderBy: { createdAt: "asc" },
            select: { quoteProviderId: true },
          })
        : null;

    return lookupSymbol(
      provider,
      symbol,
      options.configuration ?? getQuoteProviderConfiguration(),
      stored?.quoteProviderId ?? null,
      input.coinId ?? null,
      toDateKey(now),
    );
  });
  const quoteDate = lookup.state === "found" && lookup.quoteDate
    ? new Date(`${lookup.quoteDate}T00:00:00Z`) : calendarDay(fetchedAt);

  if (lookup.state === "not-found") {
    return {
      status: "not-found",
      symbol,
      provider,
      message: `${providerLabel(provider)} did not find the ticker ${symbol}.`,
    };
  }

  if (lookup.state === "unavailable") {
    const token = createVerifiedTickerToken({
      symbol,
      kind: input.kind,
      status: "unavailable",
      provider,
      priceBrl: null,
      coinId: null,
      quoteDate,
      fetchedAt,
    }, context);
    return { status: "unavailable", symbol, provider, code: lookup.code, message: lookup.message, token };
  }

  const token = createVerifiedTickerToken({
    symbol,
    kind: input.kind,
    status: "found",
    provider,
    priceBrl: lookup.priceBrl,
    coinId: lookup.coinId,
    quoteDate,
    fetchedAt,
  }, context);

  return {
    status: "found",
    symbol,
    provider,
    priceBrl: lookup.priceBrl,
    name: lookup.name,
    quoteDate: toDateKey(quoteDate),
    token,
    coinId: lookup.coinId,
    ...(lookup.coins && lookup.coins.length > 1 ? { coins: lookup.coins } : {}),
  };
}

async function cachedLookup(
  provider: QuoteProvider,
  symbol: string,
  now: Date,
  lookup: () => Promise<Lookup>,
): Promise<{ lookup: Lookup; fetchedAt: Date }> {
  const key = `${provider}:${symbol}`;
  const cached = lookupCache.get(key);

  if (
    cached &&
    cached.expiresAt > now.getTime() &&
    calendarDay(cached.fetchedAt).getTime() === calendarDay(now).getTime()
  ) {
    return cached;
  }

  for (const [entryKey, entry] of lookupCache) {
    if (entry.expiresAt <= now.getTime()) {
      lookupCache.delete(entryKey);
    }
  }

  const result = await lookup();

  if (result.state === "unavailable") {
    lookupCache.delete(key);
  } else {
    lookupCache.set(key, { lookup: result, fetchedAt: now, expiresAt: now.getTime() + LOOKUP_TTL_MS });
  }

  return { lookup: result, fetchedAt: now };
}

async function lookupSymbol(
  provider: QuoteProvider,
  symbol: string,
  configuration: QuoteProviderConfiguration,
  storedCoinId: string | null,
  chosenCoinId: string | null,
  today: string,
): Promise<Lookup> {
  try {
    switch (provider) {
      case "tesouro": {
        const series = treasurySeriesOf(await readTreasuryBook(), { symbol, providerId: chosenCoinId });
        if (!series || series.maturityDate <= today) return { state: "not-found" };
        const point = latestTreasuryPoint(series, today);
        return point
          ? { state: "found", priceBrl: point.value, quoteDate: point.day, coinId: series.providerId, name: series.name }
          : { state: "unavailable", code: "MISSING_QUOTE", message: "Tesouro Direto has not published a market price for this security." };
      }
      case "finnhub": {


        let priceUsd: number | null = null;

        if (configuration.finnhubApiKey) {
          try {
            const result = await lookupFinnhubSymbol(symbol, configuration.finnhubApiKey);

            if (!result.found) {
              return { state: "not-found" };
            }

            priceUsd = result.priceUsd;
          } catch {
            priceUsd = null;
          }
        }

        if (priceUsd === null) {
          const yahoo = await lookupYahoo(symbol);

          if (yahoo.state !== "found") {
            return yahoo;
          }

          priceUsd = yahoo.price;
        }


        try {
          const usdBrl = await fetchUsdBrl(configuration.awesomeApiKey);
          return { state: "found", priceBrl: priceUsd * usdBrl, coinId: null, name: null };
        } catch (error) {
          const described = describeProviderError(error);
          return {
            state: "unavailable",
            code: described.code,
            message: `${symbol} exists, but AwesomeAPI did not return today's exchange rate: ${described.message}`,
          };
        }
      }
      case "yahoo": {


        const yahoo = await lookupYahoo(symbol);

        if (yahoo.state === "found") {
          return { state: "found", priceBrl: yahoo.price, coinId: null, name: yahoo.name };
        }

        if (yahoo.state === "not-found" || !configuration.alphaVantageApiKey) {
          return yahoo;
        }

        const result = await lookupAlphaVantageSymbol(symbol, configuration.alphaVantageApiKey);
        return result.found
          ? { state: "found", priceBrl: result.priceBrl, coinId: null, name: null }
          : { state: "not-found" };
      }
      case "alpha-vantage": {
        if (!configuration.alphaVantageApiKey) {
          return missingKey("ALPHA_VANTAGE_API_KEY");
        }

        const result = await lookupAlphaVantageSymbol(symbol, configuration.alphaVantageApiKey);
        return result.found
          ? { state: "found", priceBrl: result.priceBrl, coinId: null, name: null }
          : { state: "not-found" };
      }
      case "coingecko": {


        let coin: { id: string; name: string | null } | null;
        let coins: CoinCandidate[] | undefined;

        if (storedCoinId) {
          coin = { id: storedCoinId, name: null };
        } else if (symbol === "BTC" || symbol === "SOL") {
          coin = await resolveCoinGeckoCoin(symbol, configuration.coinGeckoApiKey);
        } else {
          coins = await searchCoinGeckoCoins(symbol, configuration.coinGeckoApiKey);
          coin = (chosenCoinId ? coins.find((candidate) => candidate.id === chosenCoinId) : null) ?? coins[0] ?? null;
        }

        if (!coin) {
          return { state: "not-found" };
        }

        const price = (await fetchCoinGeckoPrices([coin.id], configuration.coinGeckoApiKey)).get(coin.id);
        return price
          ? { state: "found", priceBrl: price, coinId: coin.id, name: coin.name, coins }
          : { state: "unavailable", code: "MISSING_QUOTE", message: `CoinGecko did not return the price for ${symbol}.` };
      }
      default:
        return { state: "unavailable", code: "UNSUPPORTED", message: "This type has no verification provider." };
    }
  } catch (error) {
    const described = describeProviderError(error);
    return { state: "unavailable", code: described.code, message: described.message };
  }
}

async function lookupYahoo(
  symbol: string,
): Promise<{ state: "found"; price: number; name: string | null } | { state: "not-found" } | { state: "unavailable"; code: string; message: string }> {
  try {
    const result = await fetchYahooPrice(symbol);
    return { state: "found", price: result.price, name: result.name };
  } catch (error) {
    const described = describeProviderError(error);

    if (described.code === "NOT_FOUND") {
      return { state: "not-found" };
    }

    return { state: "unavailable", code: described.code, message: `Yahoo Finance: ${described.message}` };
  }
}

function missingKey(variable: string): Lookup {
  return {
    state: "unavailable",
    code: "MISSING_API_KEY",
    message: `Configure ${variable} to verify this ticker.`,
  };
}
