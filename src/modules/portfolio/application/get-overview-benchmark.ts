import { getUserDb } from "@/lib/user-db";
import type { Sp500Benchmark } from "@/modules/quotes/application/sp500-benchmark";
import { benchmarkInEur } from "../domain/benchmark-reporting";

/** Match the portfolio's EUR reference; no user holdings are sent to the index provider. */
export async function getOverviewBenchmark(benchmark: Sp500Benchmark, from?: string, through?: string): Promise<Sp500Benchmark> {
  const unavailable = { points: [], source: `${benchmark.source} · EUR reference unavailable`, available: false };
  const db = await getUserDb();
  if (!db || !benchmark.available || !from || !through) return unavailable;
  const baseline = benchmark.points.filter(p => p.day <= from).at(-1);
  if (!baseline) return unavailable;
  const points = benchmark.points.filter(p => p.day >= baseline.day && p.day <= through);
  const rates = await db.dailyQuote.findMany({
    where: { symbol: { in: ["USD", "EUR"] }, quoteDate: {
      gte: new Date(Date.parse(baseline.day) - 7 * 86400000), lte: new Date(through),
    } },
    orderBy: { quoteDate: "asc" }, select: { symbol: true, quoteDate: true, valueBrl: true },
  });
  const fx = (symbol: string) => rates.filter(r => r.symbol === symbol).map(r => ({ day: r.quoteDate.toISOString().slice(0, 10), rate: r.valueBrl.toNumber() }));
  const converted = benchmarkInEur(points, fx("USD"), fx("EUR"));
  return converted?.length ? { points: converted, source: `${benchmark.source} · EUR reference with historical FX`, available: true } : unavailable;
}
