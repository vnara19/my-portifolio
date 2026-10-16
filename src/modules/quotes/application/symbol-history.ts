import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { providerForQuote } from "@/modules/portfolio/domain/asset-kinds";
import type { QuoteProviderConfiguration } from "@/modules/quotes/domain/quote-types";
import { addMonths, lastDayOf, toDateKey } from "@/modules/quotes/domain/calendar";
import { HISTORY_BACKFILL_MONTHS, monthEndPoints, monthsBetween, type DayValue } from "@/modules/quotes/domain/history-backfill";
import { fetchAlphaVantageMonthlyCloses } from "@/modules/quotes/infrastructure/alpha-vantage";
import { fetchUsdBrlDaily } from "@/modules/quotes/infrastructure/awesome-api";
import { fetchPtaxUsdPeriod } from "@/modules/quotes/infrastructure/bcb";
import { fetchBinanceMonthlyCloses } from "@/modules/quotes/infrastructure/binance";
import { fetchCoinGeckoDailyHistory, resolveCoinGeckoCoin } from "@/modules/quotes/infrastructure/coingecko";
import { fetchYahooDailyHistory } from "@/modules/quotes/infrastructure/yahoo";
import { treasuryMonthEndPoints, treasurySeriesOf, TREASURY_PROVIDER } from "@/modules/quotes/domain/treasury";
import { readTreasuryBook } from "@/modules/quotes/infrastructure/treasury";
import { ProviderRefusalError } from "@/modules/quotes/infrastructure/http";
import { loadReportingFxHistory } from "@/modules/quotes/application/reporting-fx-history";
import { fetchReferenceFxHistory } from "@/modules/quotes/infrastructure/frankfurter";


// Historical fallback providers (spec 037):
//


//


export type HistorySymbol = {
  symbol: string;
  instrumentType: string;
  baseCurrency: string;
  providerId: string | null;
};

export type HistoryResult = { provider: string; inserted: number };


export type UsdRatesCache = { rates: Map<string, number> | null };

export async function loadSymbolHistory(
  prisma: PrismaClient,
  target: HistorySymbol,
  {
    months,
    currentMonth,
    now,
    configuration,
    usdCache,
  }: {

    months: string[];
    currentMonth: Date;
    now: Date;
    configuration: QuoteProviderConfiguration;
    usdCache: UsdRatesCache;
  },
): Promise<HistoryResult> {
  if (target.instrumentType === "FIAT" && (target.symbol === "USD" || target.symbol === "EUR")) {
    return loadReportingFxHistory(prisma, target.symbol, months, now);
  }

  if (target.instrumentType === "TESOURO") {
    if (months.length === 0) return { provider: TREASURY_PROVIDER, inserted: 0 };
    const series = treasurySeriesOf(await readTreasuryBook(), target);
    if (!series) throw new ProviderRefusalError("NOT_FOUND", "Tesouro Direto has not published history for this security and maturity.");
    const points = treasuryMonthEndPoints(series, months, toDateKey(currentMonth).slice(0, 7));
    const created = await prisma.dailyQuote.createMany({
      data: [...points].map(([, point]) => ({
        symbol: target.symbol,
        quoteDate: new Date(`${point.day}T00:00:00.000Z`),
        instrumentType: target.instrumentType,
        baseCurrency: "BRL",
        valueBrl: new Prisma.Decimal(point.value).toDecimalPlaces(8),
        provider: TREASURY_PROVIDER,
        fetchedAt: now,
      })),
      skipDuplicates: true,
    });
    return { provider: TREASURY_PROVIDER, inserted: created.count };
  }

  const provider = providerForQuote(target.instrumentType, target.baseCurrency);

  if (months.length === 0 || target.symbol === "USD" || target.symbol === "BRL" || provider === "awesome-api") {
    return { provider, inserted: 0 };
  }

  const wanted = new Set(months);
  const fromMonth = months[0];
  const toMonth = toDateKey(currentMonth).slice(0, 7);
  const span = monthsBetween(fromMonth, toMonth).length;
  const inBrl = async (closes: Map<string, DayValue>, currency: string | null) => {
    if (currency === "BRL") {
      return closes;
    }
    if (currency === "EUR") {
      const sorted = [...closes.values()].sort((a, b) => a.day.localeCompare(b.day));
      if (!sorted.length) return new Map<string, DayValue>();
      const start = new Date(`${sorted[0].day}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - 7);
      const rates = await fetchReferenceFxHistory("EUR", toDateKey(start), sorted.at(-1)!.day);
      return new Map([...closes].map(([key, close]) => {
        const rate = rates.findLast((point) => point.day <= close.day);
        if (!rate || Date.parse(close.day) - Date.parse(rate.day) > 7 * 86400000) throw new Error(`Missing historical EUR/BRL rate for ${close.day}.`);
        return [key, { day: close.day, value: close.value * rate.value }];
      }));
    }
    if (currency !== "USD") throw new Error(`Unsupported historical quote currency: ${currency ?? "unknown"}.`);

    usdCache.rates ??= await usdMonthEndRates(prisma, currentMonth, configuration.awesomeApiKey, now);
    const converted = new Map<string, DayValue>();

    for (const [key, close] of closes) {
      const rate = usdCache.rates.get(key);

      if (rate) {
        converted.set(key, { day: close.day, value: close.value * rate });
      }
    }

    return converted;
  };

  let points: Map<string, DayValue>;
  let source: string;

  if (provider === "coingecko") {
    try {
      const binance = await fetchBinanceMonthlyCloses(target.symbol, span + 2);
      points = await inBrl(monthEndPoints(binance.points, fromMonth, toMonth), binance.currency);
      source = "binance";
    } catch {
      const coinId = target.providerId ?? (await resolveCoinGeckoCoin(target.symbol, configuration.coinGeckoApiKey))?.id;

      if (!coinId) {
        throw new Error(`Neither Binance nor CoinGecko found ${target.symbol}.`);
      }

      points = monthEndPoints(await fetchCoinGeckoDailyHistory(coinId, configuration.coinGeckoApiKey), fromMonth, toMonth);
      source = "coingecko";
    }
  } else {
    try {
      const yahoo = await fetchYahooDailyHistory(target.symbol, Math.min(3, Math.ceil((span + 1) / 12)));
      points = await inBrl(monthEndPoints(yahoo.points, fromMonth, toMonth), yahoo.currency);
      source = "yahoo";
    } catch (yahooError) {
      if (!configuration.alphaVantageApiKey || target.instrumentType.startsWith("EU_")) {
        throw yahooError;
      }

      const closes = monthEndPoints(
        await fetchAlphaVantageMonthlyCloses(target.symbol, configuration.alphaVantageApiKey),
        fromMonth,
        toMonth,
      );
      points = await inBrl(closes, target.baseCurrency === "USD" ? "USD" : "BRL");
      source = "alpha-vantage";
    }
  }

  const created = await prisma.dailyQuote.createMany({
    data: [...points]
      .filter(([month]) => wanted.has(month))
      .map(([, point]) => ({
        symbol: target.symbol,
        quoteDate: new Date(`${point.day}T00:00:00.000Z`),
        instrumentType: target.instrumentType,
        baseCurrency: target.baseCurrency,
        valueBrl: new Prisma.Decimal(point.value).toDecimalPlaces(8),
        provider: source,
        fetchedAt: now,
      })),
    skipDuplicates: true,
  });

  return { provider: source, inserted: created.count };
}


async function usdMonthEndRates(prisma: PrismaClient, currentMonth: Date, apiKey: string | undefined, now: Date) {
  const from = addMonths(currentMonth, -HISTORY_BACKFILL_MONTHS);
  const fromMonth = toDateKey(from).slice(0, 7);
  const toMonth = toDateKey(currentMonth).slice(0, 7);
  const [monthly, daily] = await Promise.all([
    prisma.marketQuote.findMany({
      where: { symbol: "USD", carriedFrom: null, referenceDate: { gte: from, lt: currentMonth } },
      select: { referenceDate: true, valueBrl: true },
    }),
    prisma.dailyQuote.findMany({
      where: { symbol: "USD", quoteDate: { gte: from, lt: currentMonth } },
      select: { quoteDate: true, valueBrl: true },
    }),
  ]);

  const rates = new Map<string, number>();

  for (const [key, point] of monthEndPoints(
    daily.map((quote) => ({ day: toDateKey(quote.quoteDate), value: quote.valueBrl.toNumber() })),
    fromMonth,
    toMonth,
  )) {
    rates.set(key, point.value);
  }

  for (const quote of monthly) {
    rates.set(toDateKey(quote.referenceDate).slice(0, 7), quote.valueBrl.toNumber());
  }

  const missing = monthsBetween(fromMonth, toMonth).filter((key) => !rates.has(key));

  if (missing.length === 0) {
    return rates;
  }


  const start = `${missing[0]}-01`;
  const lastMissingDay = toDateKey(lastDayOf(new Date(`${missing.at(-1)}-01T00:00:00.000Z`)));
  let fetched: DayValue[] = [];
  let source = "bcb";

  try {
    fetched = await fetchPtaxUsdPeriod(start, lastMissingDay);
  } catch {
    source = "awesome-api";
    let end = lastMissingDay;

    for (let page = 0; page < 6 && end >= start; page += 1) {
      const days = await fetchUsdBrlDaily(start, end, apiKey);

      if (days.length === 0) {
        break;
      }

      fetched.push(...days);
      const earliest = days.reduce((min, day) => (day.day < min ? day.day : min), days[0].day);
      const previous = new Date(`${earliest}T00:00:00.000Z`);
      previous.setUTCDate(previous.getUTCDate() - 1);
      end = toDateKey(previous);
    }
  }

  const closings = [...monthEndPoints(fetched, fromMonth, toMonth)].filter(([key]) => missing.includes(key));

  await prisma.dailyQuote.createMany({
    data: closings.map(([, point]) => ({
      symbol: "USD",
      quoteDate: new Date(`${point.day}T00:00:00.000Z`),
      instrumentType: "FIAT",
      baseCurrency: "USD",
      valueBrl: new Prisma.Decimal(point.value).toDecimalPlaces(8),
      provider: source,
      fetchedAt: now,
    })),
    skipDuplicates: true,
  });

  for (const [key, point] of closings) {
    rates.set(key, point.value);
  }

  return rates;
}
