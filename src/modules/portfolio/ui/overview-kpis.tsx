"use client";

import { englishLabel } from "@/lib/english-labels";

import NumberFlow from "@number-flow/react";
import { BankIcon, CurrencyBtcIcon, CurrencyDollarIcon, TrendUpIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

import { KpiCard } from "@/components/product/kpi-card";
import type { OverviewData } from "@/modules/portfolio/application/get-overview-data";
import { formatBrl, formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { ChangeKpiCard } from "@/modules/portfolio/ui/kpi-card";
import type { SelicMonthView } from "@/modules/quotes/application/selic-reference";
import { describeSelic, formatSelic } from "@/modules/quotes/presentation/selic-format";

export function OverviewKpis({ overview, selic }: { overview: OverviewData; selic: SelicMonthView | null }) {
  return (
    <section aria-label="Reporting month metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Total portfolio value"
        testId="portfolio-total"
        icon={<TrendUpIcon aria-hidden="true" size={18} weight="duotone" />}
        value={
          <NumberFlow
            value={overview.totalBrl}
            format={{ style: "currency", currency: "BRL", maximumFractionDigits: 0 }}
            locales="en-GB"
          />
        }
        detail={
          overview.totalUsd === null
            ? "Monthly exchange rate unavailable"
            : `US$ ${overview.totalUsd.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
        }
      />

      <ChangeKpiCard
        label="Monthly change"
        testId="month-change"
        changeBrl={overview.changeBrl}
        changePercent={overview.changePercent}
        emptyDetail={
          overview.previousMonth === null
            ? "First reporting month in history"
            : `Insufficient history: no ${formatMonthCompact(overview.previousMonth)}`
        }
      />

      <ChangeKpiCard
        label="12-month change"
        testId="year-change"
        changeBrl={overview.change12mBrl}
        changePercent={overview.change12mPercent}
        detailSuffix={`since ${formatMonthCompact(overview.yearAgoMonth)}`}
        emptyDetail={
          overview.yearAgoMissing
            ? `Insufficient history: no ${formatMonthCompact(overview.yearAgoMonth)}`
            : "Insufficient history"
        }
      />

      <ChangeKpiCard
        label="All-time change"
        testId="period-change"
        changeBrl={overview.changeSinceStartBrl}
        changePercent={overview.changeSinceStartPercent}
        detailSuffix={`since ${formatMonthCompact(overview.periodStart)}`}
        emptyDetail={
          overview.beforePeriodStart
            ? `The period starts on ${formatMonthCompact(overview.periodStart)}`
            : "Period start"
        }
      />

      <div className="metric-card rounded-2xl p-4 sm:col-span-2 sm:p-5 xl:col-span-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <QuoteBadge
            icon={<CurrencyDollarIcon aria-hidden="true" size={16} weight="duotone" />}
            label="USD this month"
            value={overview.usdRate === null ? "—" : formatBrl(overview.usdRate)}
          />
          <QuoteBadge
            icon={<CurrencyBtcIcon aria-hidden="true" size={16} weight="duotone" />}
            label="Bitcoin this month"
            value={overview.btcRate === null ? "—" : formatBrl(overview.btcRate)}
          />

          <QuoteBadge
            icon={<BankIcon aria-hidden="true" size={16} weight="duotone" />}
            label="Selic rate this month"
            value={formatSelic(selic)}
            detail={describeSelic(selic)}
            testId="selic-month"
          />
          <QuoteBadge label="Positions" value={overview.positionCount.toLocaleString("en-GB")} />
          <QuoteBadge label="Institutions" value={overview.institutionCount.toLocaleString("en-GB")} />
        </div>
      </div>
    </section>
  );
}

function QuoteBadge({
  icon,
  label,
  value,
  detail,
  testId,
}: {
  icon?: ReactNode;
  label: string;
  value: string;

  detail?: string;
  testId?: string;
}) {
  return (
    <div className="flex items-center gap-2.5" title={detail} data-testid={testId}>
      {icon ? (
        <span className="grid size-8 place-items-center rounded-lg bg-primary/8 text-primary">
          {icon}
        </span>
      ) : null}
      <div>
        <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">{englishLabel(label)}</p>
        <p className="mt-0.5 font-mono text-sm text-foreground">{value}</p>
        {detail ? <p className="sr-only">{detail}</p> : null}
      </div>
    </div>
  );
}
