"use client";
import { usePositionMoney } from "./position-money-context";

/** Show month-end prices alongside the position's cost basis and dated cash movements. */

import { englishLabel } from "@/lib/english-labels";

import { useState } from "react";
import { Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/utils";
import { monthFromKey } from "@/modules/portfolio/domain/position-history";
import { formatPercent } from "@/modules/portfolio/presentation/portfolio-format";
import { formatUsd, monthLabel } from "@/modules/portfolio/presentation/position-page";
import type { PriceHistory, PricePoint } from "@/modules/quotes/domain/price-history";
import { useTouchTooltip } from "@/modules/portfolio/ui/use-touch-tooltip";

type Currency = "BRL" | "USD";

export type PriceMarker = { day: string; kind: "CONTRIBUTION" | "WITHDRAWAL"; unitPriceBrl: number };
type RangeKey = "6m" | "12m" | "36m" | "all";

type PriceRow = {
  t: number;
  point: PricePoint;
  value: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });


export function AssetPriceChart({
  prices,
  symbol,
  selectedMonth,
  averagePriceBrl,
  averageLabel,
  markers = [],
}: {
  prices: PriceHistory;
  symbol: string;
  selectedMonth: string;
  averagePriceBrl: number | null;
  averageLabel: string;

  markers?: PriceMarker[];
}) {
 const { formatBrl, formatPriceBrl } = usePositionMoney();

  const touch = useTouchTooltip();
  const [rangeKey, setRangeKey] = useState<RangeKey>("all");
  const activeCurrency: Currency = "BRL";
  const activeRange: RangeKey = rangeKey;

  const points = prices.points;
  const lastT = points.at(-1)?.t ?? 0;
  const startT =
    activeRange === "6m"
      ? lastT - 183 * DAY_MS
      : activeRange === "12m"
        ? lastT - 366 * DAY_MS
        : activeRange === "36m"
          ? lastT - 3 * 366 * DAY_MS
          : (points[0]?.t ?? 0);

  const rows: PriceRow[] = points
    .filter((point) => point.t >= startT)
    .map((point) => ({ t: point.t, point, value: activeCurrency === "BRL" ? point.valueBrl : point.valueUsd }))
    .filter((row) => row.value !== null);

  if (points.length === 0) {
    return (
      <div className="grid h-[240px] place-items-center rounded-xl border border-dashed border-border/70 px-6 text-center text-[11px] text-muted-foreground">No quotes recorded for {symbol}.
      </div>
    );
  }

  const first = rows[0];
  const last = rows.at(-1);
  const firstValue = first?.value ?? null;
  const lastValue = last?.value ?? null;
  const change = firstValue && lastValue ? (lastValue / firstValue - 1) * 100 : null;
  const domain: [number, number] = [first?.t ?? startT, last?.t ?? lastT];
  const ticks = timeTicks(domain[0], domain[1]);
  const selectedStart = monthFromKey(selectedMonth).getTime();
  const selectedEnd = new Date(Date.UTC(new Date(selectedStart).getUTCFullYear(), new Date(selectedStart).getUTCMonth() + 1, 0)).getTime();
  const format = (value: number) => (activeCurrency === "BRL" ? formatPriceBrl(value) : `US$ ${formatUsd(value)}`);

  // Keep markers visible across the selected range.
  const visibleMarkers =
    activeCurrency === "BRL"
      ? markers
          .map((marker) => ({ ...marker, t: Date.parse(`${marker.day}T00:00:00.000Z`) }))
          .filter((marker) => marker.t >= domain[0] && marker.t <= domain[1] + DAY_MS * 31)
      : [];

  const ranges: { key: RangeKey; label: string }[] = [
    { key: "6m", label: "6M" },
    { key: "12m", label: "12M" },
    { key: "36m", label: "3A" },
    { key: "all", label: "All" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {change !== null ? (
            <span
              data-testid="price-range-change"
              className={cn(
                "rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold",
                change >= 0 ? "bg-chart-up/12 text-chart-up" : "bg-chart-down/12 text-chart-down",
              )}
            >
              {formatPercent(change)}over the period
            </span>
          ) : null}
        </div>
        <Segmented
          label="Chart period"
          options={ranges}
          value={activeRange}
          onChange={(next) => setRangeKey(next as RangeKey)}
        />
      </div>

      <ul aria-label="Legend" className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-0.5 w-3.5 rounded-full bg-primary" />Month-end price
        </li>
        {averagePriceBrl !== null && activeCurrency === "BRL" ? (
          <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-3.5 border-t border-dashed border-[#cc79a7]" />
            {averageLabel}
          </li>
        ) : null}
        {visibleMarkers.length > 0 ? (
          <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground" data-testid="price-markers-legend">
            <span className="size-2 rounded-full bg-chart-up" />Contribution
            <span className="ml-1.5 size-2 rounded-full bg-chart-down" />Withdrawal
          </li>
        ) : null}
      </ul>

      <div className="h-[260px] w-full" data-testid="asset-price-chart" {...touch.containerProps}>
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={rows} margin={{ top: 16, right: 8, bottom: 0, left: 4 }}>
            <XAxis
              axisLine={false}
              dataKey="t"
              type="number"
              scale="time"
              domain={domain}
              ticks={ticks}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickFormatter={(value: number) => monthLabel(new Date(value).toISOString().slice(0, 7))}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              domain={["auto", "auto"]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickFormatter={(value: number) =>
                activeCurrency === "BRL"
                  ? formatBrl(value, { compact: true })
                  : `US$ ${value.toLocaleString("en-GB", { notation: "compact", maximumFractionDigits: 1 })}`
              }
              tickLine={false}
              width={62}
            />
            <ReferenceArea
              x1={selectedStart}
              x2={selectedEnd}
              fill="var(--primary)"
              fillOpacity={0.07}
              ifOverflow="hidden"
            />
            {averagePriceBrl !== null && activeCurrency === "BRL" ? (
              <ReferenceLine
                y={averagePriceBrl}
                stroke="#cc79a7"
                strokeOpacity={0.7}
                strokeDasharray="5 4"
                ifOverflow="extendDomain"
              />
            ) : null}
            <Tooltip
              cursor={{ stroke: "oklch(1 0 0 / 0.12)" }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as PriceRow | undefined;

                if (!active || !row) {
                  return null;
                }

                return (
                  <div className="rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
                    <p className="text-[11px] font-medium text-foreground">{pointLabel(row.point)}</p>
                    <p className="mt-1 font-mono text-xs text-foreground">
                      {row.value === null ? "—" : format(row.value)}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Quote for {dayFormat.format(new Date(row.t))}
                    </p>
                  </div>
                );
              }}
            />
            {visibleMarkers.map((marker, index) => (
              <ReferenceDot
                key={`${marker.day}-${index}`}
                x={marker.t}
                y={marker.unitPriceBrl}
                r={4}
                fill={marker.kind === "CONTRIBUTION" ? "var(--chart-up)" : "var(--chart-down)"}
                stroke="var(--card)"
                strokeWidth={1.5}
                ifOverflow="extendDomain"
              />
            ))}
            <Line
              dataKey="value"
              name="Month-end price"
              type="linear"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={{ r: 2, fill: "var(--primary)", strokeWidth: 0 }}
              activeDot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>Quote for {symbol}per month</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Source</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.point.month}>
              <th scope="row">{dayFormat.format(new Date(row.t))}</th>
              <td>{pointLabel(row.point)}</td>
              <td>{format(row.value!)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div role="group" aria-label={englishLabel(label)} className="flex items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={value === option.key}
          onClick={() => onChange(option.key)}
          className={cn(
            "rounded-md px-2.5 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
            value === option.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {englishLabel(option.label)}
        </button>
      ))}
    </div>
  );
}


function timeTicks(start: number, end: number) {
  if (end <= start) {
    return [start];
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  const months =
    (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + endDate.getUTCMonth() - startDate.getUTCMonth();
  const step = [1, 2, 3, 6, 12, 24].find((candidate) => months / candidate <= 7) ?? 24;
  const ticks: number[] = [];
  let year = startDate.getUTCFullYear();
  let month = startDate.getUTCMonth();

  for (;;) {
    const lastDay = Date.UTC(year, month + 1, 0);

    if (lastDay > end) {
      break;
    }

    if (lastDay >= start && (year * 12 + month) % step === step - 1) {
      ticks.push(lastDay);
    }

    month += 1;

    if (month === 12) {
      month = 0;
      year += 1;
    }
  }

  return ticks;
}

function pointLabel(point: PricePoint) {
  return point.open ? `Latest quote for ${monthLabel(point.month)}` : `Closing price for ${monthLabel(point.month)}`;
}
