
import { englishLabel } from "@/lib/english-labels";
import { cn } from "@/lib/utils";
import type { AllocationRow } from "@/modules/portfolio/domain/rebalance";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import { formatBrl, formatSharePercent } from "@/modules/portfolio/presentation/portfolio-format";


const WIDE = "hidden sm:table-cell";

export function RebalancePanel({ rows }: { rows: AllocationRow[] }) {
  const toSell = rows
    .filter((row) => row.direction === "SELL")
    .sort((left, right) => Math.abs(right.differenceBrl ?? 0) - Math.abs(left.differenceBrl ?? 0));
  const toBuy = rows
    .filter((row) => row.direction === "BUY")
    .sort((left, right) => Math.abs(right.differenceBrl ?? 0) - Math.abs(left.differenceBrl ?? 0));
  const balanced = rows.filter((row) => row.direction === "BALANCED" || row.direction === null);
  const maxDifference = Math.max(
    ...rows.map((row) => Math.abs(row.differenceBrl ?? 0)),
    1,
  );

  return (
    <section
      id="rebalanceamento"
      className="premium-panel scroll-mt-32 rounded-[24px] p-5 sm:p-7"
      aria-labelledby="rebalance-title"
    >
      <h2 id="rebalance-title" className="text-base font-semibold tracking-[-0.025em]">Buy and sell
      </h2>


      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left sm:min-w-[640px]">
          <thead>
            <tr className="border-b border-border/60 text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
              <th className="py-3 pr-3">Item</th>
              <th className={cn("py-3 pr-3 text-right", WIDE)}>Current %</th>
              <th className={cn("py-3 pr-3 text-right", WIDE)}>Target %</th>
              <th className={cn("py-3 pr-3 text-right", WIDE)}>Current BRL</th>
              <th className={cn("py-3 pr-3 text-right", WIDE)}>Target BRL</th>
              <th className="py-3 text-right">Difference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/55">
            {toBuy.length > 0 ? (
              <ActionHeader label="Buy" tone="buy" count={toBuy.length} />
            ) : null}
            {toBuy.map((row) => (
              <RebalanceRow key={row.key} row={row} maxDifference={maxDifference} />
            ))}

            {toSell.length > 0 ? (
              <ActionHeader label="Sell" tone="sell" count={toSell.length} />
            ) : null}
            {toSell.map((row) => (
              <RebalanceRow key={row.key} row={row} maxDifference={maxDifference} />
            ))}

            {balanced.length > 0 ? (
              <ActionHeader label="Balanced" tone="balanced" count={balanced.length} />
            ) : null}
            {balanced.map((row) => (
              <RebalanceRow key={row.key} row={row} maxDifference={maxDifference} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ActionHeader({
  label,
  tone,
  count,
}: {
  label: string;
  tone: "buy" | "sell" | "balanced";
  count: number;
}) {
  return (
    <tr>
      <td colSpan={6} className="pt-5 pb-2">
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase",
            tone === "sell"
              ? "bg-destructive/10 text-destructive"
              : tone === "buy"
                ? "bg-primary/10 text-primary"
                : "bg-white/[0.05] text-muted-foreground",
          )}
        >
          {englishLabel(label)} · {count}
        </span>
      </td>
    </tr>
  );
}

function RebalanceRow({ row, maxDifference }: { row: AllocationRow; maxDifference: number }) {
  const difference = row.differenceBrl ?? 0;
  const width = Math.min((Math.abs(difference) / maxDifference) * 50, 50);

  return (
    <tr className="transition-colors duration-150 hover:bg-white/[0.018]">
      <td className="py-3 pr-3">
        <div className="flex items-center gap-2.5">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor(row.label.split(" · ").at(-1) ?? row.label) }}
          />
          <span className="text-xs text-foreground/90">{englishLabel(row.label)}</span>
        </div>
      </td>
      <td className={cn("py-3 pr-3 text-right font-mono text-[11px] text-foreground/80", WIDE)}>
        {formatSharePercent(row.currentShare)}
      </td>
      <td className={cn("py-3 pr-3 text-right font-mono text-[11px] text-muted-foreground", WIDE)}>
        {row.targetShare === null ? "—" : formatSharePercent(row.targetShare)}
      </td>
      <td className={cn("py-3 pr-3 text-right font-mono text-[11px] text-foreground/80", WIDE)}>
        {formatBrl(row.currentBrl)}
      </td>
      <td className={cn("py-3 pr-3 text-right font-mono text-[11px] text-muted-foreground", WIDE)}>
        {row.targetBrl === null ? "—" : formatBrl(row.targetBrl)}
      </td>
      <td className="py-3">
        <div className="flex items-center justify-end gap-3">
          <div aria-hidden="true" className="relative hidden h-1.5 w-28 sm:block">
            <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
            {row.differenceBrl === null ? null : (
              <span
                className={cn(
                  "absolute inset-y-0 rounded-full",
                  difference > 0 ? "left-1/2 bg-primary/70" : "right-1/2 bg-destructive/70",
                )}
                style={{ width: `${width}%` }}
              />
            )}
          </div>
          <span
            className={cn(
              "w-28 shrink-0 text-right font-mono text-[11px]",


              row.direction === "SELL"
                ? "text-primary"
                : row.direction === "BUY"
                  ? "text-destructive"
                  : "text-muted-foreground",
            )}
          >
            {row.differenceBrl === null ? "no target" : formatBrl(difference)}
          </span>
        </div>
      </td>
    </tr>
  );
}
