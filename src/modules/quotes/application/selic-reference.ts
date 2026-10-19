import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { fetchSelicTarget, selicChangePoints, type SelicFetcher } from "@/modules/quotes/infrastructure/bcb-selic";
import { describeProviderError } from "@/modules/quotes/infrastructure/http";

export const SELIC_RATE_KEY = "SELIC_TARGET";
export const SELIC_REFRESH_MS = 24 * 60 * 60 * 1000;
// Retry an outage on the next hourly job instead of replaying a cached failure all day.
export const SELIC_FAILURE_RETRY_MS = 30 * 60 * 1000;
const SELIC_LOCK_KEY = 2_026_100_204;

const HISTORY_YEARS = 10;


export type SelicMonthView = {
  percentAnnual: number;

  asOf: string;

  effectiveOn: string;

  stale: boolean;
};

export type SelicSyncReport = { state: "fetched" | "fresh" | "failed"; observedOn: string | null; message?: string };


export async function getSelicForMonth(referenceDate: Date | null | undefined, now = new Date()): Promise<SelicMonthView | null> {
  const prisma = getPrismaClient();
  if (!prisma || !referenceDate) return null;

  const today = saoPauloDay(now);
  const lastDay = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const asOf = lastDay < today ? lastDay : today;
  const [point, latest] = await Promise.all([
    prisma.referenceRatePoint.findFirst({
      where: { key: SELIC_RATE_KEY, effectiveOn: { lte: new Date(`${asOf}T00:00:00.000Z`) } },
      orderBy: { effectiveOn: "desc" },
    }),
    prisma.referenceRate.findUnique({ where: { key: SELIC_RATE_KEY }, select: { observedOn: true } }),
  ]);

  if (!point) return null;

  return {
    percentAnnual: point.percentAnnual.toNumber(),
    asOf,
    effectiveOn: point.effectiveOn.toISOString().slice(0, 10),
    stale: !latest?.observedOn || latest.observedOn.toISOString().slice(0, 10) < asOf,
  };
}


export async function syncSelicReference(
  prisma: PrismaClient,
  { now = new Date(), fetchRate = fetchSelicTarget }: { now?: Date; fetchRate?: SelicFetcher } = {},
): Promise<SelicSyncReport> {
  const claim = await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${SELIC_LOCK_KEY})`;
    const [row, anyPoint] = await Promise.all([
      transaction.referenceRate.findUnique({ where: { key: SELIC_RATE_KEY } }),
      transaction.referenceRatePoint.findFirst({ where: { key: SELIC_RATE_KEY }, select: { effectiveOn: true } }),
    ]);
    const observedOn = row?.observedOn?.toISOString().slice(0, 10) ?? null;
    const refreshAfter = row?.errorMessage ? SELIC_FAILURE_RETRY_MS : SELIC_REFRESH_MS;
    const recent = row?.lastAttemptAt && now.getTime() - row.lastAttemptAt.getTime() < refreshAfter;


    const backfill =
      !anyPoint && !row?.errorMessage && Boolean(row?.fetchedAt && row.lastAttemptAt && row.lastAttemptAt <= row.fetchedAt);

    if (recent && !backfill) {
      return { due: false as const, observedOn, errorMessage: row?.errorMessage ?? null };
    }

    await transaction.referenceRate.upsert({
      where: { key: SELIC_RATE_KEY },
      create: { key: SELIC_RATE_KEY, lastAttemptAt: now },
      update: { lastAttemptAt: now },
    });
    return { due: true as const, observedOn: anyPoint ? observedOn : null, errorMessage: null };
  }, { maxWait: 10_000, timeout: 15_000 });

  if (!claim.due) {
    return claim.errorMessage
      ? { state: "failed", observedOn: claim.observedOn, message: claim.errorMessage }
      : { state: "fresh", observedOn: claim.observedOn };
  }

  try {


    const today = saoPauloDay(now);
    const start = claim.observedOn ?? historyStart(today);
    const history = await fetchRate(start, today);
    const latest = history.observations[history.observations.length - 1];
    const percent = new Prisma.Decimal(latest?.percentAnnual ?? "NaN");
    const observedDate = new Date(`${latest?.observedOn}T00:00:00.000Z`);

    if (!latest || !Number.isFinite(observedDate.getTime()) || latest.observedOn > today || !percent.isFinite() || percent.isNegative() || percent.greaterThan(1000)) {
      throw new Error("The source returned an invalid or future Selic target rate.");
    }

    const before = await prisma.referenceRatePoint.findFirst({
      where: { key: SELIC_RATE_KEY, effectiveOn: { lt: new Date(`${history.observations[0].observedOn}T00:00:00.000Z`) } },
      orderBy: { effectiveOn: "desc" },
    });
    const points = selicChangePoints(history, before ? before.percentAnnual.toString() : null);

    await prisma.$transaction([
      prisma.referenceRatePoint.createMany({
        data: points.map((point) => ({
          key: SELIC_RATE_KEY,
          effectiveOn: new Date(`${point.effectiveOn}T00:00:00.000Z`),
          percentAnnual: new Prisma.Decimal(point.percentAnnual),
        })),
        skipDuplicates: true,
      }),
      prisma.referenceRate.update({
        where: { key: SELIC_RATE_KEY },
        data: { percentAnnual: percent, observedOn: observedDate, source: history.source, fetchedAt: now, errorMessage: null },
      }),
    ]);
    return { state: "fetched", observedOn: latest.observedOn };
  } catch (error) {
    const message = describeProviderError(error).message.slice(0, 500);
    await prisma.referenceRate.update({ where: { key: SELIC_RATE_KEY }, data: { errorMessage: message } });
    return { state: "failed", observedOn: claim.observedOn, message };
  }
}

function saoPauloDay(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function historyStart(today: string) {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() - HISTORY_YEARS);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
