import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { QuoteRequest } from "../domain/quote-types";
import { completedCloses } from "../domain/recent-closes";
import { fetchYahooRecentDailyHistory } from "../infrastructure/yahoo";
import { fetchReferenceFxHistory } from "../infrastructure/frankfurter";

const PROVIDER = "yahoo-close";
type ClosingTarget = Pick<QuoteRequest, "symbol" | "instrumentType" | "baseCurrency">;
function historySymbol(target: ClosingTarget) {
  if (target.instrumentType === "CRIPTO") return /^[A-Z0-9]{1,12}$/.test(target.symbol) ? `${target.symbol}-USD` : null;
  return target.instrumentType.startsWith("EU_") || ["ACAO", "FII", "ETF", "REIT", "STOCK"].includes(target.instrumentType) ? target.symbol : null;
}

/** Reconcile recent completed sessions once per UTC day. Never change fills, monthly holdings or today's live quote. */
export async function refreshRecentDailyCloses(prisma: PrismaClient, targets: ClosingTarget[], now = new Date(), dependencies = { loadPrices: fetchYahooRecentDailyHistory, loadFx: fetchReferenceFxHistory }) {
  const today = now.toISOString().slice(0, 10);
  const from = new Date(Date.parse(today) - 14 * 86400000).toISOString().slice(0, 10);
  const until = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  const candidates = [...new Map(targets.filter(t => historySymbol(t)).map(t => [t.symbol, t])).values()];
  if (!candidates.length) return { updated: 0, failed: [] as string[] };
  const checked = await prisma.dailyQuote.findMany({ where: { symbol: { in: candidates.map(t => t.symbol) }, provider: PROVIDER, fetchedAt: { gte: new Date(today) }, quoteDate: { lt: new Date(today) } }, select: { symbol: true } });
  const pending = candidates.filter(t => !checked.some(c => c.symbol === t.symbol));
  if (!pending.length) return { updated: 0, failed: [] as string[] };
  const currencies = [...new Set(pending.map(t => t.instrumentType === "CRIPTO" ? "USD" : t.baseCurrency).filter((c): c is "EUR" | "USD" => c === "EUR" || c === "USD"))];
  for (const currency of currencies) {
    // Insert missing public observations only. Never replace a previously recorded acquisition conversion.
    const fx = await dependencies.loadFx(currency, from, until);
    await prisma.dailyQuote.createMany({ data: fx.map(p => ({ symbol: currency, instrumentType: "FIAT", baseCurrency: currency, quoteDate: new Date(p.day), valueBrl: new Prisma.Decimal(p.value), provider: "frankfurter-ecb", fetchedAt: now })), skipDuplicates: true });
  }
  const fx = await prisma.dailyQuote.findMany({ where: { symbol: { in: currencies }, quoteDate: { gte: new Date(from), lt: new Date(today) } }, orderBy: { quoteDate: "asc" }, select: { symbol: true, quoteDate: true, valueBrl: true } });
  let updated = 0;
  const failed: string[] = [];
  for (const target of pending) {
    try {
      const history = await dependencies.loadPrices(historySymbol(target)!);
      const currency = target.instrumentType === "CRIPTO" ? "USD" : target.baseCurrency;
      if (history.currency !== currency) throw new Error("Closing-price currency does not match the registered instrument.");
      const points = completedCloses(history.points, fx.filter(p => p.symbol === currency).map(p => ({ day: p.quoteDate.toISOString().slice(0, 10), rate: p.valueBrl.toNumber() })), currency, today);
      if (!points.length) throw new Error("No completed sessions returned.");
      updated += await prisma.$executeRaw`
        INSERT INTO "daily_quotes" ("id", "symbol", "quote_date", "instrument_type", "base_currency", "value_brl", "provider", "fetched_at")
        SELECT gen_random_uuid(), ${target.symbol}, "s"."day"::date, ${target.instrumentType}, ${currency}, "s"."price", ${PROVIDER}, ${now}
        FROM UNNEST(${points.map(p => p.day)}::text[], ${points.map(p => new Prisma.Decimal(p.valueBrl).toDecimalPlaces(8).toString())}::numeric[]) AS "s"("day", "price")
        ON CONFLICT ("symbol", "quote_date") DO UPDATE SET "value_brl" = EXCLUDED."value_brl", "base_currency" = EXCLUDED."base_currency", "provider" = EXCLUDED."provider", "fetched_at" = EXCLUDED."fetched_at", "run_id" = NULL
        WHERE "daily_quotes"."provider" NOT IN ('manual', 'spreadsheet')`;
    } catch { failed.push(target.symbol); }
  }
  return { updated, failed };
}
