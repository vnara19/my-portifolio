"use client";

import { englishLabel } from "@/lib/english-labels";

import { useQueryState } from "nuqs";
import { useMemo, useState, useTransition } from "react";
import {
  Bar,
  BarChart,
  Brush,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import type { OverviewHistoryPoint } from "@/modules/portfolio/application/get-overview-data";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import { formatCurrency, formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { useTouchTooltip } from "@/modules/portfolio/ui/use-touch-tooltip";

type StackMode = "total" | "class" | "currency";

type ChartRow = {
  month: string;
  label: string;
  total: number | null;
} & Record<string, number | string | null>;

const STACK_MODES: { key: StackMode; label: string }[] = [
  { key: "total", label: "Total" },
  { key: "class", label: "Class" },
  { key: "currency", label: "Currency" },
];

const PRESETS: { key: string; label: string; months: number | "ytd" | "all" }[] = [
  { key: "6m", label: "6M", months: 6 },
  { key: "12m", label: "12M", months: 12 },
  { key: "ytd", label: "YTD", months: "ytd" },
  { key: "all", label: "All", months: "all" },
];

export function PortfolioEvolutionChart({
  history,
  selectedMonth,
  classLabels,
  currencyLabels,
}: {
  history: OverviewHistoryPoint[];
  selectedMonth: string;
  classLabels: string[];
  currencyLabels: string[];
}) {
  const [, startTransition] = useTransition();
  const [, setMonth] = useQueryState("mes", { shallow: false, startTransition });
  const touch = useTouchTooltip();
  const [stackMode, setStackMode] = useState<StackMode>("total");
  const [range, setRange] = useState<[number, number]>([
    Math.max(history.length - 12, 0),
    Math.max(history.length - 1, 0),
  ]);

  const data = useMemo<ChartRow[]>(
    () =>
      history.map((point) => ({
        month: point.month,
        label: formatMonthCompact(point.date),
        total: point.totalUsd ?? null,
        ...point.byClassUsd,
        ...point.byCurrencyUsd,
      })),
    [history],
  );

  const series =
    stackMode === "total" ? ["total"] : stackMode === "class" ? classLabels : currencyLabels;
  const visibleData = data.slice(range[0], range[1] + 1);
  const monthByLabel = useMemo(
    () => new Map(data.map((row) => [row.label, row.month])),
    [data],
  );

  const applyPreset = (months: number | "ytd" | "all") => {
    const lastIndex = history.length - 1;

    if (months === "all") {
      setRange([0, lastIndex]);
      return;
    }

    if (months === "ytd") {
      const year = history[lastIndex]?.date.getUTCFullYear();
      const firstOfYear = history.findIndex((point) => point.date.getUTCFullYear() === year);
      setRange([firstOfYear === -1 ? 0 : firstOfYear, lastIndex]);
      return;
    }

    setRange([Math.max(lastIndex - months + 1, 0), lastIndex]);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
          {STACK_MODES.map((mode) => (
            <button
              key={mode.key}
              type="button"
              onClick={() => setStackMode(mode.key)}
              aria-pressed={stackMode === mode.key}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                stackMode === mode.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {englishLabel(mode.label)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => applyPreset(preset.months)}
              className="rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {englishLabel(preset.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[300px] w-full" {...touch.containerProps}>
        <ResponsiveContainer height="100%" width="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
            onClick={(state) => {
              const month = monthByLabel.get(String(state?.activeLabel ?? ""));


              if (month && !touch.isTouch()) {
                void setMonth(month);
              }
            }}
          >
            <XAxis
              axisLine={false}
              dataKey="label"
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickFormatter={(value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 0 }).format(value)}
              tickLine={false}
              width={62}
            />
            <Tooltip
              cursor={{ fill: "oklch(1 0 0 / 0.04)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) {
                  return null;
                }

                const total = payload.reduce(
                  (sum, item) => sum + (typeof item.value === "number" ? item.value : 0),
                  0,
                );

                return (
                  <div className="rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
                    <p className="text-[11px] font-medium text-foreground">{englishLabel(label)}</p>
                    <p className="mt-1 font-mono text-xs text-foreground">{formatCurrency(total, "USD")}</p>
                    {stackMode === "total" ? null : (
                      <div className="mt-2 space-y-1">
                        {payload
                          .filter((item) => typeof item.value === "number" && item.value > 0)
                          .map((item) => (
                            <div key={item.name} className="flex items-center gap-2">
                              <span
                                className="size-1.5 rounded-full"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="text-[10px] text-muted-foreground">{englishLabel(item.name)}</span>
                              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                                {formatCurrency(Number(item.value), "USD")}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                );
              }}
            />
            {series.map((key) => (
              <Bar key={key} dataKey={key} stackId="portfolio" name={key === "total" ? "Portfolio value" : key}>
                {visibleData.map((row) => (
                  <Cell
                    key={row.month}
                    fill={key === "total" ? "var(--primary)" : categoryColor(key)}
                    fillOpacity={row.month === selectedMonth ? 1 : 0.42}
                  />
                ))}
              </Bar>
            ))}
            <Brush
              dataKey="label"
              height={26}
              startIndex={range[0]}
              endIndex={range[1]}
              onChange={(next) => {
                if (typeof next.startIndex === "number" && typeof next.endIndex === "number") {
                  setRange([next.startIndex, next.endIndex]);
                }
              }}
              fill="oklch(1 0 0 / 0.02)"
              stroke="var(--border)"
              travellerWidth={8}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
