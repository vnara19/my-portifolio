
import { englishLabel } from "@/lib/english-labels";
import type { Icon } from "@phosphor-icons/react/dist/lib/types";
import type { ReactNode } from "react";

import { KpiCard } from "@/components/product/kpi-card";
import { formatCents, type Cents } from "@/lib/money";
import { cn } from "@/lib/utils";


export type Tone = "saved" | "spent" | "neutral";


export const TONES: Record<Tone, { dot: string; chip: string; tint: string; rule: string; text: string }> = {
  saved: {
    dot: "bg-chart-saved",
    chip: "bg-primary/10 text-primary",
    tint: "bg-chart-saved/[0.05]",
    rule: "border-chart-saved/45",
    text: "text-chart-saved",
  },
  spent: {
    dot: "bg-chart-spent",
    chip: "bg-chart-spent/10 text-chart-spent",
    tint: "bg-chart-spent/[0.055]",
    rule: "border-chart-spent/45",
    text: "text-chart-spent",
  },
  neutral: {
    dot: "bg-muted-foreground/60",
    chip: "bg-white/[0.06] text-muted-foreground",
    tint: "bg-white/[0.025]",
    rule: "border-border",
    text: "text-muted-foreground",
  },
};


export function RateBar({
  rate,
  label = "Savings rate",
  className,
}: {
  rate: number;

  label?: string;
  className?: string;
}) {
  const width = Math.min(Math.max(rate, 0), 100);

  return (
    <span
      role="meter"
      aria-label={englishLabel(label)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={width}
      className={cn("block shrink-0 overflow-hidden rounded-full bg-white/[0.07]", className)}
    >
      <span
        className={cn("block h-full rounded-full", rate < 0 ? "bg-chart-spent" : "bg-gradient-to-r from-chart-saved/70 to-chart-saved")}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}


export function SummaryCard({
  tone,
  icon: IconComponent,
  label,
  cents,
  detail,
  valueClassName,
  signed = false,
  emphasis = false,
  testId,
  children,
}: {
  tone: Tone;
  icon: Icon;
  label: string;
  cents: Cents;
  detail: string;
  valueClassName?: string;
  signed?: boolean;
  emphasis?: boolean;
  testId: string;
  children?: ReactNode;
}) {
  return (
    <KpiCard
      dense
      tone={tone === "spent" ? "spent" : "neutral"}
      icon={<IconComponent aria-hidden="true" size={18} weight="duotone" />}
      label={englishLabel(label)}
      value={formatCents(cents, { signed })}
      valueClassName={valueClassName ?? "text-foreground"}
      valueData={{ "data-cents": cents }}
      detail={detail}
      emphasis={emphasis}
      testId={testId}
      footer={children}
    />
  );
}
