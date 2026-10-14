"use client";

import { englishLabel } from "@/lib/english-labels";

import { motion, useReducedMotion, type Transition } from "motion/react";
import { useQueryState } from "nuqs";

import { cn } from "@/lib/utils";
import type { FixedIncomeDuration } from "@/modules/portfolio/domain/fixed-income-duration";
import type { AllocationGroup } from "@/modules/portfolio/domain/rebalance";
import { AllocationBars } from "@/modules/portfolio/ui/allocation-bars";

const SLICES = [
  { key: "classe", label: "Class", group: "ASSET_CLASS", chartTitle: "Asset class" },
  { key: "moeda", label: "Currency", group: "CURRENCY", chartTitle: "Currency" },
] as const;

const SPRING: Transition = { type: "spring", stiffness: 420, damping: 36 };


export function AllocationExplorer({
  groups,
}: {
  groups: AllocationGroup[];
  fixedIncomeDuration: FixedIncomeDuration;
}) {
  const [slice, setSlice] = useQueryState("sub", { defaultValue: "classe", clearOnDefault: true });
  const activeSlice = SLICES.find((entry) => entry.key === slice) ?? SLICES[0];
  const rows = (groups.find((entry) => entry.key === activeSlice.group)?.rows ?? []).filter((row) => row.currentShare > 0);
  const reduceMotion = useReducedMotion();

  return (
    <section id="alocacao" aria-label="Allocation" className="mt-6 scroll-mt-32 space-y-4">

      <div className="flex flex-col items-start gap-2">
        <div
          role="group"
          aria-label="View breakdown"
          className="flex max-w-full items-center gap-0.5 overflow-x-auto pl-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SLICES.map((entry) => {
            const active = entry.key === activeSlice.key;

            return (
              <button
                key={entry.key}
                type="button"
                aria-pressed={active}
                onClick={() => void setSlice(entry.key)}
                className={cn(
                  "relative h-7 shrink-0 rounded-md px-2.5 text-[11px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="allocation-slice"
                    className="absolute inset-0 rounded-md bg-white/[0.07] ring-1 ring-border"
                    transition={reduceMotion ? { duration: 0 } : SPRING}
                  />
                ) : null}
                <span className="relative z-10">{englishLabel(entry.label)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <AllocationBars title={activeSlice.chartTitle} rows={rows.map((row) => ({ label: row.label, currentShare: row.currentShare, targetShare: null }))} />

    </section>
  );
}
