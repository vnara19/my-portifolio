
/** Shared metric card: label on the left, optional icon on the right, value and detail below. Tone conveys meaning; neutral values use foreground. */

import { englishLabel } from "@/lib/english-labels";
import type { ReactNode } from "react";
import { tv } from "tailwind-variants";


// The shared metric-card class owns hover styling.


//


export type KpiTone = "up" | "down" | "spent" | "neutral";

const kpiCard = tv({
  slots: {
    root: "metric-card rounded-2xl p-4 sm:p-5",
    label: "text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase",
    chip: "grid size-8 shrink-0 place-items-center rounded-lg ring-1",
    value: "mt-5 font-mono font-medium",
    detail: "mt-1.5 text-xs text-muted-foreground",
  },
  variants: {
    tone: {
      up: { chip: "bg-primary/8 text-primary ring-primary/10", value: "text-primary" },
      neutral: { chip: "bg-primary/8 text-primary ring-primary/10", value: "text-foreground" },
      down: { chip: "bg-destructive/10 text-destructive ring-destructive/15", value: "text-destructive" },
      spent: { chip: "bg-chart-spent/10 text-chart-spent ring-chart-spent/15", value: "text-chart-spent" },
    },

    dense: {
      true: { value: "text-xl tracking-[-0.05em] min-[360px]:text-[15px] min-[400px]:text-base sm:text-xl xl:text-2xl xl:tracking-[-0.04em]" },
      false: { value: "text-2xl tracking-[-0.04em]" },
    },
    compact: { true: { root: "p-4 sm:p-4", value: "mt-3" }, false: {} },
    emphasis: { true: {}, false: {} },
  },
  compoundVariants: [
    { emphasis: true, tone: ["up", "neutral"], class: { root: "border-primary/25" } },
    { emphasis: true, tone: "down", class: { root: "border-destructive/30" } },
    { emphasis: true, tone: "spent", class: { root: "border-chart-spent/35" } },
  ],
  defaultVariants: { tone: "neutral", dense: false, emphasis: false },
});

export function KpiCard({
  label,
  icon,
  value,
  detail,
  tone = "neutral",
  testId,
  valueText,
  valueData,
  valueClassName,
  dense = false,
  compact = false,
  emphasis = false,
  footer,
}: {
  label: string;

  icon?: ReactNode;
  value: ReactNode;
  detail: ReactNode;
  tone?: KpiTone;
  testId?: string;

  valueText?: string;

  valueData?: Record<`data-${string}`, string | number | undefined>;

  valueClassName?: string;

  dense?: boolean;
  compact?: boolean;

  emphasis?: boolean;

  footer?: ReactNode;
}) {
  const slots = kpiCard({ tone, dense, emphasis, compact });

  return (
    <article className={slots.root()}>
      <div className="flex items-start justify-between gap-4">
        <p className={slots.label()}>{englishLabel(label)}</p>
        {icon ? <span className={slots.chip()}>{icon}</span> : null}
      </div>
      <p data-testid={testId} data-value={valueText} {...valueData} className={slots.value({ class: valueClassName })}>
        {value}
      </p>
      <p className={slots.detail()}>{detail}</p>
      {footer}
    </article>
  );
}
