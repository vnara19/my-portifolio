
/** Scheduled quote sync reserves execution with a PostgreSQL lock. Fetch only due symbols, retain backoff after failures and preserve independent rate updates. */
import {
  Prisma,
  QuoteRefreshStatus,
  QuoteSymbolStatus,
  QuoteUpdateStatus,
  type PrismaClient,
  type QuoteSymbol,
} from "@/generated/prisma/client";
import { QUOTE_REFRESH_LOCK_KEY } from "@/lib/advisory-locks";
import { getPrismaClient } from "@/lib/prisma";
import { fetchCurrentQuotes, getQuoteProviderConfiguration } from "@/modules/quotes/application/fetch-current-quotes";
import { loadSymbolHistory, type UsdRatesCache } from "@/modules/quotes/application/symbol-history";
import { addMonths, calendarDay, lastDayOf, monthOf, toDateKey } from "@/modules/quotes/domain/calendar";
import {
  backoffUntil,
  isHistoryDue,
  isQuoteDue,
  MAX_HISTORIES_PER_RUN,
  HISTORY_RETRY_AFTER_MS,
  MAX_QUOTES_PER_RUN,
  missingClosingMonths,
} from "@/modules/quotes/domain/quote-sync";
import {
  quoteFailure,
  type QuoteProviderConfiguration,
  type QuoteRequest,
  type QuoteResult,
} from "@/modules/quotes/domain/quote-types";
import { describeProviderError } from "@/modules/quotes/infrastructure/http";
import { isTreasuryDay } from "@/modules/quotes/domain/treasury";
import { syncCdi, type CdiRatesFetcher, type CdiReport } from "@/modules/portfolio/application/cdi-positions";
import { syncSelicReference, type SelicSyncReport } from "@/modules/quotes/application/selic-reference";
import type { SelicFetcher } from "@/modules/quotes/infrastructure/bcb-selic";


export type QuoteFetcher = (requests: QuoteRequest[]) => Promise<QuoteResult[]>;
export type HistoryLoader = typeof loadSymbolHistory;

export type HistoryReport = {
  symbol: string;
  status: "SUCCESS" | "FAILED" | "UP_TO_DATE";
  provider: string | null;
  months: number;
  message?: string;
};

export type QuoteSyncOutcome =
  | { state: "idle"; selic?: SelicSyncReport; cdi?: CdiReport }
  | { state: "busy"; runId: string }
  | {
      state: "done";
      runId: string;
      status: QuoteRefreshStatus;
      succeeded: string[];
      failed: { symbol: string; errorCode: string; errorMessage: string }[];
      histories: HistoryReport[];

      selic?: SelicSyncReport;

      cdi?: CdiReport;
    }
  | { state: "unavailable"; message: string };

type Transaction = Prisma.TransactionClient;

type Claim =
  | {
      state: "claimed";
      runId: string;
      quoteSymbols: QuoteSymbol[];
      historySymbols: QuoteSymbol[];
      unregistered: string[];
      currentMonthIds: string[];
    }
  | { state: "idle" }
  | { state: "busy"; runId: string };


// Recover reservations left by an interrupted run.
const STALE_RUN_MS = 10 * 60 * 1000;

export async function syncQuotes({
  now = new Date(),
  fetchQuotes,
  loadHistory = loadSymbolHistory,
  configuration = getQuoteProviderConfiguration(),
  prisma = getPrismaClient(),
  fetchSelicRate,
  fetchCdiRates,
}: {
  now?: Date;
  fetchQuotes?: QuoteFetcher;
  loadHistory?: HistoryLoader;
  configuration?: QuoteProviderConfiguration;
  prisma?: PrismaClient | null;
  fetchSelicRate?: SelicFetcher;
  fetchCdiRates?: CdiRatesFetcher;
} = {}): Promise<QuoteSyncOutcome> {
  if (!prisma) {
    return { state: "unavailable", message: "The database is not configured." };
  }

  const startedClock = Date.now();
  const clock = () => new Date(now.getTime() + (Date.now() - startedClock));
  const today = calendarDay(now);
  const currentMonth = monthOf(today);
  const claim = await claimRun(prisma, now, today, currentMonth);


  const runSelic = () =>
    syncSelicReference(prisma, { now, ...(fetchSelicRate ? { fetchRate: fetchSelicRate } : {}) }).catch(
      (error: unknown): SelicSyncReport => ({ state: "failed", observedOn: null, message: describeProviderError(error).message }),
    );


  const runCdi = () =>
    syncCdi(prisma, { now, ...(fetchCdiRates ? { fetchRates: fetchCdiRates } : {}) }).catch(
      (error: unknown): CdiReport => ({
        rates: { state: "failed", inserted: 0, through: null, message: describeProviderError(error).message },
        valued: 0,
        failed: [],
      }),
    );

  if (claim.state === "idle") {
    return { state: "idle", selic: await runSelic(), cdi: await runCdi() };
  }

  if (claim.state !== "claimed") {
    return claim;
  }

  const fetcher: QuoteFetcher = fetchQuotes ?? ((requests) => fetchCurrentQuotes(requests, configuration));
  let results: QuoteResult[] | null = null;
  let outcome: Extract<QuoteSyncOutcome, { state: "done" }> = {
    state: "done",
    runId: claim.runId,
    status: QuoteRefreshStatus.FAILED,
    succeeded: [],
    failed: [],
    histories: [],
  };

  if (claim.quoteSymbols.length > 0 || claim.unregistered.length > 0) {


    try {
      const requests = claim.quoteSymbols.map(
        (symbol): QuoteRequest => ({
          symbol: symbol.symbol,
          instrumentType: symbol.instrumentType,
          baseCurrency: symbol.baseCurrency,
          providerId: symbol.providerId ?? undefined,
        }),
      );
      const fetched = await fetchSafely(fetcher, requests);
      const fetchedAt = clock();
      const completed = completeResults(requests, fetched, toDateKey(today)).concat(
        claim.unregistered.map((symbol) =>
          quoteFailure(
            symbol,
            "configuration",
            "MISSING_QUOTE_METADATA",
            `No history exists for ${symbol} to select the quote provider.`,
          ),
        ),
      );
      results = completed;
      const successes = completed.filter((result) => result.status === "SUCCESS");
      const failures = completed.filter((result) => result.status === "FAILED");
      const status =
        failures.length === 0
          ? QuoteRefreshStatus.COMPLETED
          : successes.length === 0
            ? QuoteRefreshStatus.FAILED
            : QuoteRefreshStatus.COMPLETED_WITH_ISSUES;

      await prisma.$transaction(
        (transaction) =>
          saveResults(transaction, {
            runId: claim.runId,
            completed,
            registry: new Map(claim.quoteSymbols.map((symbol) => [symbol.symbol, symbol])),
            currentMonthIds: claim.currentMonthIds,
            currentMonth,
            today,
            fetchedAt,
            status,
            finishedAt: clock(),
          }),
        { maxWait: 10_000, timeout: 60_000 },
      );

      outcome = {
        ...outcome,
        status,
        succeeded: successes.map((result) => result.symbol),
        failed: failures.flatMap((result) =>
          result.status === "FAILED"
            ? [{ symbol: result.symbol, errorCode: result.errorCode, errorMessage: result.errorMessage }]
            : [],
        ),
      };
    } catch (error) {
      console.error("The quote update failed.", error);
      await recordFailedRun(prisma, claim.runId, results, clock()).catch(() => undefined);
    }
  }

  outcome.histories = await syncHistories(prisma, claim.historySymbols, {
    currentMonth,
    now: clock(),
    configuration,
    loadHistory,
  });

  outcome.selic = await runSelic();
  outcome.cdi = await runCdi();


  if (claim.quoteSymbols.length === 0 && claim.unregistered.length === 0) {
    await prisma.quoteRefreshRun.delete({ where: { id: claim.runId } }).catch(() => undefined);
    outcome.status = outcome.histories.some((report) => report.status === "FAILED")
      ? QuoteRefreshStatus.COMPLETED_WITH_ISSUES
      : QuoteRefreshStatus.COMPLETED;
  }

  return outcome;
}


async function claimRun(prisma: PrismaClient, now: Date, today: Date, currentMonth: Date): Promise<Claim> {
  return prisma.$transaction(
    async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${QUOTE_REFRESH_LOCK_KEY})`;
      await transaction.quoteRefreshRun.updateMany({
        where: { status: QuoteRefreshStatus.RUNNING, startedAt: { lt: new Date(now.getTime() - STALE_RUN_MS) } },
        data: {
          status: QuoteRefreshStatus.FAILED,
          finishedAt: now,
          errorMessage: "The execution was interrupted before completion.",
        },
      });

      const running = await transaction.quoteRefreshRun.findFirst({
        where: { status: QuoteRefreshStatus.RUNNING },
        select: { id: true },
      });

      if (running) {
        return { state: "busy" as const, runId: running.id };
      }

      const latestMonths = await transaction.portfolioMonth.findMany({
        distinct: ["userId"],
        orderBy: [{ userId: "asc" }, { referenceDate: "desc" }],
        select: { id: true, referenceDate: true },
      });
      const inUse = await symbolsInUse(
        transaction,
        latestMonths.map((month) => month.id),
      );
      const unregistered = await registerMissingSymbols(transaction, inUse);
      const registry = await transaction.quoteSymbol.findMany({
        where: { symbol: { in: inUse } },
        orderBy: [{ lastSuccessAt: { sort: "asc", nulls: "first" } }, { symbol: "asc" }],
      });
      const quoteSymbols = registry.filter((symbol) => isQuoteDue(symbol, now)).slice(0, MAX_QUOTES_PER_RUN);
      const historySymbols = registry
        .filter((symbol) => (symbol.symbol === "USD" || symbol.symbol === "EUR")
          ? !symbol.historyAttemptedAt || now.getTime() - symbol.historyAttemptedAt.getTime() >= HISTORY_RETRY_AFTER_MS
          : isHistoryDue(symbol, currentMonth, now))
        .slice(0, MAX_HISTORIES_PER_RUN);


      const reportUnregistered = quoteSymbols.length > 0 ? unregistered : [];

      if (quoteSymbols.length === 0 && historySymbols.length === 0) {
        return { state: "idle" as const };
      }

      const run = await transaction.quoteRefreshRun.create({
        data: { status: QuoteRefreshStatus.RUNNING, quoteDate: today, startedAt: now },
        select: { id: true },
      });

      return {
        state: "claimed" as const,
        runId: run.id,
        quoteSymbols,
        historySymbols,
        unregistered: reportUnregistered,
        currentMonthIds: latestMonths
          .filter((month) => month.referenceDate.getTime() === currentMonth.getTime())
          .map((month) => month.id),
      };
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

async function symbolsInUse(transaction: Transaction, monthIds: string[]) {
  if (monthIds.length === 0) {
    return [];
  }

  const positions = await transaction.position.findMany({
    where: { portfolioMonthId: { in: monthIds }, asset: { quoteSymbol: { not: null } } },
    distinct: ["assetId"],
    select: { asset: { select: { quoteSymbol: true } } },
  });

  return [...new Set(["USD", "EUR", ...positions.map((position) => position.asset.quoteSymbol!)])].sort();
}


async function registerMissingSymbols(transaction: Transaction, inUse: string[]) {
  if (inUse.length === 0) {
    return [];
  }

  const known = new Set(
    (await transaction.quoteSymbol.findMany({ where: { symbol: { in: inUse } }, select: { symbol: true } })).map(
      (row) => row.symbol,
    ),
  );
  const missing = inUse.filter((symbol) => !known.has(symbol));

  if (missing.length === 0) {
    return [];
  }

  const metadataSymbols = missing.filter((symbol) => symbol !== "USD" && symbol !== "EUR");
  const [monthly, daily, assets] = metadataSymbols.length === 0 ? [[], [], []] : await Promise.all([
    transaction.marketQuote.findMany({
      where: { symbol: { in: metadataSymbols } },
      orderBy: { referenceDate: "desc" },
      select: { symbol: true, instrumentType: true, baseCurrency: true },
    }),
    transaction.dailyQuote.findMany({
      where: { symbol: { in: metadataSymbols } },
      orderBy: { quoteDate: "desc" },
      select: { symbol: true, instrumentType: true, baseCurrency: true },
    }),
    transaction.asset.findMany({
      where: { quoteSymbol: { in: metadataSymbols }, quoteProviderId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { quoteSymbol: true, quoteProviderId: true },
    }),
  ]);
  const metadata = new Map<string, { instrumentType: string; baseCurrency: string }>();
  for (const currency of ["USD", "EUR"]) metadata.set(currency, { instrumentType: "FIAT", baseCurrency: currency });

  for (const quote of [...monthly, ...daily]) {
    if (!metadata.has(quote.symbol)) {
      metadata.set(quote.symbol, { instrumentType: quote.instrumentType, baseCurrency: quote.baseCurrency });
    }
  }

  const providerIds = new Map<string, string>();

  for (const asset of assets) {
    if (asset.quoteSymbol && asset.quoteProviderId && !providerIds.has(asset.quoteSymbol)) {
      providerIds.set(asset.quoteSymbol, asset.quoteProviderId);
    }
  }


  for (const symbol of missing) {
    if (symbol.startsWith("TD:") && providerIds.has(symbol) && !metadata.has(symbol)) {
      metadata.set(symbol, { instrumentType: "TESOURO", baseCurrency: "BRL" });
    }
  }

  const registrable = missing.filter((symbol) => metadata.has(symbol));

  if (registrable.length > 0) {
    await transaction.quoteSymbol.createMany({
      data: registrable.map((symbol) => ({
        symbol,
        ...metadata.get(symbol)!,
        providerId: providerIds.get(symbol) ?? null,
      })),
      skipDuplicates: true,
    });
  }

  return missing.filter((symbol) => !metadata.has(symbol));
}

async function saveResults(
  transaction: Transaction,
  {
    runId,
    completed,
    registry,
    currentMonthIds,
    currentMonth,
    today,
    fetchedAt,
    status,
    finishedAt,
  }: {
    runId: string;
    completed: QuoteResult[];
    registry: Map<string, QuoteSymbol>;
    currentMonthIds: string[];
    currentMonth: Date;
    today: Date;
    fetchedAt: Date;
    status: QuoteRefreshStatus;
    finishedAt: Date;
  },
) {
  const successes = completed.flatMap((result) =>
    result.status === "SUCCESS" && registry.has(result.symbol)
      ? [{ ...registry.get(result.symbol)!, provider: result.provider, price: toPrice(result.valueBrl), quoteDay: result.quoteDate ?? toDateKey(today) }]
      : [],
  );
  const failures = completed.flatMap((result) => (result.status === "FAILED" ? [result] : []));

  await transaction.quoteRefreshResult.createMany({
    data: completed.map((result) => ({
      runId,
      symbol: result.symbol,
      provider: result.provider,
      status: result.status === "SUCCESS" ? QuoteUpdateStatus.SUCCESS : QuoteUpdateStatus.FAILED,
      valueBrl: result.status === "SUCCESS" ? toPrice(result.valueBrl) : null,
      errorCode: result.status === "FAILED" ? result.errorCode : null,
      errorMessage: result.status === "FAILED" ? result.errorMessage : null,
      fetchedAt,
    })),
  });

  if (successes.length > 0) {
    const symbols = successes.map((success) => success.symbol);
    const prices = successes.map((success) => success.price.toString());


    await transaction.$executeRaw`
      INSERT INTO "daily_quotes" (
        "id", "symbol", "quote_date", "instrument_type", "base_currency", "value_brl", "provider", "fetched_at", "run_id"
      )
      SELECT gen_random_uuid(), "s"."symbol", "s"."quote_day"::date, "s"."instrument_type", "s"."base_currency",
             "s"."price", "s"."provider", ${fetchedAt}, ${runId}::uuid
      FROM UNNEST(
        ${symbols}::text[],
        ${successes.map((success) => success.instrumentType)}::text[],
        ${successes.map((success) => success.baseCurrency)}::text[],
        ${prices}::numeric[],
        ${successes.map((success) => success.provider)}::text[],
        ${successes.map((success) => success.quoteDay)}::text[]
      ) AS "s"("symbol", "instrument_type", "base_currency", "price", "provider", "quote_day")
      ON CONFLICT ("symbol", "quote_date") DO UPDATE SET
        "instrument_type" = EXCLUDED."instrument_type",
        "base_currency" = EXCLUDED."base_currency",
        "value_brl" = EXCLUDED."value_brl",
        "provider" = EXCLUDED."provider",
        "fetched_at" = EXCLUDED."fetched_at",
        "run_id" = EXCLUDED."run_id"`;


    await transaction.manualQuote.deleteMany({ where: { referenceDate: currentMonth, symbol: { in: symbols } } });

    await transaction.quoteSymbol.updateMany({
      where: { symbol: { in: symbols } },
      data: {
        status: QuoteSymbolStatus.ACTIVE,
        lastAttemptAt: fetchedAt,
        lastSuccessAt: fetchedAt,
        failureCount: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        nextAttemptAt: null,
      },
    });

    if (currentMonthIds.length > 0) {
      await transaction.$executeRaw`
        INSERT INTO "market_quotes" (
          "id", "reference_date", "symbol", "instrument_type", "base_currency", "value_brl", "quote_date", "carried_from"
        )
        SELECT gen_random_uuid(), ${toDateKey(currentMonth)}::date, "s"."symbol", "s"."instrument_type", "s"."base_currency",
               "s"."price", "s"."quote_day"::date,
               CASE WHEN "s"."quote_day"::date < ${toDateKey(currentMonth)}::date
                    THEN date_trunc('month', "s"."quote_day"::date)::date ELSE NULL END
        FROM UNNEST(
          ${symbols}::text[],
          ${successes.map((success) => success.instrumentType)}::text[],
          ${successes.map((success) => success.baseCurrency)}::text[],
          ${prices}::numeric[],
          ${successes.map((success) => success.quoteDay)}::text[]
        ) AS "s"("symbol", "instrument_type", "base_currency", "price", "quote_day")
        ON CONFLICT ("reference_date", "symbol") DO UPDATE SET
          "value_brl" = EXCLUDED."value_brl",
          "quote_date" = EXCLUDED."quote_date",
          "carried_from" = EXCLUDED."carried_from"
        WHERE "market_quotes"."quote_date" IS NULL OR EXCLUDED."quote_date" >= "market_quotes"."quote_date"`;


      await transaction.$executeRaw`
        UPDATE "positions" AS "p"
        SET "unit_price_brl" = "q"."value_brl",
            "total_brl" = ROUND("p"."quantity" * "q"."value_brl", 2),
            "updated_at" = ${fetchedAt}
        FROM "assets" AS "a", "market_quotes" AS "q"
        WHERE "a"."id" = "p"."asset_id"
          AND "a"."quote_symbol" = "q"."symbol"
          AND "q"."symbol" = ANY(${symbols}::text[])
          AND "q"."reference_date" = ${toDateKey(currentMonth)}::date
          AND "p"."portfolio_month_id" = ANY(${currentMonthIds}::uuid[])`;

      const usd = successes.find((success) => success.symbol === "USD");

      if (usd) {
        await transaction.position.updateMany({
          where: { portfolioMonthId: { in: currentMonthIds }, exchangeRateBrl: { not: null } },
          data: { exchangeRateBrl: usd.price },
        });
      }
    }
  }

  for (const failure of failures) {
    const symbol = registry.get(failure.symbol);

    if (!symbol) {
      continue;
    }

    const failureCount = symbol.failureCount + 1;
    await transaction.quoteSymbol.update({
      where: { symbol: failure.symbol },
      data: {
        status: QuoteSymbolStatus.ERROR,
        lastAttemptAt: fetchedAt,
        failureCount,
        lastErrorCode: failure.errorCode,
        lastErrorMessage: `${failure.provider}: ${failure.errorMessage}`.slice(0, 1000),
        nextAttemptAt: backoffUntil(fetchedAt, failureCount),
      },
    });
  }

  await transaction.quoteRefreshRun.update({
    where: { id: runId },
    data: {
      status,
      finishedAt,
      repricedMonth: currentMonthIds.length > 0 ? currentMonth : null,
      errorMessage:
        failures.length === 0 ? null : `${failures.length} of ${completed.length} quotes were not updated.`,
    },
  });
}


async function syncHistories(
  prisma: PrismaClient,
  symbols: QuoteSymbol[],
  {
    currentMonth,
    now,
    configuration,
    loadHistory,
  }: { currentMonth: Date; now: Date; configuration: QuoteProviderConfiguration; loadHistory: HistoryLoader },
) {
  const reports: HistoryReport[] = [];
  const usdCache: UsdRatesCache = { rates: null };
  const previousMonth = addMonths(currentMonth, -1);

  for (const symbol of symbols) {
    try {
      const months = missingClosingMonths({
        currentMonth,
        syncedUntil: symbol.symbol === "USD" || symbol.symbol === "EUR" ? null : symbol.historySyncedUntil,
        closingDays: await closingDaysOf(prisma, symbol.symbol, currentMonth),
      });
      const result =
        months.length > 0
          ? await loadHistory(prisma, symbol, { months, currentMonth, now, configuration, usdCache })
          : null;

      await prisma.quoteSymbol.update({
        where: { symbol: symbol.symbol },
        data: { historySyncedUntil: previousMonth, historyAttemptedAt: now, historyError: null },
      });
      reports.push({
        symbol: symbol.symbol,
        status: result ? "SUCCESS" : "UP_TO_DATE",
        provider: result?.provider ?? null,
        months: result?.inserted ?? 0,
      });
    } catch (error) {
      const message = describeProviderError(error).message;
      await prisma.quoteSymbol
        .update({
          where: { symbol: symbol.symbol },
          data: { historyAttemptedAt: now, historyError: message.slice(0, 1000) },
        })
        .catch(() => undefined);
      reports.push({ symbol: symbol.symbol, status: "FAILED", provider: null, months: 0, message });
    }
  }

  return reports;
}


async function closingDaysOf(prisma: PrismaClient, symbol: string, currentMonth: Date) {
  const from = addMonths(currentMonth, -48);
  const [daily, monthly] = await Promise.all([
    prisma.dailyQuote.findMany({
      where: { symbol, quoteDate: { gte: from, lt: currentMonth } },
      select: { quoteDate: true },
    }),
    prisma.marketQuote.findMany({
      where: { symbol, carriedFrom: null, referenceDate: { gte: from, lt: currentMonth } },
      select: { referenceDate: true, quoteDate: true },
    }),
  ]);
  const days = new Map<string, string>();
  const keep = (day: string) => {
    const month = day.slice(0, 7);
    const current = days.get(month);

    if (!current || day > current) {
      days.set(month, day);
    }
  };

  for (const quote of daily) {
    keep(toDateKey(quote.quoteDate));
  }


  for (const quote of monthly) {
    keep(toDateKey(quote.quoteDate ?? lastDayOf(quote.referenceDate)));
  }

  return days;
}


async function recordFailedRun(
  prisma: PrismaClient,
  runId: string,
  results: QuoteResult[] | null,
  finishedAt: Date,
) {
  await prisma.$transaction(async (transaction) => {
    if (results && results.length > 0) {
      await transaction.quoteRefreshResult.createMany({
        skipDuplicates: true,
        data: results.map((result) => ({
          runId,
          symbol: result.symbol,
          provider: result.provider,
          status: QuoteUpdateStatus.FAILED,

          valueBrl: null,
          errorCode: result.status === "FAILED" ? result.errorCode : "NOT_SAVED",
          errorMessage:
            result.status === "FAILED" ? result.errorMessage : "The quote was fetched but could not be saved.",
          fetchedAt: finishedAt,
        })),
      });
    }

    await transaction.quoteRefreshRun.update({
      where: { id: runId },
      data: {
        status: QuoteRefreshStatus.FAILED,
        finishedAt,
        errorMessage: results
          ? "Quotes were fetched but could not be saved."
          : "Could not fetch the quotes.",
      },
    });
  });
}

async function fetchSafely(fetchQuotes: QuoteFetcher, requests: QuoteRequest[]) {
  if (requests.length === 0) {
    return [];
  }

  try {
    return await fetchQuotes(requests);
  } catch (error) {
    const described = describeProviderError(error);
    return requests.map((request) => quoteFailure(request.symbol, "provider", described.code, described.message));
  }
}


function completeResults(requests: QuoteRequest[], fetched: QuoteResult[], today: string) {
  const bySymbol = new Map<string, QuoteResult>();

  for (const result of fetched) {
    if (!bySymbol.has(result.symbol)) {
      bySymbol.set(result.symbol, result);
    }
  }

  return requests.map((request): QuoteResult => {
    const result = bySymbol.get(request.symbol);

    if (!result) {
      return quoteFailure(request.symbol, "provider", "MISSING_RESULT", "The provider did not return this asset.");
    }

    if (result.status === "SUCCESS" && !(Number.isFinite(result.valueBrl) && result.valueBrl > 0)) {
      return quoteFailure(
        request.symbol,
        result.provider,
        "INVALID_VALUE",
        "The provider returned an invalid price.",
      );
    }

    if (result.status === "SUCCESS" && result.quoteDate && (!isTreasuryDay(result.quoteDate) || result.quoteDate > today)) {
      return quoteFailure(request.symbol, result.provider, "INVALID_DATE", "The provider returned an invalid or future quote date.");
    }

    return result;
  });
}

function toPrice(value: number) {
  return new Prisma.Decimal(value).toDecimalPlaces(8);
}
