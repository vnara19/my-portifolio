import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { monthEndPoints } from "@/modules/quotes/domain/history-backfill";
import { lastDayOf, toDateKey } from "@/modules/quotes/domain/calendar";
import { fetchReferenceFxHistory } from "@/modules/quotes/infrastructure/frankfurter";

/** Add actual month-end FX observations without replacing existing non-carried or manual quotes. */
export async function loadReportingFxHistory(prisma: PrismaClient, currency: "USD" | "EUR", months: string[], now: Date) {
  if (months.length === 0) return { provider: "frankfurter-ecb", inserted: 0 };
  const from = `${months[0]}-01`;
  const until = toDateKey(lastDayOf(new Date(`${months.at(-1)}-01T00:00:00Z`)));
  const nextMonth = new Date(`${months.at(-1)}-01T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const points = monthEndPoints(await fetchReferenceFxHistory(currency, from, until), months[0], toDateKey(nextMonth).slice(0, 7));
  const missing = months.filter((month) => !points.has(month));
  if (missing.length) throw new Error(`Historical ${currency}/BRL rates are unavailable for ${missing.join(", ")}.`);
  const wanted = months.map((month) => ({ month, point: points.get(month)! }));
  return prisma.$transaction(async (db) => {
    const daily = await db.dailyQuote.createMany({ data: wanted.map(({ point }) => ({
      symbol: currency, instrumentType: "FIAT", baseCurrency: currency,
      quoteDate: new Date(`${point.day}T00:00:00Z`), valueBrl: new Prisma.Decimal(point.value).toDecimalPlaces(8),
      provider: "frankfurter-ecb", fetchedAt: now,
    })), skipDuplicates: true });
    for (const { month, point } of wanted) {
      const referenceDate = new Date(`${month}-01T00:00:00Z`);
      const quoteDate = new Date(`${point.day}T00:00:00Z`);
      const valueBrl = new Prisma.Decimal(point.value).toDecimalPlaces(8);
      await db.marketQuote.updateMany({
        where: { referenceDate, symbol: currency, carriedFrom: { not: null } },
        data: { valueBrl, quoteDate, carriedFrom: null },
      });
      await db.marketQuote.createMany({ data: [{ referenceDate, symbol: currency, instrumentType: "FIAT", baseCurrency: currency, valueBrl, quoteDate }], skipDuplicates: true });
    }
    return { provider: "frankfurter-ecb", inserted: daily.count };
  }, { maxWait: 10_000, timeout: 60_000 });
}
