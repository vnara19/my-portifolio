"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import { KpiCard } from "@/components/product/kpi-card";
import type { GainComposition } from "../domain/portfolio-gains";
import { formatCurrency, formatPercent } from "../presentation/portfolio-format";

const points = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero",
});

export function GainCompositionCard({ composition }: { composition: Omit<GainComposition, "historicalReferences"> | null }) {
  if (!composition) return (
    <section className="premium-panel mt-6 rounded-2xl p-4 sm:p-5" aria-label="Gain Breakdown">
      <h2 className="text-base font-semibold">Gain Breakdown</h2>
      <p className="mt-2 text-sm text-muted-foreground">Purchase, exchange rate or valuation details are incomplete.</p>
    </section>
  );

  const { totalUsd, percent, costUsd, priceUsd, fxUsd, adjustmentUsd } = composition;
  const components = [
    { label: "Asset Price Change", value: priceUsd, color: "bg-primary", explanation: "Change in the asset price measured at the purchase exchange rates." },
    { label: "Currency Impact", value: fxUsd, color: "bg-chart-up", explanation: "Gain or loss from exchange rate changes since purchase." },
    { label: "Fees and Adjustments", value: adjustmentUsd, color: "bg-muted-foreground", explanation: "Remaining purchase commissions and any other cost-basis adjustments." },
  ];
  const positive = components.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  const negative = components.reduce((sum, part) => sum + Math.max(0, -part.value), 0);
  const divergent = positive > 0.005 && negative > 0.005;
  const scale = positive + negative;
  const ordered = [...components.filter(part => part.value < 0).reverse(), ...components.filter(part => part.value > 0)];
  const contribution = (value: number) => `${points.format(value / costUsd * 100)} percentage points`;

  return (
    <section className="mt-6" aria-label="Gain Breakdown" data-testid="gain-composition">
      <KpiCard
        label="Gain Breakdown"
        tone={totalUsd > 0 ? "up" : totalUsd < 0 ? "down" : "neutral"}
        value={<span className="flex flex-wrap items-baseline gap-x-3">{formatCurrency(totalUsd, "USD", true)}{percent !== null && <span className="text-sm">{formatPercent(percent)}</span>}</span>}
        detail={<>
          <p>Unrealized gain · Remaining cost {formatCurrency(costUsd, "USD")}</p>
          {percent === null && <p className="mt-1">Percentage unavailable without a positive cost basis.</p>}
          {scale > 0.005 && (
            <Tooltip.Provider delay={120}>
              <div role="group" aria-label="Contributions to unrealized gain" className="mt-4">
                <div className="relative flex h-5 gap-px rounded-full">
                  {ordered.map((part, index) => (
                    <Tooltip.Root key={part.label}>
                      <Tooltip.Trigger
                        type="button"
                        aria-label={`${part.label} ${formatCurrency(part.value, "USD", true)}`}
                        className={`min-w-1 cursor-help hover:brightness-125 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${part.color} ${index === 0 ? "rounded-l-full" : ""} ${index === ordered.length - 1 ? "rounded-r-full" : ""}`}
                        style={{ flexGrow: Math.abs(part.value), flexBasis: 0 }}
                      />
                      <Tooltip.Portal>
                        <Tooltip.Positioner sideOffset={8} className="z-50">
                          <Tooltip.Popup className="max-w-64 rounded-xl border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
                            <p className="font-semibold">{part.label} <span className="font-mono">{formatCurrency(part.value, "USD", true)}</span></p>
                            <p className="mt-1 text-muted-foreground">{part.explanation}</p>
                          </Tooltip.Popup>
                        </Tooltip.Positioner>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  ))}
                </div>
                <div className="mt-1 flex justify-between gap-2 text-[11px]">
                  {negative > 0 && <span className="text-destructive">Losses</span>}
                  {positive > 0 && <span className="ml-auto text-primary">Gains</span>}
                  {divergent && <span className="sr-only">Losses are shown to the left of gains.</span>}
                </div>
              </div>
            </Tooltip.Provider>
          )}
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            {components.map(part => (
              <div key={part.label} className="min-w-0">
                <dt className="flex items-center gap-1.5"><span aria-hidden="true" className={`size-2 rounded-full ${part.color}`} />{part.label}</dt>
                <dd className="mt-1 space-y-1">
                  <span className={`block font-mono text-base ${part.value >= 0.005 ? "text-primary" : part.value <= -0.005 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(Math.abs(part.value) < 0.005 ? 0 : part.value, "USD", true)}</span>
                  {costUsd > 0 && <span className="block">{contribution(part.value)}</span>}
                </dd>
              </div>
            ))}
          </dl>
          {costUsd > 0 && <p className="mt-3">Each percentage-point contribution is measured against the remaining cost. Together they make up the unrealized return.</p>}
        </>}
      />
    </section>
  );
}
