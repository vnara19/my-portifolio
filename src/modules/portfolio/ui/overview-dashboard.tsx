import { overviewPerformanceMetrics } from "../domain/overview-performance-metrics";
import type { TwrObservation } from "../domain/time-weighted-return";
import type { Sp500Benchmark } from "@/modules/quotes/application/sp500-benchmark";
import type { OverviewData } from "@/modules/portfolio/application/get-overview-data";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { AllocationExplorer } from "@/modules/portfolio/ui/allocation-explorer";
import { AssetTypeBreakdown } from "@/modules/portfolio/ui/asset-type-breakdown";
import { EmptyPortfolio } from "@/modules/portfolio/ui/empty-portfolio";
import { OverviewQuotes } from "@/modules/portfolio/ui/overview-quotes";
import { OverviewKpis } from "@/modules/portfolio/ui/overview-kpis";
import { PortfolioEvolutionChart } from "@/modules/portfolio/ui/portfolio-evolution-chart";
import type { SelicMonthView } from "@/modules/quotes/application/selic-reference";
import { DevQuoteSyncButton } from "@/modules/quotes/ui/dev-quote-sync-button";

export function OverviewDashboard({ overview, selic, performance, benchmark }: { overview: OverviewData | null; selic: SelicMonthView | null; performance: TwrObservation[]; benchmark: Sp500Benchmark }) {
  if (!overview) {
    return <><div className="mx-auto max-w-[1472px] px-5 pt-6 sm:px-7 xl:px-12"><DevQuoteSyncButton /></div><EmptyPortfolio /></>;
  }

  const monthParam = toMonthParam(overview.referenceDate);

  return (
    <div className="relative mx-auto w-full max-w-[1472px] px-5 py-5 sm:px-7 sm:py-6 xl:px-12">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Overview
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.04em] sm:text-2xl">Portfolio Overview
          </h1>
        </div>
        <DevQuoteSyncButton />
      </header>

      <div className="mt-4">
        <OverviewKpis overview={overview} metrics={overviewPerformanceMetrics(performance, overview.history.find(p=>p.month===monthParam)?.day??`${monthParam}-31`)} />
      </div>

      <div className="mt-3"><OverviewQuotes overview={overview} selic={selic} /></div>

      <section
        id="evolucao"
        className="premium-panel mt-6 rounded-[24px] p-5 sm:p-7"
        aria-labelledby="evolution-title"
      >
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 id="evolution-title" className="text-base font-semibold tracking-[-0.025em]">Portfolio Change
          </h2>
        </div>

        <div className="mt-5">
          <PortfolioEvolutionChart
            observations={performance}
            benchmark={benchmark}
            history={overview.history}
            selectedMonth={monthParam}
            classLabels={overview.classLabels}
            currencyLabels={overview.currencyLabels}
          />
        </div>
      </section>


      <div className="mt-6">
        <AssetTypeBreakdown rows={overview.byType} />
      </div>

      <AllocationExplorer groups={overview.rebalanceGroups} fixedIncomeDuration={overview.fixedIncomeDuration} />
    </div>
  );
}
