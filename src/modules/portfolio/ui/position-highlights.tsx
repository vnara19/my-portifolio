"use client";
import { usePositionMoney } from "./position-money-context";

import { englishLabel } from "@/lib/english-labels";

import { Popover } from "@base-ui/react/popover";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
import { useQueryState } from "nuqs";
import { useTransition } from "react";

import { cn } from "@/lib/utils";
import type { PositionSummary, StepHighlight } from "@/modules/portfolio/domain/position-history";
import { formatPercent } from "@/modules/portfolio/presentation/portfolio-format";
import { monthLabel } from "@/modules/portfolio/presentation/position-page";


export function MonthHighlights({ summary, quoted }: { summary: PositionSummary; quoted: boolean }) {
 const { formatSignedBrl } = usePositionMoney();

  const [, startTransition] = useTransition();
  const [, setMonth] = useQueryState("mes", { shallow: false, startTransition });

  if (!summary.best || !summary.worst) {
    return null;
  }

  const rows = [
    { key: "best", label: "Best Month", step: summary.best, testId: "position-best-month" },
    { key: "worst", label: "Worst Month", step: summary.worst, testId: "position-worst-month" },
  ];

  return (
    <Popover.Root>
      <Popover.Trigger
        data-testid="position-highlights"
        className="group mt-3 -ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:text-foreground"
      >Best and Worst Month
        <CaretDownIcon
          aria-hidden="true"
          size={10}
          weight="bold"
          className="transition-transform duration-150 group-data-popup-open:rotate-180"
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={12} className="z-[60] outline-none">
          <Popover.Popup
            aria-label="Best and Worst Month"
            className="w-[min(17rem,calc(100vw-1.5rem))] origin-[var(--transform-origin)] rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0"
          >
            {rows.map((row) => {
              const value = metric(row.step, quoted);
              const percent = quoted && row.step.pricePercent !== null ? row.step.pricePercent : row.step.changePercent;

              return (
                <button
                  key={row.key}
                  type="button"
                  data-testid={row.testId}
                  onClick={() => void setMonth(row.step.month)}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05]"
                >
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                      {englishLabel(row.label)}
                    </span>
                    <span className="mt-0.5 block text-xs text-foreground/90">{monthLabel(row.step.month)}</span>
                  </span>
                  <span className="ml-auto shrink-0 text-right">
                    <span className={cn("block font-mono text-xs", value >= 0 ? "text-primary" : "text-destructive")}>
                      {formatSignedBrl(value)}
                    </span>
                    {percent !== null ? (
                      <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">{formatPercent(percent)}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}


function metric(step: StepHighlight, quoted: boolean) {
  if (step.source && step.source !== "estimated") {
    return (step.priceEffectBrl ?? 0) + (step.incomeBrl ?? 0);
  }

  return quoted && step.priceEffectBrl !== null ? step.priceEffectBrl : step.changeBrl;
}
