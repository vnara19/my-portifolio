"use client";

import NumberFlow from "@number-flow/react";
import { ArrowDownRightIcon, ArrowUpRightIcon, BankIcon, CurrencyBtcIcon, CurrencyDollarIcon, CurrencyEurIcon, TrendUpIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

import { KpiCard } from "@/components/product/kpi-card";
import type { OverviewData } from "@/modules/portfolio/application/get-overview-data";
import type { ReportingAmounts, ReportingChange } from "@/modules/portfolio/domain/reporting-currency";
import { formatBrl, formatCurrency, formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import type { SelicMonthView } from "@/modules/quotes/application/selic-reference";
import { describeSelic, formatSelic } from "@/modules/quotes/presentation/selic-format";

export function OverviewKpis({ overview, selic }: { overview: OverviewData; selic: SelicMonthView | null }) {
  const total = overview.reporting.total;
  const btcUsd = overview.btcRate !== null && overview.usdRate !== null && overview.usdRate > 0
    ? overview.btcRate / overview.usdRate : null;
  return (
    <section aria-label="Reporting month metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Total portfolio value"
        testId="portfolio-total"
        icon={<TrendUpIcon aria-hidden="true" size={18} weight="duotone" />}
        valueText={total.USD === null ? "—" : formatCurrency(total.USD, "USD", false, 0)}
        value={total.USD === null ? <span className="text-muted-foreground">—</span> : (
          <NumberFlow value={total.USD} format={{ style: "currency", currency: "USD", currencyDisplay: "code", maximumFractionDigits: 0 }} locales="en-GB" />
        )}
        detail={<>
          <CurrencyAmounts amounts={total} currencies={["EUR", "BRL"]} />
          {total.USD === null ? <span className="mt-1 block">USD exchange rate unavailable</span> : null}
        </>}
      />
      <ReportingChangeCard label="Monthly change" testId="month-change" change={overview.reporting.monthly}
        emptyDetail={overview.previousMonth === null ? "First reporting month in history" : `Insufficient history: no ${formatMonthCompact(overview.previousMonth)}`} />
      <ReportingChangeCard label="12-month change" testId="year-change" change={overview.reporting.annual}
        suffix={`since ${formatMonthCompact(overview.yearAgoMonth)}`}
        emptyDetail={overview.yearAgoMissing ? `Insufficient history: no ${formatMonthCompact(overview.yearAgoMonth)}` : "Insufficient history"} />
      <ReportingChangeCard label="All-time change" testId="period-change" change={overview.reporting.allTime}
        suffix={`since ${formatMonthCompact(overview.periodStart)}`}
        emptyDetail={overview.beforePeriodStart ? `The period starts on ${formatMonthCompact(overview.periodStart)}` : "Period start"} />
      <div className="metric-card rounded-2xl p-4 sm:col-span-2 sm:p-5 xl:col-span-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <QuoteBadge icon={<CurrencyDollarIcon aria-hidden="true" size={16} weight="duotone" />} label="USD / BRL this month"
            value={overview.usdRate === null ? "—" : `1 USD = ${formatBrl(overview.usdRate)}`} />
          <QuoteBadge icon={<CurrencyEurIcon aria-hidden="true" size={16} weight="duotone" />} label="BRL / EUR this month" testId="eur-month"
            value={overview.eurRate === null || overview.eurRate <= 0 ? "—" : `1 BRL = ${formatCurrency(1 / overview.eurRate, "EUR", false, 4)}`}
            detail={overview.eurRate === null ? "EUR exchange rate unavailable" : `1 EUR = ${formatBrl(overview.eurRate)}`} />
          <QuoteBadge icon={<CurrencyBtcIcon aria-hidden="true" size={16} weight="duotone" />} label="Bitcoin (USD) this month" testId="btc-usd-month"
            value={btcUsd === null ? "—" : formatCurrency(btcUsd, "USD")}
            detail="Converted using this month's BTC/BRL and USD/BRL quotes." />
          <QuoteBadge icon={<BankIcon aria-hidden="true" size={16} weight="duotone" />} label="Selic rate this month"
            value={formatSelic(selic)} detail={describeSelic(selic)} testId="selic-month" />
          <QuoteBadge label="Positions" value={overview.positionCount.toLocaleString("en-GB")} />
          <QuoteBadge label="Institutions" value={overview.institutionCount.toLocaleString("en-GB")} />
        </div>
      </div>
    </section>
  );
}

function CurrencyAmounts({ amounts, currencies = ["USD", "EUR", "BRL"], signed = false }: {
  amounts: ReportingAmounts; currencies?: (keyof ReportingAmounts)[]; signed?: boolean;
}) {
  return <span className="block space-y-0.5 font-mono">
    {currencies.map((currency) => <span key={currency} className="block" data-currency={currency}>
      {amounts[currency] === null ? `${currency} —` : formatCurrency(amounts[currency]!, currency, signed)}
    </span>)}
  </span>;
}

function ReportingChangeCard({ label, testId, change, emptyDetail, suffix }: {
  label: string; testId: string; change: ReportingChange; emptyDetail: string; suffix?: string;
}) {
  const usd = change.amounts?.USD ?? null;
  const percent = change.percentUsd;
  return <KpiCard label={label} testId={testId}
    icon={usd === null || usd >= 0 ? <ArrowUpRightIcon aria-hidden="true" size={18} weight="bold" /> : <ArrowDownRightIcon aria-hidden="true" size={18} weight="bold" />}
    tone={usd === null ? "neutral" : usd >= 0 ? "up" : "down"}
    valueText={percent === null ? "—" : new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(percent / 100)}
    value={percent === null ? <span className="text-muted-foreground">—</span> : <NumberFlow value={percent / 100} format={{ style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" }} locales="en-GB" />}
    detail={change.amounts === null ? emptyDetail : <span title="USD percentage includes cash flows and exchange-rate changes. Each amount compares balances using that period's exchange rate.">
      <CurrencyAmounts amounts={change.amounts} signed />
      {percent === null ? <span className="mt-1 block">USD percentage unavailable</span> : null}
      {suffix ? <span className="mt-1 block">{suffix}</span> : null}
    </span>} />;
}

function QuoteBadge({ icon, label, value, detail, testId }: { icon?: ReactNode; label: string; value: string; detail?: string; testId?: string }) {
  return <div className="flex items-center gap-2.5" title={detail} data-testid={testId}>
    {icon ? <span className="grid size-8 place-items-center rounded-lg bg-primary/8 text-primary">{icon}</span> : null}
    <div>
      <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 font-mono text-sm text-foreground">{value}</p>
      {detail ? <span className="sr-only">{detail}</span> : null}
    </div>
  </div>;
}
