
/** Carry the previous month's positions and allocations forward automatically. Stored month statuses are retained for backup compatibility. */
import { PortfolioMonthStatus, Prisma } from "@/generated/prisma/client";
import { MONTH_ROLLOVER_LOCK_KEY } from "@/lib/advisory-locks";
import { currentUserId, getUserDb, SCOPED_USER } from "@/lib/user-db";
import type { GeneratedMonthView, MonthRolloverOutcome } from "@/modules/portfolio/domain/month-rollover";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { valueCdiPositions } from "@/modules/portfolio/application/cdi-positions";
import { autoIncomeParts } from "@/modules/portfolio/domain/fixed-income-policy";
import { addMonths, calendarDay, lastDayOf, monthOf, toDateKey } from "@/modules/quotes/domain/calendar";

type Transaction = Prisma.TransactionClient;


export async function checkMonthsUpToDate(today: Date = new Date()): Promise<MonthRolloverOutcome> {
  return ensureMonthsUpToDate(today);
}

export async function ensureMonthsUpToDate(today: Date = new Date()): Promise<MonthRolloverOutcome> {
  const prisma = await getUserDb();

  if (!prisma) {
    return { state: "unavailable", message: "The database is not configured." };
  }

  const day = calendarDay(today);
  const target = monthOf(day);
  const latest = await prisma.portfolioMonth.findFirst({
    orderBy: { referenceDate: "desc" },
    select: { referenceDate: true },
  });

  if (!latest) {
    return startFirstMonth(target);
  }

  if (latest.referenceDate.getTime() >= target.getTime()) {
    await prisma.portfolioMonth.updateMany({ where: { referenceDate: target, status: { not: PortfolioMonthStatus.DRAFT } }, data: { status: PortfolioMonthStatus.DRAFT } });
    await prisma.portfolioMonth.updateMany({ where: { referenceDate: { lt: target }, status: PortfolioMonthStatus.DRAFT }, data: { status: PortfolioMonthStatus.REVIEWED } });
    return { state: "up-to-date", latestMonth: toMonthParam(latest.referenceDate) };
  }

  return prisma.$transaction(
    async (transaction): Promise<MonthRolloverOutcome> => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${MONTH_ROLLOVER_LOCK_KEY})`;
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${await currentUserId()}), hashtext(${"portfolio-edits"}))`;


      let source = await transaction.portfolioMonth.findFirst({
        orderBy: { referenceDate: "desc" },
        select: { id: true, referenceDate: true },
      });

      if (!source || source.referenceDate.getTime() >= target.getTime()) {
        return { state: "up-to-date", latestMonth: source ? toMonthParam(source.referenceDate) : null };
      }

      const months: GeneratedMonthView[] = [];

      for (
        let month = addMonths(source.referenceDate, 1);
        month.getTime() <= target.getTime();
        month = addMonths(month, 1)
      ) {
        const generated = await copyMonth(transaction, source, month, day);
        months.push({ ...generated.view, isCurrent: month.getTime() === target.getTime() });
        source = generated.month;
      }


      await transaction.portfolioMonth.updateMany({
        where: { referenceDate: { lt: target }, status: PortfolioMonthStatus.DRAFT },
        data: { status: PortfolioMonthStatus.REVIEWED },
      });

      return { state: "created", months };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}


async function startFirstMonth(target: Date): Promise<MonthRolloverOutcome> {
  const prisma = (await getUserDb())!;

  return prisma.$transaction(async (transaction): Promise<MonthRolloverOutcome> => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${MONTH_ROLLOVER_LOCK_KEY})`;
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${await currentUserId()}), hashtext(${"portfolio-edits"}))`;
    const existing = await transaction.portfolioMonth.findFirst({
      orderBy: { referenceDate: "desc" },
      select: { referenceDate: true },
    });

    if (existing) {
      return { state: "up-to-date", latestMonth: toMonthParam(existing.referenceDate) };
    }

    await transaction.portfolioMonth.create({
      data: { userId: SCOPED_USER, referenceDate: target, status: PortfolioMonthStatus.DRAFT },
    });

    return { state: "started", month: toMonthParam(target) };
  });
}

async function copyMonth(
  transaction: Transaction,
  source: { id: string; referenceDate: Date },
  month: Date,
  today: Date,
) {


  await valueCdiPositions(transaction, { where: { portfolioMonthId: source.id }, asOf: toDateKey(month) });

  const [positions, sharedQuotes, manualQuotes] = await Promise.all([


    transaction.position.findMany({
      where: { portfolioMonthId: source.id, quantity: { gt: 0 } },
      orderBy: { id: "asc" },
      select: {
        calculationStartDate: true,
        accountId: true,
        assetId: true,
        quantity: true,
        unitPriceBrl: true,
        exchangeRateBrl: true,
        totalBrl: true,
        strategy: true,
        asset: { select: { quoteSymbol: true, autoIncome: true } },
        allocations: {
          orderBy: { id: "asc" },
          select: { assetClass: true, subclass: true, duration: true, weight: true, ratePercent: true },
        },
      },
    }),
    transaction.marketQuote.findMany({
      where: { referenceDate: source.referenceDate },
      orderBy: { symbol: "asc" },
      select: {
        symbol: true,
        instrumentType: true,
        baseCurrency: true,
        valueBrl: true,
        quoteDate: true,
        carriedFrom: true,
      },
    }),
    transaction.manualQuote.findMany({
      where: { referenceDate: source.referenceDate },
      orderBy: { symbol: "asc" },
      select: { symbol: true, instrumentType: true, baseCurrency: true, valueBrl: true },
    }),
  ]);

  const positionSymbols = new Set(
    positions
      .map((position) => position.asset.quoteSymbol)
      .filter((symbol): symbol is string => Boolean(symbol)),
  );


  const relevant = new Set([...positionSymbols, ...manualQuotes.map((quote) => quote.symbol), "USD"]);
  const sharedSymbols = new Set(sharedQuotes.map((quote) => quote.symbol));
  const sourceQuotes = [
    ...sharedQuotes.filter((quote) => relevant.has(quote.symbol)).map((quote) => ({ ...quote, manual: false })),
    ...manualQuotes
      .filter((quote) => !sharedSymbols.has(quote.symbol))
      .map((quote) => ({ ...quote, quoteDate: null, carriedFrom: null, manual: true })),
  ];
  const symbols = [...relevant];
  const windowEnd = new Date(Math.min(lastDayOf(month).getTime(), today.getTime()));
  const dailyQuotes = await transaction.dailyQuote.findMany({
    where: { symbol: { in: symbols }, quoteDate: { gte: month, lte: windowEnd } },
    orderBy: { quoteDate: "desc" },
    select: { symbol: true, quoteDate: true, valueBrl: true, instrumentType: true, baseCurrency: true },
  });
  const lastDaily = new Map<string, (typeof dailyQuotes)[number]>();

  for (const quote of dailyQuotes) {
    if (!lastDaily.has(quote.symbol)) {
      lastDaily.set(quote.symbol, quote);
    }
  }

  const quotes = new Map<
    string,
    {
      instrumentType: string;
      baseCurrency: string;
      valueBrl: Prisma.Decimal;
      quoteDate: Date | null;
      carriedFrom: Date | null;
      fromHistory: boolean;

      manual: boolean;
    }
  >();

  for (const quote of sourceQuotes) {
    const daily = lastDaily.get(quote.symbol);
    quotes.set(
      quote.symbol,
      daily
        ? { ...quote, valueBrl: daily.valueBrl, quoteDate: daily.quoteDate, carriedFrom: null, fromHistory: true, manual: false }
        :

          { ...quote, carriedFrom: quote.manual ? null : (quote.carriedFrom ?? source.referenceDate), fromHistory: false },
    );
  }

  for (const [symbol, daily] of lastDaily) {
    if (!quotes.has(symbol)) {
      quotes.set(symbol, {
        instrumentType: daily.instrumentType,
        baseCurrency: daily.baseCurrency,
        valueBrl: daily.valueBrl,
        quoteDate: daily.quoteDate,
        carriedFrom: null,
        fromHistory: true,
        manual: false,
      });
    }
  }

  const created = await transaction.portfolioMonth.create({
    data: { userId: SCOPED_USER, referenceDate: month, status: PortfolioMonthStatus.DRAFT },
    select: { id: true, referenceDate: true },
  });

  const shared = [...quotes].filter(([, quote]) => !quote.manual);
  const manual = [...quotes].filter(([, quote]) => quote.manual);


  if (shared.length > 0) {
    await transaction.marketQuote.createMany({
      data: shared.map(([symbol, quote]) => ({
        referenceDate: month,
        symbol,
        instrumentType: quote.instrumentType,
        baseCurrency: quote.baseCurrency,
        valueBrl: quote.valueBrl,
        quoteDate: quote.quoteDate,
        carriedFrom: quote.carriedFrom,
      })),
      skipDuplicates: true,
    });
  }

  if (manual.length > 0) {
    await transaction.manualQuote.createMany({
      data: manual.map(([symbol, quote]) => ({
        userId: SCOPED_USER,
        referenceDate: month,
        symbol,
        instrumentType: quote.instrumentType,
        baseCurrency: quote.baseCurrency,
        valueBrl: quote.valueBrl,
      })),
      skipDuplicates: true,
    });
  }

  const usd = quotes.get("USD");

  if (positions.length > 0) {
    await transaction.position.createMany({
      data: positions.map((position) => {
        const quote = position.asset.quoteSymbol ? quotes.get(position.asset.quoteSymbol) : undefined;


        const repriced = quote?.fromHistory ? quote.valueBrl : null;

        return {
          userId: SCOPED_USER,
          portfolioMonthId: created.id,
          accountId: position.accountId,
          assetId: position.assetId,
          quantity: position.quantity,


          openingQuantity: position.quantity,


          calculationStartDate: autoIncomeParts(position.asset, position.allocations) ? month : null,
          unitPriceBrl: repriced ?? position.unitPriceBrl,
          exchangeRateBrl:
            position.exchangeRateBrl !== null && usd?.fromHistory ? usd.valueBrl : position.exchangeRateBrl,
          totalBrl: repriced ? position.quantity.mul(repriced).toDecimalPlaces(2) : position.totalBrl,
          strategy: position.strategy,
        };
      }),
    });

    const createdPositions = await transaction.position.findMany({
      where: { portfolioMonthId: created.id },
      select: { id: true, accountId: true, assetId: true },
    });
    const idByIdentity = new Map(
      createdPositions.map((position) => [`${position.accountId}:${position.assetId}`, position.id]),
    );
    const allocations = positions.flatMap((position) => {
      const positionId = idByIdentity.get(`${position.accountId}:${position.assetId}`);
      return positionId ? position.allocations.map((allocation) => ({ ...allocation, userId: SCOPED_USER, positionId })) : [];
    });

    if (allocations.length > 0) {
      await transaction.positionAllocation.createMany({ data: allocations });
    }
  }

  const reported = [...positionSymbols].sort((left, right) => left.localeCompare(right));

  return {
    month: created,
    view: {
      month: toMonthParam(month),
      sourceMonth: toMonthParam(source.referenceDate),
      positions: positions.length,
      quotesFromHistory: reported.filter((symbol) => quotes.get(symbol)?.fromHistory),
      carriedQuotes: reported.filter((symbol) => quotes.has(symbol) && !quotes.get(symbol)?.fromHistory),
    },
  };
}

/** Select the purchase's calendar month; create intervening reporting snapshots automatically. */
export async function ensureDatedMonth(dayKey: string, now = new Date()) {
  const day = new Date(`${dayKey}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || !Number.isFinite(day.getTime()) || toDateKey(day) !== dayKey || day > calendarDay(now)) throw new Error("Choose a purchase date on or before today.");
  await ensureMonthsUpToDate(now);
  const prisma = (await getUserDb())!;
  const target = monthOf(day), current = monthOf(calendarDay(now));
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${MONTH_ROLLOVER_LOCK_KEY})`;
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${await currentUserId()}), hashtext(${"portfolio-edits"}))`;
    let source = await transaction.portfolioMonth.findFirst({ where: { referenceDate: { lt: target } }, orderBy: { referenceDate: "desc" }, select: { id: true, referenceDate: true } });
    let selected: { id: string; referenceDate: Date } | null = null;
    for (let date = target; date <= current; date = addMonths(date, 1)) {
      let month = await transaction.portfolioMonth.findFirst({ where: { referenceDate: date }, select: { id: true, referenceDate: true } });
      if (!month) month = source ? (await copyMonth(transaction, source, date, calendarDay(now))).month : await transaction.portfolioMonth.create({ data: { userId: SCOPED_USER, referenceDate: date, status: PortfolioMonthStatus.DRAFT }, select: { id: true, referenceDate: true } });
      if (date.getTime() === target.getTime()) selected = month;
      source = month;
    }
    return selected!;
  }, { maxWait: 10_000, timeout: 60_000 });
}
