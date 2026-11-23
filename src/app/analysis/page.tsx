import type { Metadata } from "next";
import { OverviewAnalytics } from "@/modules/portfolio/ui/overview-analytics";
import { EmptyPortfolio } from "@/modules/portfolio/ui/empty-portfolio";
import { overviewAssetLabel } from "@/modules/portfolio/presentation/position-display";
import { getRiskFreeRate } from "@/modules/portfolio/application/risk-free-rate";
import { getPortfolioLedger } from "@/modules/portfolio/application/get-portfolio-ledger";
import { getOverviewPerformance } from "@/modules/portfolio/application/get-overview-performance";
import { getSp500Benchmark } from "@/modules/quotes/application/sp500-benchmark";
import { getOverviewBenchmark } from "@/modules/portfolio/application/get-overview-benchmark";
import { AppShell } from "@/components/product/app-shell";
import { getMonthContext } from "@/modules/portfolio/application/get-month-context";
import { getOverviewData } from "@/modules/portfolio/application/get-overview-data";
import { returnBaselineDay } from "@/modules/portfolio/domain/time-weighted-return";

export const metadata: Metadata = { title: "Analysis" };

export const dynamic = "force-dynamic";

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const { months, selected } = await getMonthContext(mes);
  const [overview, ledger, benchmark] = await Promise.all([getOverviewData(selected?.referenceDate), getPortfolioLedger(months), getSp500Benchmark()]);
  const [performance, riskFreeRate] = await Promise.all([
    getOverviewPerformance(overview, ledger),
    getRiskFreeRate(),
  ]);
  const reportingBenchmark = await getOverviewBenchmark(benchmark, returnBaselineDay(performance), performance.at(-1)?.day, "USD");

  const asOf = overview?.history.find(p=>p.month===(selected?.month??""))?.day??performance.at(-1)?.day??overview?.referenceDate.toISOString().slice(0,10)??"";
  const observations = performance.filter(p=>p.day<=asOf);

  return (
    <AppShell active="analysis" months={months} selectedMonth={selected?.month ?? null} performance={selected?.month === months.at(-1)?.month ? performance : undefined}>
      {overview ? <div className="relative mx-auto w-full max-w-[1472px] px-5 py-5 sm:px-7 sm:py-6 xl:px-12"><header className="border-b border-border/70 pb-4"><p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Analysis</p><h1 className="mt-1 text-xl font-semibold tracking-[-0.04em] sm:text-2xl">Portfolio Analysis</h1></header><OverviewAnalytics overview={overview} observations={observations} usd={observations} benchmark={reportingBenchmark} rate={riskFreeRate} labels={Object.fromEntries((ledger?.originals??[]).filter(t=>t.assetId).map(t=>[t.assetId!,overviewAssetLabel(t.assetName??"Asset",t.ticker??null)]))} asOf={asOf}/></div> : <EmptyPortfolio /> }
    </AppShell>
  );
}
