
import { englishLabel } from "@/lib/english-labels";
import type { OverviewData } from "@/modules/portfolio/application/get-overview-data";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import { formatCurrency, formatSharePercent } from "@/modules/portfolio/presentation/portfolio-format";


export function AssetTypeBreakdown({ rows }: { rows: OverviewData["byType"] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="premium-panel rounded-[24px] p-5 sm:p-6" aria-labelledby="asset-type-title" data-testid="asset-type-breakdown">
      <h2 id="asset-type-title" className="text-base font-semibold tracking-[-0.025em]">Asset Type
      </h2>

      <div className="mt-5 flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.04]" aria-hidden="true">
        {rows.map((row) => (
          <span
            key={row.label}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${row.share}%`, backgroundColor: categoryColor(row.label) }}
          />
        ))}
      </div>

      <ul className="mt-5 grid gap-x-8 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <li key={row.label} className="flex min-w-0 items-center gap-2.5">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(row.label) }} />
            <span className="truncate text-xs text-foreground/80">{englishLabel(row.label)}</span>
            <span className="ml-auto shrink-0 text-right font-mono text-[11px] text-muted-foreground">
              <span className="text-foreground">{formatSharePercent(row.share)}</span>
              <span className="hidden text-muted-foreground/70 sm:inline"> · {row.valueUsd == null ? "USD —" : formatCurrency(row.valueUsd, "USD")}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
