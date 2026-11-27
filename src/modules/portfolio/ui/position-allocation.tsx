
import { englishLabel } from "@/lib/english-labels";
import type { PresentSlot } from "@/modules/portfolio/domain/position-history";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import { formatBrl, formatSharePercent } from "@/modules/portfolio/presentation/portfolio-format";


export function PositionAllocation({
  slot,
  selectedMonth,
  classTotals,
}: {
  slot: PresentSlot | null;
  selectedMonth: string;
  classTotals: Record<string, number>;
}) {
  const sameMonth = slot?.month === selectedMonth;

  return (
    <section className="premium-panel mt-6 rounded-[24px] p-5 sm:p-6" aria-labelledby="allocation-title">
      <h2 id="allocation-title" className="text-base font-semibold tracking-[-0.025em]">Allocation
      </h2>

      {!slot || slot.allocations.length === 0 ? (
        <div className="mt-5 grid h-[120px] place-items-center rounded-xl border border-dashed border-border/70 text-[11px] text-muted-foreground">Position without an allocation
        </div>
      ) : (
        <>
          <div aria-hidden="true" className="mt-5 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
            {slot.allocations.map((slice) => (
              <span
                key={`${englishLabel(slice.assetClass)}-${englishLabel(slice.subclass)}-${englishLabel(slice.duration)}`}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${slice.weight}%`, backgroundColor: categoryColor(slice.assetClass) }}
              />
            ))}
          </div>

          <ul className="mt-5 grid gap-x-8 gap-y-3.5 sm:grid-cols-2 xl:grid-cols-3" data-testid="position-allocation">
            {slot.allocations.map((slice) => {
              const classTotal = classTotals[slice.assetClass];
              const classShare = sameMonth && classTotal ? (slice.valueBrl / classTotal) * 100 : null;

              return (
                <li key={`${englishLabel(slice.assetClass)}-${englishLabel(slice.subclass)}-${englishLabel(slice.duration)}`} className="flex items-start gap-2.5">
                  <span
                    className="mt-1 size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryColor(slice.assetClass) }}
                  />
                  <div className="min-w-0">
                    <p className="text-xs text-foreground/90">{englishLabel(slice.assetClass)}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {[slice.subclass, slice.duration].filter((part) => part && part !== "-").join(" · ") || "No subclass"}
                    </p>
                  </div>
                  <div className="ml-auto shrink-0 text-right">
                    <p className="font-mono text-xs text-foreground">{formatSharePercent(slice.weight)}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{formatBrl(slice.valueBrl)}</p>
                    {classShare !== null ? (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {formatSharePercent(classShare)} of {englishLabel(slice.assetClass)}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
