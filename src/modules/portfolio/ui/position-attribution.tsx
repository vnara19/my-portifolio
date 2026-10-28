"use client";
import { usePositionMoney } from "./position-money-context";

import { englishLabel } from "@/lib/english-labels";

import { useState } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/utils";
import type { PositionSummary } from "@/modules/portfolio/domain/position-history";

import { monthLabel } from "@/modules/portfolio/presentation/position-page";
import { useTouchTooltip } from "@/modules/portfolio/ui/use-touch-tooltip";

type Mode = "since-entry" | "month";
type Tone = "total" | "price" | "flow" | "change" | "neutral";

type WaterfallBar = {
  key: string;
  label: string;
  description: string;
  value: number;
  range: [number, number];
  tone: Tone;
  signed: boolean;
};


// (spec 038).
const FLOW_COLOR = "#cc79a7";


export function PositionAttribution({ summary, quoted }: { summary: PositionSummary; quoted: boolean }) {
 const { formatBrl, formatSignedBrl } = usePositionMoney();

  const [mode, setMode] = useState<Mode>("since-entry");
  const touch = useTouchTooltip();
  const bars = mode === "since-entry" ? sinceEntryBars(summary, quoted) : monthBars(summary, quoted);
  const emptyText =
    mode === "month"
      ? monthEmptyText(summary)
      : summary.startValueBrl === null
        ? "The position did not exist in this reporting month."
        : "The position has only one reporting month so far.";

  return (
    <section className="premium-panel @container rounded-[24px] p-5 sm:p-7" aria-labelledby="attribution-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="attribution-title" className="text-base font-semibold tracking-[-0.025em]">Sources of Change
        </h2>
        <div role="group" aria-label="Attribution period" className="flex items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
          {(
            [
              { key: "since-entry", label: summary.firstMonth ? `Since ${monthLabel(summary.firstMonth)}` : "Since opening" },
              { key: "month", label: "This month" },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={mode === option.key}
              onClick={() => setMode(option.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                mode === option.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {englishLabel(option.label)}
            </button>
          ))}
        </div>
      </div>

      {bars === null ? (
        <div className="mt-6 grid h-[200px] place-items-center rounded-xl border border-dashed border-border/70 px-6 text-center text-[11px] text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 @3xl:grid-cols-[minmax(0,1.3fr)_minmax(220px,1fr)] @3xl:items-center">
          <div className="w-full overflow-x-auto" data-testid="attribution-chart">
            <div className="h-[220px]" style={{ minWidth: bars.length > 5 ? 560 : undefined }} {...touch.containerProps}>
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={bars} margin={{ top: 22, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
                <XAxis
                  axisLine={false}
                  dataKey="label"
                  interval={0}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  domain={[(min: number) => Math.min(0, min), "auto"]}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickFormatter={(value: number) => formatBrl(value, { compact: true })}
                  tickLine={false}
                  width={62}
                />
                <Tooltip
                  cursor={{ fill: "oklch(1 0 0 / 0.04)" }}
                  content={({ active, payload }) => {
                    const bar = payload?.[0]?.payload as WaterfallBar | undefined;

                    if (!active || !bar) {
                      return null;
                    }

                    return (
                      <div className="max-w-[240px] rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
                        <p className="text-[11px] font-medium text-foreground">{bar.description}</p>
                        <p className="mt-1 font-mono text-xs text-foreground">
                          {bar.signed ? formatSignedBrl(bar.value) : formatBrl(bar.value)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="range" radius={[4, 4, 4, 4]} maxBarSize={56} isAnimationActive={false}>
                  {bars.map((bar) => (
                    <Cell key={bar.key} fill={barColor(bar)} fillOpacity={bar.tone === "total" ? 0.42 : 0.9} />
                  ))}

                  <LabelList
                    dataKey="key"
                    content={(props) => {
                      const bar = bars.find((entry) => entry.key === props.value);
                      const box = props.viewBox;

                      if (!bar || !box || !("width" in box)) {
                        return null;
                      }

                      const x = Number(box.x ?? 0) + Number(box.width ?? 0) / 2;
                      const top = Math.min(Number(box.y ?? 0), Number(box.y ?? 0) + Number(box.height ?? 0));

                      return (
                        <text
                          x={x}
                          y={top - 6}
                          className="font-mono"
                          fill="var(--foreground)"
                          fillOpacity={0.8}
                          fontSize={10}
                          textAnchor="middle"
                        >
                          {compactValue(bar)}
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>

          <dl className="space-y-2.5" data-testid="attribution-values">
            {bars.map((bar) => (
              <div key={bar.key} className="flex items-center gap-2.5">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: barColor(bar), opacity: bar.tone === "total" ? 0.6 : 1 }} />
                <dt className="text-xs text-foreground/80">{bar.description}</dt>
                <dd
                  className={cn(
                    "ml-auto shrink-0 font-mono text-xs",
                    bar.tone !== "neutral" && bar.signed && bar.value > 0
                      ? "text-primary"
                      : bar.tone !== "neutral" && bar.signed && bar.value < 0
                        ? "text-destructive"
                        : "text-foreground",
                  )}
                >
                  {bar.signed ? formatSignedBrl(bar.value) : formatBrl(bar.value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

    </section>
  );
}

function sinceEntryBars(summary: PositionSummary, quoted: boolean): WaterfallBar[] | null {
  const start = summary.startValueBrl;
  const end = summary.endValueBrl;

  if (start === null || end === null || !summary.firstMonth || (summary.stepCount === 0 && summary.segments <= 1 && summary.state === "present")) {
    return null;
  }

  const endLabel = monthLabel(summary.selectedMonth);
  const startLabel = monthLabel(summary.firstMonth);

  if (summary.attributionSource && summary.attributionSource !== "estimated") {
    return recordedBars(start, end, startLabel, endLabel, summary.priceGainBrl ?? 0, summary.flowsBrl ?? 0,
      summary.capitalizedIncomeBrl ?? 0, summary.internalBrl ?? 0, summary.openingBrl ?? 0, summary.unexplainedBrl ?? 0);
  }

  if (quoted && summary.priceGainBrl !== null && summary.flowsBrl !== null) {
    return cascade([
      { key: "start", label: startLabel, description: `Opened in ${startLabel}`, value: start, tone: "total" },
      { key: "price", label: "Price", description: "Price gain", value: summary.priceGainBrl, tone: "price" },
      { key: "flow", label: "Contributions", description: "Contributions and redemptions", value: summary.flowsBrl, tone: "flow" },
      { key: "end", label: endLabel, description: `Value in ${endLabel}`, value: end, tone: "total" },
    ]);
  }

  return cascade([
    { key: "start", label: startLabel, description: `Opened in ${startLabel}`, value: start, tone: "total" },
    { key: "change", label: "Change", description: "Balance change", value: end - start, tone: "change" },
    { key: "end", label: endLabel, description: `Value in ${endLabel}`, value: end, tone: "total" },
  ]);
}

function monthBars(summary: PositionSummary, quoted: boolean): WaterfallBar[] | null {
  const step = summary.monthStep;
  const current = summary.current;

  if (!step || !current) {
    return null;
  }

  const fromLabel = monthLabel(step.fromMonth);
  const toLabel = monthLabel(step.month);
  const start = current.valueBrl - step.changeBrl;

  if (step.source && step.source !== "estimated") {
    return recordedBars(start, current.valueBrl, step.fromMonth === step.month ? "Opening" : fromLabel, toLabel,
      step.priceEffectBrl ?? 0, step.flowBrl ?? 0, step.capitalizedIncomeBrl ?? 0,
      step.internalBrl ?? 0, step.openingBrl ?? 0, step.unexplainedBrl ?? 0);
  }

  if (quoted && step.priceEffectBrl !== null && step.flowBrl !== null) {
    return cascade([
      { key: "start", label: fromLabel, description: `Value in ${fromLabel}`, value: start, tone: "total" },
      { key: "price", label: "Price", description: "Price gain", value: step.priceEffectBrl, tone: "price" },
      { key: "flow", label: "Contributions", description: "Contributions and redemptions", value: step.flowBrl, tone: "flow" },
      { key: "end", label: toLabel, description: `Value in ${toLabel}`, value: current.valueBrl, tone: "total" },
    ]);
  }

  return cascade([
    { key: "start", label: fromLabel, description: `Value in ${fromLabel}`, value: start, tone: "total" },
    { key: "change", label: "Change", description: "Balance change", value: step.changeBrl, tone: "change" },
    { key: "end", label: toLabel, description: `Value in ${toLabel}`, value: current.valueBrl, tone: "total" },
  ]);
}

function recordedBars(start: number, end: number, startLabel: string, endLabel: string, price: number, flows: number, income: number, internal: number, opening: number, unexplained: number): WaterfallBar[] {


  if (Math.abs(unexplained) < 0.05) {
    if (price !== 0) price += unexplained;
    else income += unexplained;
    unexplained = 0;
  }
  const entries: Omit<WaterfallBar, "range" | "signed">[] = [
    { key: "start", label: startLabel, description: `Opening balance · ${startLabel}`, value: start, tone: "total" },
    { key: "flow", label: "Transactions", description: "Contributions minus withdrawals", value: flows, tone: "flow" },
    { key: "income", label: "Return", description: "Capitalized returns", value: income, tone: "change" },
    { key: "internal", label: "Transfer", description: "Internal transfers", value: internal, tone: "neutral" },
    { key: "opening", label: "Opening balance", description: "Recorded opening balance", value: opening, tone: "neutral" },
    { key: "price", label: "Price", description: "Price effect", value: price, tone: "price" },
    { key: "unexplained", label: "Not recorded", description: "Unrecorded change", value: unexplained, tone: "neutral" },
    { key: "end", label: endLabel, description: `Value in ${endLabel}`, value: end, tone: "total" },
  ];
  return cascade(entries.filter((entry) => entry.tone === "total" || Math.abs(entry.value) >= 0.005));
}

function cascade(entries: Omit<WaterfallBar, "range" | "signed">[]): WaterfallBar[] {
  let running = 0;

  return entries.map((entry) => {
    if (entry.tone === "total") {
      running = entry.value;
      return { ...entry, range: [0, entry.value], signed: false };
    }

    const from = running;
    running += entry.value;
    return { ...entry, range: [Math.min(from, running), Math.max(from, running)], signed: true };
  });
}

function monthEmptyText(summary: PositionSummary) {
  if (summary.state !== "present") {
    return "No position in this reporting month.";
  }

  if (!summary.previousMonth) {
    return "First reporting month in history.";
  }

  return `No position in ${monthLabel(summary.previousMonth)}: it was opened in this reporting month.`;
}

function barColor(bar: WaterfallBar) {
  if (bar.tone === "total" || bar.tone === "neutral") {
    return "var(--muted-foreground)";
  }

  if (bar.tone === "flow") {
    return FLOW_COLOR;
  }

  return bar.value >= 0 ? "var(--chart-up)" : "var(--chart-down)";
}


function compactValue(bar: WaterfallBar) {
  const formatted = new Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
    signDisplay: bar.signed ? "exceptZero" : "auto",
  }).format(bar.value);

  return formatted;
}
