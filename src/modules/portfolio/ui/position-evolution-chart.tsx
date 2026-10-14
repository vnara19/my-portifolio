"use client";

import { englishLabel } from "@/lib/english-labels";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Brush,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import type { HistorySlot } from "@/modules/portfolio/domain/position-history";
import { formatBrl, formatPriceBrl, formatSharePercent } from "@/modules/portfolio/presentation/portfolio-format";
import { formatQuantity, monthLabel } from "@/modules/portfolio/presentation/position-page";
import { useTouchTooltip } from "@/modules/portfolio/ui/use-touch-tooltip";

type EvolutionRow = {
  month: string;
  label: string;
  slot: HistorySlot;
  value: number | null;
  applied: number | null;
} & Record<string, number | null | string | HistorySlot>;

const PRESETS: { key: string; label: string; months: number | "ytd" | "all" }[] = [
  { key: "6m", label: "6M", months: 6 },
  { key: "12m", label: "12M", months: 12 },
  { key: "ytd", label: "YTD", months: "ytd" },
  { key: "all", label: "All", months: "all" },
];

const GAP_FILL = "oklch(1 0 0 / 0.035)";


export function PositionEvolutionChart({
  slots,
  selectedMonth,
  quoted,
  quoteSymbol,
  ticker,
  scopeLabel,
}: {
  slots: HistorySlot[];
  selectedMonth: string;
  quoted: boolean;
  quoteSymbol: string | null;
  ticker: string | null;

  scopeLabel: "account" | "all";
}) {
  const touch = useTouchTooltip();

  const { rows, bridges, missingRuns, defaultEnd } = useMemo(() => buildRows(slots, selectedMonth), [slots, selectedMonth]);
  const [rangeState, setRange] = useState<{ key: string; range: [number, number] } | null>(null);
  const rangeKey = `${rows.length}:${rows[0]?.month ?? ""}`;
  const range: [number, number] =
    rangeState && rangeState.key === rangeKey ? rangeState.range : [0, Math.max(defaultEnd, 0)];

  if (rows.length === 0) {
    return null;
  }

  const selectedRow = rows.find((row) => row.month === selectedMonth);

  const hasApplied = rows.some((row) => row.applied !== null);
  const appliedEstimated = rows.some(
    (row) => row.slot.kind === "present" && row.applied !== null && row.slot.recorded === null,
  );
  const byLabel = new Map(rows.map((row) => [row.label, row]));

  const applyPreset = (months: number | "ytd" | "all") => {
    const lastIndex = rows.length - 1;

    if (months === "all") {
      setRange({ key: rangeKey, range: [0, lastIndex] });
      return;
    }

    if (months === "ytd") {
      const year = rows[defaultEnd]?.month.slice(0, 4);
      const firstOfYear = rows.findIndex((row) => row.month.startsWith(`${year}-`));
      setRange({ key: rangeKey, range: [firstOfYear === -1 ? 0 : firstOfYear, defaultEnd] });
      return;
    }

    setRange({ key: rangeKey, range: [Math.max(defaultEnd - months + 1, 0), defaultEnd] });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ul aria-label="Legend" className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-0.5 w-3.5 rounded-full bg-primary" />Position value
          </li>
          {hasApplied ? (
            <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground" data-testid="applied-legend">
              <span className="w-3.5 border-t border-dashed border-muted-foreground" />
              {appliedEstimated ? "Invested amount (estimated)" : "Invested amount"}
            </li>
          ) : null}
          {missingRuns.length > 0 ? (
            <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-2.5 rounded-[3px] border border-border" style={{ backgroundColor: GAP_FILL }} />No reporting month in history
            </li>
          ) : null}
        </ul>

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


      <div className="h-[300px] w-full" data-testid="position-evolution-chart" {...touch.containerProps}>
        <ResponsiveContainer height="100%" width="100%">
          <AreaChart
            data={rows}
            margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
          >
            <defs>
              <linearGradient id="position-value-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.26} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              axisLine={false}
              dataKey="label"
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickLine={false}
              minTickGap={12}
            />
            <YAxis
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickFormatter={(value: number) => formatBrl(value, { compact: true })}
              tickLine={false}
              width={62}
            />
            {missingRuns.map((run) => (
              <ReferenceArea
                key={run.key}
                x1={run.from}
                x2={run.to}
                fill={GAP_FILL}
                fillOpacity={1}
                ifOverflow="hidden"
              />
            ))}
            {selectedRow ? (
              <ReferenceLine
                x={selectedRow.label}
                stroke="var(--primary)"
                strokeOpacity={0.45}
                strokeDasharray="3 3"
                ifOverflow="hidden"
              />
            ) : null}
            <Tooltip
              filterNull={false}
              cursor={{ stroke: "oklch(1 0 0 / 0.12)" }}
              content={({ active, label }) => {
                const row = byLabel.get(String(label ?? ""));

                if (!active || !row) {
                  return null;
                }

                return (
                  <EvolutionTooltip
                    row={row}
                    quoted={quoted}
                    quoteSymbol={quoteSymbol}
                    ticker={ticker}
                    scopeLabel={scopeLabel}
                  />
                );
              }}
            />
            <Area
              dataKey="value"
              name="Position value"
              type="monotone"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#position-value-fill)"
              connectNulls={false}
              dot={(props) => <ValueDot {...props} rows={rows} selectedMonth={selectedMonth} />}
              activeDot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
            />
            {hasApplied ? (
              <Line
                dataKey="applied"
                name="Invested amount"
                type="stepAfter"
                stroke="var(--muted-foreground)"
                strokeOpacity={0.8}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                activeDot={false}
                connectNulls={false}
              />
            ) : null}
            {bridges.map((key) => (
              <Line
                key={key}
                dataKey={key}
                type="linear"
                stroke="var(--primary)"
                strokeOpacity={0.55}
                strokeWidth={1.5}
                strokeDasharray="3 4"
                dot={false}
                activeDot={false}
                connectNulls
                legendType="none"
              />
            ))}
            <Brush
              dataKey="label"
              height={26}
              startIndex={range[0]}
              endIndex={range[1]}
              onChange={(next) => {
                if (typeof next.startIndex === "number" && typeof next.endIndex === "number") {
                  setRange({ key: rangeKey, range: [next.startIndex, next.endIndex] });
                }
              }}
              fill="oklch(1 0 0 / 0.02)"
              stroke="var(--border)"
              travellerWidth={8}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function buildRows(slots: HistorySlot[], selectedMonth: string) {
  const firstIndex = slots.findIndex((slot) => slot.kind === "present");

  if (firstIndex === -1) {
    return { rows: [] as EvolutionRow[], bridges: [] as string[], missingRuns: [], defaultEnd: 0 };
  }

  const rows: EvolutionRow[] = slots.slice(firstIndex).map((slot) => ({
    month: slot.month,
    label: monthLabel(slot.month),
    slot,
    value: slot.kind === "present" ? slot.valueBrl : null,
    applied: slot.kind === "present" ? slot.appliedBrl : null,
  }));


  const bridges: string[] = [];
  let lastPresent = -1;

  rows.forEach((row, index) => {
    if (row.slot.kind !== "present") {
      return;
    }

    if (row.slot.step?.acrossMissing && lastPresent !== -1) {
      const key = `ponte${bridges.length}`;
      bridges.push(key);

      for (const [rowIndex, entry] of rows.entries()) {
        entry[key] = rowIndex === lastPresent || rowIndex === index ? (entry.value as number) : null;
      }
    }

    lastPresent = index;
  });


  const missingRuns: { key: string; from: string; to: string }[] = [];
  let runStart = -1;

  rows.forEach((row, index) => {
    if (row.slot.kind === "missing") {
      if (runStart === -1) {
        runStart = index;
      }

      return;
    }

    if (runStart !== -1) {
      missingRuns.push({ key: rows[runStart].month, from: rows[runStart - 1].label, to: row.label });
      runStart = -1;
    }
  });


  const lastPresentIndex = rows.findLastIndex((row) => row.slot.kind === "present");
  const selectedIndex = rows.findIndex((row) => row.month === selectedMonth);
  const defaultEnd = Math.min(
    rows.length - 1,
    Math.max(lastPresentIndex + (lastPresentIndex < rows.length - 1 ? 1 : 0), selectedIndex),
  );

  return { rows, bridges, missingRuns, defaultEnd };
}

function ValueDot({
  cx,
  cy,
  index,
  rows,
  selectedMonth,
}: {
  cx?: number;
  cy?: number;
  index?: number;
  rows: EvolutionRow[];
  selectedMonth: string;
}) {
  const row = typeof index === "number" ? rows[index] : undefined;

  if (!row || row.value === null || typeof cx !== "number" || typeof cy !== "number") {
    return null;
  }

  const isolated = rows[index! - 1]?.value == null && rows[index! + 1]?.value == null;
  const selected = row.month === selectedMonth;

  if (!selected && !isolated) {
    return null;
  }

  return (
    <circle
      cx={cx}
      cy={cy}
      r={selected ? 4.5 : 3}
      fill="var(--primary)"
      stroke="var(--card)"
      strokeWidth={2}
    />
  );
}

function EvolutionTooltip({
  row,
  quoted,
  quoteSymbol,
  ticker,
  scopeLabel,
}: {
  row: EvolutionRow;
  quoted: boolean;
  quoteSymbol: string | null;
  ticker: string | null;
  scopeLabel: "account" | "all";
}) {
  const slot = row.slot;

  return (
    <div className="max-w-[260px] rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
      <p className="text-[11px] font-medium text-foreground">{englishLabel(row.label)}</p>
      {slot.kind === "missing" ? (
        <p className="mt-1 text-[11px] text-muted-foreground">No reporting month in history</p>
      ) : slot.kind === "absent" ? (
        <>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {scopeLabel === "account" ? "Outside this account" : "Outside the portfolio"}
          </p>
          {slot.elsewhere.length > 0 ? (
            <p className="mt-0.5 text-[10px] text-muted-foreground">In {slot.elsewhere.join(", ")}</p>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-1 font-mono text-xs text-foreground">{formatBrl(slot.valueBrl)}</p>
          {quoted && slot.priceBrl !== null ? (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {formatQuantity(slot.quantity, quoteSymbol, ticker)} × {formatPriceBrl(slot.priceBrl)}
            </p>
          ) : null}
          <div className={cn("mt-2 space-y-1")}>
            {slot.appliedBrl !== null ? (
              <>
                <TooltipRow label="Invested amount" value={formatBrl(slot.appliedBrl)} />
                <TooltipRow label="Return" value={formatBrl(slot.gainBrl ?? slot.valueBrl - slot.appliedBrl)} />
              </>
            ) : null}
            <TooltipRow label="Portfolio share" value={formatSharePercent(slot.share)} />
          </div>
          {scopeLabel === "all" ? (
            <p className="mt-1.5 text-[10px] text-muted-foreground">In {slot.accounts.join(", ")}</p>
          ) : null}
        </>
      )}
    </div>
  );
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-muted-foreground">{englishLabel(label)}</span>
      <span className="ml-auto font-mono text-[10px] text-muted-foreground">{value}</span>
    </div>
  );
}
