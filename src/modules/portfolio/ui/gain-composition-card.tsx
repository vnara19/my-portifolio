import { KpiCard } from "@/components/product/kpi-card";
import type { GainComposition } from "../domain/portfolio-gains";
import { formatCurrency, formatPercent } from "../presentation/portfolio-format";

const points = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero",
});

export function GainCompositionCard({ composition }: { composition: GainComposition | null }) {
  if (!composition) return (
    <section className="premium-panel mt-6 rounded-2xl p-4 sm:p-5" aria-label="Composição do Ganho">
      <h2 className="text-base font-semibold">Composição do Ganho</h2>
      <p className="mt-2 text-sm text-muted-foreground">Purchase, exchange rate or valuation details are incomplete.</p>
    </section>
  );

  const { totalUsd, percent, costUsd, priceUsd, fxUsd, adjustmentUsd, historicalReferences } = composition;
  const components = [
    { label: "Valorização do ativo", value: priceUsd, color: "bg-primary" },
    { label: "Efeito cambial", value: fxUsd, color: "bg-chart-2" },
    { label: "Custos e ajustes", value: adjustmentUsd, color: "bg-muted-foreground" },
  ];
  const positive = components.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  const negative = components.reduce((sum, part) => sum + Math.max(0, -part.value), 0);
  const divergent = positive > 0.005 && negative > 0.005;
  const scale = divergent ? Math.max(positive, negative) * 2 : positive + negative;
  const renderSegments = (sign: number) => components.filter(part => part.value * sign > 0).map(part => (
    <span key={part.label} className={part.color} style={{ width: `${100 * Math.abs(part.value) / scale}%` }} />
  ));

  return (
    <section className="mt-6" aria-label="Composição do Ganho" data-testid="gain-composition">
      <KpiCard
        label="Composição do Ganho"
        tone={totalUsd > 0 ? "up" : totalUsd < 0 ? "down" : "neutral"}
        value={<span className="flex flex-wrap items-baseline gap-x-3">{formatCurrency(totalUsd, "USD", true)}{percent !== null && <span className="text-sm">{formatPercent(percent)}</span>}</span>}
        detail={<>
          <p>Unrealized gain · Remaining cost {formatCurrency(costUsd, "USD")}</p>
          {percent === null && <p className="mt-1">Percentage unavailable without a positive cost basis.</p>}
          {scale > 0.005 && <div className="relative mt-4 flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {divergent ? <>
              <div className="absolute inset-0 flex flex-row-reverse pr-[50%]">{renderSegments(-1)}</div>
              <div className="absolute inset-0 flex pl-[50%]">{renderSegments(1)}</div>
              <span className="absolute inset-y-0 left-1/2 w-px bg-foreground" />
            </> : renderSegments(negative > positive ? -1 : 1)}
          </div>}
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            {components.map(part => (
              <div key={part.label} className="min-w-0">
                <dt className="flex items-center gap-1.5"><span aria-hidden="true" className={`size-2 rounded-full ${part.color}`} />{part.label}</dt>
                <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 font-mono">
                  <span className={part.value >= 0.005 ? "text-primary" : part.value <= -0.005 ? "text-destructive" : "text-foreground"}>{formatCurrency(Math.abs(part.value) < 0.005 ? 0 : part.value, "USD", true)}</span>
                  {costUsd > 0 && <span>{points.format(part.value / costUsd * 100)} p.p.</span>}
                </dd>
              </div>
            ))}
          </dl>
          {historicalReferences.length > 0 && <details className="mt-4">
            <summary className="cursor-pointer">Historical reference FX</summary>
            <ul className="mt-2 grid max-h-32 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
              {historicalReferences.map(reference => <li key={`${reference.provider}:${reference.day}`}>{reference.day} · {reference.provider}</li>)}
            </ul>
          </details>}
        </>}
      />
    </section>
  );
}
