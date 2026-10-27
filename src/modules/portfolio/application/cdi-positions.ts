
/** Recalculate eligible positions from covered rates and dated transactions. Missing data must not silently replace the known balance. */
import { PortfolioMonthStatus, Prisma, type PrismaClient } from "@/generated/prisma/client";
import { addDays as addCalendarDays, isBusinessDay } from "@/modules/portfolio/domain/business-days";
import { calculateIncomeMonth, type CdiMovement } from "@/modules/portfolio/domain/cdi-valuation";
import { autoIncomeParts } from "@/modules/portfolio/domain/fixed-income-policy";
import { calendarDay, toDateKey } from "@/modules/quotes/domain/calendar";
import { readFixedIncomeContract } from "@/modules/portfolio/domain/brazilian-fixed-income";
import { fetchCdiDaily, fetchIpcaMonthly } from "@/modules/quotes/infrastructure/bcb";
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
  userId: true,
  accountId: true,
  assetId: true,
  openingQuantity: true,
  calculationStartDate: true,
  calculatedIncomeBrl: true,
  portfolioMonth: { select: { referenceDate: true } },
  asset: { select: { autoIncome: true, maturityDate: true, quoteSymbol: true, fixedIncomeContract: true, appliedOn: true } },
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

  const rateStart = (position: CdiPosition) => readFixedIncomeContract(position.asset.fixedIncomeContract) && position.asset.appliedOn ? position.asset.appliedOn : position.calculationStartDate!;
  const cdiPositions = positions.filter((position) => position.allocations.some((allocation) => allocation.subclass === "Pós-fixado"));
  const earliest = cdiPositions.reduce<Date | null>(
    (min, position) => (!min || rateStart(position) < min ? rateStart(position) : min),
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

  const ipcaStart = positions.filter((position) => position.allocations.some((allocation) => allocation.subclass === "IPCA")).reduce<Date | null>((earliest, position) => !earliest || rateStart(position) < earliest ? rateStart(position) : earliest, null);
  const ipcaRates = ipcaStart ? await client.rateObservation.findMany({ where: { indexer: "IPCA", date: { gte: new Date(previousMonthStart(toDateKey(ipcaStart))) } }, select: { date: true, dailyPercent: true } }) : [];
  const ipcaList = ipcaRates.map((rate) => ({ date: toDateKey(rate.date), dailyPercent: rate.dailyPercent.toString() }));
  for (const position of positions) {
    const prefixed = !cdiPositions.includes(position);


    const evaluation = minDay(prefixed ? until : verifiedUntil, nextMonthStart(position.portfolioMonth.referenceDate));
    let calculation = position;
    if (readFixedIncomeContract(position.asset.fixedIncomeContract) && position.asset.appliedOn) {
      const movements = await client.positionTransaction.findMany({ where: { userId: position.userId, occurredOn: { lte: new Date(until) }, position: { accountId: position.accountId, assetId: position.assetId, portfolioMonth: { referenceDate: { lte: position.portfolioMonth.referenceDate } } } }, orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }], select: { kind: true, occurredOn: true, amountBrl: true, quantity: true } });
      calculation = { ...position, openingQuantity: new Prisma.Decimal(0), calculationStartDate: position.asset.appliedOn, transactions: movements };
    }
    const result = valueOne({ ...calculation, transactions: calculation.transactions.filter((entry) => toDateKey(entry.occurredOn) <= until) }, { rates: rateList, windows, asOf: evaluation, ipcaRates: ipcaList });

    if (result.state === "calculated") {
      await client.position.update({
        where: { id: position.id },
        data: {
          quantity: new Prisma.Decimal(result.balance),
          totalBrl: new Prisma.Decimal(result.balance),
          calculatedIncomeBrl: readFixedIncomeContract(position.asset.fixedIncomeContract)
            ? new Prisma.Decimal(result.balance).minus(position.openingQuantity).minus(position.transactions.reduce((sum, movement) => sum.plus(movement.kind === "WITHDRAWAL" ? movement.amountBrl.negated() : movement.amountBrl), new Prisma.Decimal(0)))
            : new Prisma.Decimal(result.income),
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
  { rates, windows, asOf, ipcaRates = [] }: { ipcaRates?: { date: string; dailyPercent: string }[]; rates: { date: string; dailyPercent: string }[]; windows: { from: string; through: string }[]; asOf: string },
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
    annualBasis: readFixedIncomeContract(position.asset.fixedIncomeContract)?.basis,
    ipcaRates,
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
  await syncIpcaRates(prisma, monthIds, now);
  const contracts = await prisma.asset.findMany({ where: { fixedIncomeContract: { not: Prisma.DbNull }, positions: { some: { portfolioMonthId: { in: monthIds } } } }, select: { fixedIncomeContract: true, appliedOn: true } });
  for (const asset of contracts) {
    const contract = readFixedIncomeContract(asset.fixedIncomeContract);
    if (contract && asset.appliedOn) await primeFixedIncomeRates(prisma, contract.indexer, toDateKey(asset.appliedOn), now);
  }
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


/** Monthly observations are reused; no projection or daily inflation series is invented. */
export async function syncIpcaRates(prisma: PrismaClient, monthIds: string[], now = new Date(), fetchRates = fetchIpcaMonthly) {
  const first = await prisma.position.findFirst({ where: { ...CDI_POSITION_WHERE, portfolioMonthId: { in: monthIds }, allocations: { some: { subclass: "IPCA" } } }, orderBy: { calculationStartDate: "asc" }, select: { calculationStartDate: true } });
  if (!first?.calculationStartDate) return;
  const start = previousMonthStart(toDateKey(first.calculationStartDate));
  const latest = await prisma.rateCoverage.findFirst({ where: { indexer: "IPCA", fromDate: { lte: new Date(start) } }, orderBy: { fetchedAt: "desc" } });
  if (latest && now.getTime() - latest.fetchedAt.getTime() < RATES_REFRESH_MS) return;
  try {
    const observations = await fetchRates(start, toDateKey(calendarDay(now)));
    if (!observations.length) return;
    const valid = observations.filter((rate) => rate.date >= start && rate.date <= toDateKey(calendarDay(now)) && /^\d{4}-\d{2}-01$/.test(rate.date) && Number.isFinite(Number(rate.dailyPercent)) && Number(rate.dailyPercent) > -100);
    if (valid.length !== observations.length) throw new Error("Invalid IPCA observations.");
    await prisma.rateObservation.createMany({ data: valid.map((rate) => ({ indexer: "IPCA", date: new Date(rate.date), dailyPercent: rate.dailyPercent, source: "bcb-sgs-433-monthly", fetchedAt: now })), skipDuplicates: true });
    const through = valid.map((rate) => rate.date).sort().at(-1)!;
    await prisma.rateCoverage.upsert({ where: { indexer_fromDate_throughDate: { indexer: "IPCA", fromDate: new Date(start), throughDate: new Date(through) } }, create: { indexer: "IPCA", fromDate: new Date(start), throughDate: new Date(through), lastPublishedDate: new Date(through), fetchedAt: now }, update: { fetchedAt: now } });
  } catch { /* Valuation reports unavailable if no official observations are present. */ }
}

/** Warm shared observations before opening the private position-write transaction. */
export async function primeFixedIncomeRates(prisma: PrismaClient, indexer: string, from: string, now = new Date()) {
  if (indexer === "PRE") return;
  const today = toDateKey(calendarDay(now));
  const start = indexer === "IPCA" ? previousMonthStart(from) : from;
  const cached = await prisma.rateCoverage.findFirst({ where: { indexer, fromDate: { lte: new Date(start) } }, orderBy: { fetchedAt: "desc" } });
  if (cached && now.getTime() - cached.fetchedAt.getTime() < RATES_REFRESH_MS) return;
  try {
    const observations: { date: string; dailyPercent: string }[] = [];
    for (let cursor = start; cursor <= today; cursor = nextDay(addDays(cursor, MAX_WINDOW_DAYS))) {
      const end = minDay(today, addDays(cursor, MAX_WINDOW_DAYS));
      observations.push(...await (indexer === "IPCA" ? fetchIpcaMonthly : fetchCdiDaily)(cursor, end));
    }
    if (!observations.length) return;
    if (observations.some((rate) => rate.date < start || rate.date > today || !/^\d{4}-\d{2}-\d{2}$/.test(rate.date) || !Number.isFinite(Number(rate.dailyPercent)) || (indexer === "CDI" ? Number(rate.dailyPercent) < 0 : Number(rate.dailyPercent) <= -100))) throw new Error("Invalid reference observations.");
    await prisma.rateObservation.createMany({ data: observations.map((rate) => ({ indexer, date: new Date(rate.date), dailyPercent: rate.dailyPercent, source: indexer === "IPCA" ? "bcb-sgs-433-monthly" : "bcb-sgs-12", fetchedAt: now })), skipDuplicates: true });
    const through = observations.map((rate) => rate.date).sort().at(-1)!;
    await prisma.rateCoverage.upsert({ where: { indexer_fromDate_throughDate: { indexer, fromDate: new Date(start), throughDate: new Date(through) } }, create: { indexer, fromDate: new Date(start), throughDate: new Date(through), lastPublishedDate: new Date(through), fetchedAt: now }, update: { fetchedAt: now } });
  } catch { /* Keep the acquisition; valuation exposes missing data rather than a fabricated return. */ }
}


function previousMonthStart(day: string) {
  return new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
}

/** Refresh only the current user's structured bank deposits, outside navigation's render path. */
export async function refreshFixedIncomeForUser(now = new Date()) {
  const { getUserDb } = await import("@/lib/user-db");
  const db = await getUserDb();
  if (!db) return false;
  const day = calendarDay(now);
  const referenceDate = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
  const before = await db.position.findMany({ where: { portfolioMonth: { referenceDate }, asset: { autoIncome: true, fixedIncomeContract: { not: Prisma.DbNull } } }, select: { id: true, userId: true, portfolioMonthId: true, totalBrl: true, incomeCalculationError: true, asset: { select: { fixedIncomeContract: true, appliedOn: true } } } });
  if (!before.length) return false;
  for (const row of before) {
    const contract = readFixedIncomeContract(row.asset.fixedIncomeContract);
    if (contract && row.asset.appliedOn) await primeFixedIncomeRates(db, contract.indexer, toDateKey(row.asset.appliedOn), now);
  }
  await db.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${before[0].userId}), hashtext(${"portfolio-edits"}))`;
    await valueCdiPositions(transaction, { where: { id: { in: before.map((row) => row.id) } }, now });
  }, { maxWait: 10_000, timeout: 30_000 });
  const after = await db.position.findMany({ where: { id: { in: before.map((row) => row.id) } }, select: { id: true, totalBrl: true, incomeCalculationError: true } });
  return after.some((row) => { const old = before.find((entry) => entry.id === row.id)!; return !row.totalBrl.equals(old.totalBrl) || row.incomeCalculationError !== old.incomeCalculationError; });
}
