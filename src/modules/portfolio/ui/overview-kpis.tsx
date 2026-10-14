"use client";

import NumberFlow from "@number-flow/react";
import { KpiCard } from "@/components/product/kpi-card";
import type { OverviewData } from "@/modules/portfolio/application/get-overview-data";
import { formatCurrency } from "@/modules/portfolio/presentation/portfolio-format";

const percent = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(value / 100);
const money = (value: number | null, signed = true) => value === null ? "—" : formatCurrency(value, "USD", signed);
const missingCost = "Requires a complete transaction history and historical USD exchange rates. Internal transfers require their original acquisition cost.";
const missingDay = "A complete previous-day valuation is not available.";
const missingDividends = "Dividend payments are not separately identified in the current transaction history.";
const missingPerformance = "Requires portfolio valuations at cash-flow dates to calculate a time-weighted return.";
const missingAnnualized = "Requires dated external cash flows to calculate annualized yield (XIRR).";

export function OverviewKpis({ overview }: { overview: OverviewData }) {
  const total = overview.reporting.total;
  const gains = overview.gains;
  return <section aria-label="Portfolio summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <KpiCard compact label="Portfolio value" testId="portfolio-total"
      valueText={money(total.USD, false)}
      value={total.USD === null ? "—" : <NumberFlow value={total.USD} format={{ style: "currency", currency: "USD", currencyDisplay: "code", maximumFractionDigits: 2 }} locales="en-GB" />}
      detail={<span className="flex flex-wrap gap-x-3 gap-y-1 font-mono">
        <span data-currency="EUR">{total.EUR === null ? "EUR —" : formatCurrency(total.EUR, "EUR")}</span>
        <span data-currency="BRL">{formatCurrency(total.BRL, "BRL")}</span>
      </span>} />
    <GainCard label="Unrealized gain" testId="unrealized-gain" value={gains.unrealizedUsd} percentage={gains.unrealizedPercent}
      detail={<span title={missingDay}>Last day <span className="font-mono">— USD · —%</span></span>} />
    <GainCard label="Realized gain" testId="realized-gain" value={gains.realizedUsd}
      detail={<span title={missingDividends}>Total dividends <span className="font-mono">— USD</span></span>} />
    <GainCard label="Total gain" testId="total-gain" value={gains.totalUsd} percentage={null} percentageExplanation={missingPerformance}
      detail={<span title={missingAnnualized}>Annualized yield <span className="font-mono">—%</span></span>} />
  </section>;
}

function GainCard({ label, testId, value, percentage, percentageExplanation = missingCost, detail }: {
  label: string; testId: string; value: number | null; percentage?: number | null; percentageExplanation?: string; detail: React.ReactNode;
}) {
  return <KpiCard compact label={label} testId={testId}
    tone={value === null || value === 0 ? "neutral" : value > 0 ? "up" : "down"}
    valueText={money(value)} valueClassName="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xl"
    value={<><span title={value === null ? missingCost : "USD average-cost result since the recorded opening balance; acquisition-date FX is included."}>{money(value)}</span>
      {percentage !== undefined ? <span className="text-sm" title={percentage === null ? percentageExplanation : "Unrealized gain divided by the remaining USD acquisition cost."}>{percent(percentage)}</span> : null}</>}
    detail={detail} />;
}
