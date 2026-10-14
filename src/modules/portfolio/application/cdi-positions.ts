
/** Recalculate eligible positions from covered rates and dated transactions. Missing data must not silently replace the known balance. */
import { PortfolioMonthStatus, Prisma, type PrismaClient } from "@/generated/prisma/client";
import { addDays as addCalendarDays, isBusinessDay } from "@/modules/portfolio/domain/business-days";
import { calculateIncomeMonth, type CdiMovement } from "@/modules/portfolio/domain/cdi-valuation";
import { autoIncomeParts } from "@/modules/portfolio/domain/fixed-income-policy";
import { calendarDay, toDateKey } from "@/modules/quotes/domain/calendar";
import { fetchCdiDaily } from "@/modules/quotes/infrastructure/bcb";
import { describeProviderError, QuoteHttpError } from "@/modules/quotes/infrastructure/http";


type Client = PrismaClient | Prisma.TransactionClient;

export type CdiRatesFetcher = (startDay: string, endDay: string) => Promise<{ date: string; dailyPercent: string }[]>;

export type CdiReport = {
  rates: { state: "fetched" | "fresh" | "skipped" | "failed"; inserted: number; through: string | null; message?: string };
  valued: number;
  failed: { positionId: string; message: string }[];
};

const INDEXER = "CDI";

const RATES_REFRESH_MS = 3 * 60 * 60 * 1000;

const MAX_WINDOW_DAYS = 5 * 365;

const CDI_POSITION_SELECT = {
  id: true,
  openingQuantity: true,
  calculationStartDate: true,
  calculatedIncomeBrl: true,
  portfolioMonth: { select: { referenceDate: true } },
  asset: { select: { autoIncome: true, maturityDate: true, quoteSymbol: true } },
  allocations: { select: { subclass: true, weight: true, ratePercent: true } },
  transactions: {
    orderBy: [{ occurredOn: "asc" as const }, { createdAt: "asc" as const }],
    select: { kind: true, occurredOn: true, amountBrl: true },
  },
} satisfies Prisma.PositionSelect;

type CdiPosition = Prisma.PositionGetPayload<{ select: typeof CDI_POSITION_SELECT }>;


export const CDI_POSITION_WHERE = {
  calculationStartDate: { not: null },
  asset: { autoIncome: true, quoteSymbol: null },
} satisfies Prisma.PositionWhereInput;


const CDI_ONLY_WHERE = {
  ...CDI_POSITION_WHERE,
  allocations: { some: { subclass: "Pós-fixado" } },
} satisfies Prisma.PositionWhereInput;


export async function syncCdiRates(
  prisma: PrismaClient,
  { now = new Date(), fetchRates = fetchCdiDaily, monthIds }: { now?: Date; fetchRates?: CdiRatesFetcher; monthIds: string[] },
): Promise<CdiReport["rates"]> {
  const earliest = await prisma.position.findFirst({
    where: { ...CDI_ONLY_WHERE, portfolioMonthId: { in: monthIds } },
    orderBy: { calculationStartDate: "asc" },
    select: { calculationStartDate: true },
  });

  if (!earliest?.calculationStartDate) {
    return { state: "skipped", inserted: 0, through: null };
  }

  const today = toDateKey(calendarDay(now));
  const coverage = await prisma.rateCoverage.findMany({ where: { indexer: INDEXER }, orderBy: { throughDate: "desc" } });
  const start = toDateKey(earliest.calculationStartDate);
  const covered = coverage.find((window) => toDateKey(window.fromDate) <= start);
  const latest = coverage[0];

  if (covered && latest && now.getTime() - latest.fetchedAt.getTime() < RATES_REFRESH_MS) {
    return { state: "fresh", inserted: 0, through: toDateKey(latest.throughDate) };
  }


  const from = covered ? nextDay(toDateKey(covered.throughDate)) : start;

  if (from > today) {
    return { state: "fresh", inserted: 0, through: covered ? toDateKey(covered.throughDate) : null };
  }

  try {
    const rates: { date: string; dailyPercent: string }[] = [];

    for (let windowStart = from; windowStart <= today; windowStart = nextDay(addDays(windowStart, MAX_WINDOW_DAYS))) {
      const windowEnd = minDay(addDays(windowStart, MAX_WINDOW_DAYS), today);

      try {
        rates.push(...(await fetchRates(windowStart, windowEnd)));
      } catch (error) {


        if (!(error instanceof QuoteHttpError && error.statusCode === 404)) {
          throw error;
        }
      }
    }

    const valid = rates.filter(
      (rate) => /^\d{4}-\d{2}-\d{2}$/.test(rate.date) && rate.date >= from && rate.date <= today && Number(rate.dailyPercent) >= 0,
    );
    const fetchedAt = new Date();
    const created = await prisma.rateObservation.createMany({
      data: valid.map((rate) => ({
        indexer: INDEXER,
        date: new Date(`${rate.date}T00:00:00.000Z`),
        dailyPercent: new Prisma.Decimal(rate.dailyPercent),
        source: "bcb-sgs-12",
        fetchedAt,
      })),
      skipDuplicates: true,
    });
    const lastPublished = valid.reduce<string | null>((max, rate) => (!max || rate.date > max ? rate.date : max), null);

    if (lastPublished) {
      const fromDate = covered ? covered.fromDate : new Date(`${from}T00:00:00.000Z`);

      await prisma.rateCoverage.deleteMany({ where: { indexer: INDEXER, fromDate } });
      await prisma.rateCoverage.create({
        data: {
          indexer: INDEXER,
          fromDate,
          throughDate: new Date(`${lastPublished}T00:00:00.000Z`),
          lastPublishedDate: new Date(`${lastPublished}T00:00:00.000Z`),
          fetchedAt,
        },
      });
    } else if (covered) {
      await prisma.rateCoverage.update({ where: { id: covered.id }, data: { fetchedAt } });
    }

    return { state: "fetched", inserted: created.count, through: lastPublished ?? (covered ? toDateKey(covered.throughDate) : null) };
  } catch (error) {
    return { state: "failed", inserted: 0, through: covered ? toDateKey(covered.throughDate) : null, message: describeProviderError(error).message };
  }
}


export async function valueCdiPositions(
  client: Client,
  { where, now = new Date(), asOf }: { where: Prisma.PositionWhereInput; now?: Date; asOf?: string },
) {
  const positions = await client.position.findMany({ where: { ...where, ...CDI_POSITION_WHERE }, select: CDI_POSITION_SELECT });
  const results: { positionId: string; state: "calculated" | "unavailable"; message?: string }[] = [];

  if (positions.length === 0) {
    return results;
  }

  const cdiPositions = positions.filter((position) => position.allocations.some((allocation) => allocation.subclass === "Pós-fixado"));
  const earliest = cdiPositions.reduce<Date | null>(
    (min, position) => (!min || position.calculationStartDate! < min ? position.calculationStartDate! : min),
    null,
  );

  const [rates, coverage] = earliest
    ? await Promise.all([
        client.rateObservation.findMany({
          where: { indexer: INDEXER, date: { gte: earliest } },
          select: { date: true, dailyPercent: true },
        }),
        client.rateCoverage.findMany({ where: { indexer: INDEXER }, select: { fromDate: true, throughDate: true } }),
      ])
    : [[], []];
  const rateList = rates.map((rate) => ({ date: toDateKey(rate.date), dailyPercent: rate.dailyPercent.toString() }));
  const windows = coverage.map((window) => ({ from: toDateKey(window.fromDate), through: toDateKey(window.throughDate) }));
  const lastVerified = windows.reduce<string | null>((max, window) => (!max || window.through > max ? window.through : max), null);


  const until = asOf ?? toDateKey(calendarDay(now));
  const verifiedUntil = lastVerified ? minDay(until, nextDay(lastVerified)) : until;

  for (const position of positions) {
    const prefixed = !cdiPositions.includes(position);


    const evaluation = minDay(prefixed ? until : verifiedUntil, nextMonthStart(position.portfolioMonth.referenceDate));
    const result = valueOne(position, { rates: rateList, windows, asOf: evaluation });

    if (result.state === "calculated") {
      await client.position.update({
        where: { id: position.id },
        data: {
          quantity: new Prisma.Decimal(result.balance),
          totalBrl: new Prisma.Decimal(result.balance),
          calculatedIncomeBrl: new Prisma.Decimal(result.income),
          incomeCalculatedThrough: result.lastRateDate ? new Date(`${result.lastRateDate}T00:00:00.000Z`) : null,
          incomeCalculationError: null,
        },
      });
      results.push({ positionId: position.id, state: "calculated" });
    } else {
      await client.position.update({
        where: { id: position.id },
        data: { incomeCalculationError: result.message.slice(0, 500) },
      });
      results.push({ positionId: position.id, state: "unavailable", message: result.message });
    }
  }

  return results;
}

function valueOne(
  position: CdiPosition,
  { rates, windows, asOf }: { rates: { date: string; dailyPercent: string }[]; windows: { from: string; through: string }[]; asOf: string },
) {
  const start = toDateKey(position.calculationStartDate!);
  const parts = autoIncomeParts(position.asset, position.allocations);

  if (!parts) {
    return { state: "unavailable" as const, message: "Enter the rate of return for every floating-rate or fixed-rate classification." };
  }

  if (parts.some((part) => part.indexer === "CDI") && windows.length === 0) {
    return { state: "unavailable" as const, message: "Banco Central CDI data has not loaded yet. The known balance was preserved." };
  }

  return calculateIncomeMonth({
    openingBalance: position.openingQuantity.toString(),
    startDate: start,
    asOf: asOf < start ? start : asOf,
    maturityDate: position.asset.maturityDate ? toDateKey(position.asset.maturityDate) : null,
    parts,
    movements: position.transactions.map((entry) => ({
      date: toDateKey(entry.occurredOn),
      kind: entry.kind,
      amount: entry.amountBrl.toString(),
    })) satisfies CdiMovement[],
    rates,
    verifiedCoverage: windows,
  });
}

function nextDay(day: string) {
  return addDays(day, 1);
}


function nextMonthStart(referenceDate: Date) {
  return toDateKey(new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1)));
}

function addDays(day: string, amount: number) {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function minDay(left: string, right: string) {
  return left < right ? left : right;
}


export async function syncCdi(
  prisma: PrismaClient,
  { now = new Date(), fetchRates = fetchCdiDaily }: { now?: Date; fetchRates?: CdiRatesFetcher } = {},
): Promise<CdiReport> {
  const currentMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const months = await prisma.portfolioMonth.findMany({
    where: { OR: [{ referenceDate: currentMonth }, { status: PortfolioMonthStatus.DRAFT, referenceDate: { lt: currentMonth } }] },
    select: { id: true },
  });
  const monthIds = months.map((month) => month.id);

  if (monthIds.length === 0) {
    return { rates: { state: "skipped", inserted: 0, through: null }, valued: 0, failed: [] };
  }

  const rates = await syncCdiRates(prisma, { now, fetchRates, monthIds });
  await completePreviousCloses(prisma, monthIds);

  const results = await valueCdiPositions(prisma, { where: { portfolioMonthId: { in: monthIds } }, now });

  return {
    rates,
    valued: results.filter((result) => result.state === "calculated").length,
    failed: results.flatMap((result) => (result.state === "unavailable" ? [{ positionId: result.positionId, message: result.message ?? "" }] : [])),
  };
}


async function completePreviousCloses(prisma: PrismaClient, monthIds: string[]) {
  const successors = await prisma.position.findMany({
    where: { ...CDI_ONLY_WHERE, portfolioMonthId: { in: monthIds } },
    select: {
      id: true,
      userId: true,
      assetId: true,
      accountId: true,
      openingQuantity: true,
      calculationStartDate: true,
      portfolioMonth: { select: { referenceDate: true } },
    },
  });

  for (const successor of successors) {
    const monthStart = successor.portfolioMonth.referenceDate;


    if (successor.calculationStartDate?.getTime() !== monthStart.getTime()) {
      continue;
    }

    const previousMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1));
    const predecessor = await prisma.position.findFirst({
      where: {
        ...CDI_ONLY_WHERE,
        userId: successor.userId,
        assetId: successor.assetId,
        accountId: successor.accountId,
        portfolioMonth: { referenceDate: previousMonth },
      },
      select: { id: true, incomeCalculatedThrough: true, incomeCalculationError: true },
    });
    const lastBusinessDay = lastBusinessDayBefore(toDateKey(monthStart));

    if (
      !predecessor ||
      (!predecessor.incomeCalculationError &&
        predecessor.incomeCalculatedThrough &&
        toDateKey(predecessor.incomeCalculatedThrough) >= lastBusinessDay)
    ) {
      continue;
    }

    const [result] = await valueCdiPositions(prisma, { where: { id: predecessor.id }, asOf: toDateKey(monthStart) });

    if (result?.state !== "calculated") {
      continue;
    }

    const closed = await prisma.position.findUniqueOrThrow({ where: { id: predecessor.id }, select: { quantity: true } });

    if (!closed.quantity.equals(successor.openingQuantity)) {
      await prisma.position.update({ where: { id: successor.id }, data: { openingQuantity: closed.quantity } });
    }
  }
}


function lastBusinessDayBefore(day: string) {
  let cursor = addCalendarDays(day, -1);

  while (!isBusinessDay(cursor)) {
    cursor = addCalendarDays(cursor, -1);
  }

  return cursor;
}
