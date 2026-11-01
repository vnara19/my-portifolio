import { getOverviewFx } from "@/modules/portfolio/application/get-overview-fx";
import { getRiskFreeRate } from "@/modules/portfolio/application/risk-free-rate";
import { getPortfolioLedger } from "@/modules/portfolio/application/get-portfolio-ledger";
import { getOverviewPerformance } from "@/modules/portfolio/application/get-overview-performance";
import { getSp500Benchmark } from "@/modules/quotes/application/sp500-benchmark";
import { getOverviewBenchmark } from "@/modules/portfolio/application/get-overview-benchmark";
import { AppShell } from "@/components/product/app-shell";
import { getMonthContext } from "@/modules/portfolio/application/get-month-context";
import { getOverviewData } from "@/modules/portfolio/application/get-overview-data";
import { OverviewDashboard } from "@/modules/portfolio/ui/overview-dashboard";
import { getSelicForMonth } from "@/modules/quotes/application/selic-reference";
import { returnBaselineDay } from "@/modules/portfolio/domain/time-weighted-return";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const { months, selected } = await getMonthContext(mes);
  const [overview, selic, ledger, benchmark] = await Promise.all([getOverviewData(selected?.referenceDate), getSelicForMonth(selected?.referenceDate), getPortfolioLedger(months), getSp500Benchmark()]);
  const [performance, performanceEur, riskFreeRate, fxHistory] = await Promise.all([
    getOverviewPerformance(overview, ledger),
    getOverviewPerformance(overview, ledger, "EUR"),
    getRiskFreeRate(),
    getOverviewFx(),
  ]);
  const reportingBenchmark = await getOverviewBenchmark(benchmark, returnBaselineDay(performanceEur), performanceEur.at(-1)?.day);

  return (
    <AppShell active="overview" months={months} selectedMonth={selected?.month ?? null}>
      <OverviewDashboard overview={overview} selic={selic} performance={performance} performanceEur={performanceEur} benchmark={reportingBenchmark} riskFreeRate={riskFreeRate} fxHistory={fxHistory} assetLabels={Object.fromEntries((ledger?.originals??[]).filter(t=>t.assetId).map(t=>[t.assetId!,t.ticker??t.assetName??"Asset"]))} />
    </AppShell>
  );
}
