"use client";

import { englishLabel } from "@/lib/english-labels";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, type LabelProps } from "recharts";

import { cn } from "@/lib/utils";
import { categoryColor } from "@/modules/portfolio/presentation/category-colors";
import { formatSharePercent } from "@/modules/portfolio/presentation/portfolio-format";
import { useTouchTooltip } from "@/modules/portfolio/ui/use-touch-tooltip";

export type AllocationBarRow = {
  label: string;
  currentShare: number;
  targetShare: number | null;
};

type Mode = "current" | "target";


export function AllocationBars({ title, rows }: { title: string; rows: AllocationBarRow[] }) {
  const hasCurrent = rows.some((row) => row.currentShare > 0);
  const hasTarget = rows.some((row) => (row.targetShare ?? 0) > 0);
  const scale = shareScale(Math.max(0, ...rows.flatMap((row) => [row.currentShare, row.targetShare ?? 0])));

  return (
    <section className="premium-panel rounded-[24px] p-5 sm:p-6" aria-labelledby="allocation-chart-title" data-testid="composition-chart">
      <h2 id="allocation-chart-title" className="text-base font-semibold tracking-[-0.025em]">
        {title}
      </h2>

      {rows.length === 0 ? (
        <p className="mt-5 grid h-[160px] place-items-center rounded-xl border border-dashed border-border/70 text-[11px] text-muted-foreground">No positions in this allocation view
        </p>
      ) : (
        <>
          <ul aria-label="Items" className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
            {rows.map((row) => (
              <li key={row.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(row.label) }} />
                {englishLabel(row.label)}
              </li>
            ))}
          </ul>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]">
            <ShareBars mode="current" title="Current" empty={!hasCurrent} emptyText="No positions in this allocation view" rows={rows} scale={scale} />
            <div aria-hidden="true" className="h-px bg-border/60 lg:h-auto lg:w-px" />
            <ShareBars mode="target" title="Target" empty={!hasTarget} emptyText="No targets in this allocation view" rows={rows} scale={scale} />
          </div>

          <table className="sr-only">
            <caption>{title}, current and target</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Current</th>
                <th scope="col">Target</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{englishLabel(row.label)}</th>
                  <td>{formatSharePercent(row.currentShare)}</td>
                  <td>{row.targetShare === null ? "no target" : formatSharePercent(row.targetShare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function ShareBars({
  mode,
  title,
  empty,
  emptyText,
  rows,
  scale,
}: {
  mode: Mode;
  title: string;
  empty: boolean;
  emptyText: string;
  rows: AllocationBarRow[];
  scale: { top: number; ticks: number[] };
}) {
  const touch = useTouchTooltip();
  const data = rows.map((row) => ({ ...row, value: mode === "current" ? row.currentShare : (row.targetShare ?? 0) }));

  return (
    <figure aria-label={title} data-testid={`allocation-${mode}`}>
      <figcaption className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{title}</figcaption>

      <div className="mt-2 h-[200px] w-full" {...touch.containerProps}>
        {empty ? (
          <div className="grid h-full place-items-center rounded-xl border border-dashed border-border/70 text-[11px] text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={data} barCategoryGap="18%" margin={{ top: 18, right: 4, bottom: 0, left: 0 }}>
              <XAxis
                axisLine={false}
                dataKey="label"
                interval={0}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                tickFormatter={(value: string) => { const label = englishLabel(value); return label.length > 14 ? `${label.slice(0, 13)}…` : label; }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                domain={[0, scale.top]}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                tickFormatter={(value: number) => `${value}%`}
                tickLine={false}
                ticks={scale.ticks}
                width={36}
              />
              <Tooltip
                cursor={{ fill: "oklch(1 0 0 / 0.04)" }}
                content={({ active, payload }) => {
                  const row = payload?.[0]?.payload as AllocationBarRow | undefined;

                  if (!active || !row) {
                    return null;
                  }

                  return (
                    <div className="rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
                      <div className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full" style={{ backgroundColor: categoryColor(row.label) }} />
                        <p className="text-[11px] font-medium text-foreground">{englishLabel(row.label)}</p>
                      </div>
                      <p className="mt-1.5 font-mono text-[10px]">
                        <span className={cn(mode === "current" ? "text-foreground" : "text-muted-foreground")}>
                          {formatSharePercent(row.currentShare)}
                        </span>
                        <span className="text-muted-foreground/50"> / </span>
                        <span className={cn(mode === "target" ? "text-foreground" : "text-muted-foreground")}>
                          {row.targetShare === null ? "no target" : formatSharePercent(row.targetShare)}
                        </span>
                        <span className="ml-2 text-[9px] tracking-[0.1em] text-muted-foreground uppercase">current / target</span>
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" maxBarSize={44} radius={[3, 3, 0, 0]}>
                {data.map((row) => (
                  <Cell key={row.label} fill={categoryColor(row.label)} />
                ))}
                <LabelList dataKey="value" content={(props) => <ValueLabel viewBox={props.viewBox} value={props.value} />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </figure>
  );
}

function ValueLabel({ viewBox, value }: { viewBox: LabelProps["viewBox"]; value: unknown }) {
  const share = typeof value === "number" ? value : Number(value);

  if (!viewBox || !("width" in viewBox) || !Number.isFinite(share) || share <= 0) {
    return null;
  }

  const width = Number(viewBox.width ?? 0);

  const precise = 5 * 0.6 * 10 <= width + 8;
  const text = precise ? formatSharePercent(share) : `${Math.round(share)}%`;

  if (text.length * 0.6 * 10 > width + 16) {
    return null;
  }

  return (
    <text
      x={Number(viewBox.x ?? 0) + width / 2}
      y={Number(viewBox.y ?? 0) - 6}
      className="font-mono"
      fill="var(--foreground)"
      fillOpacity={0.8}
      fontSize={10}
      textAnchor="middle"
    >
      {text}
    </text>
  );
}


function shareScale(max: number) {
  const padded = max * 1.1;
  const step = padded <= 40 ? 10 : padded <= 60 ? 20 : 25;
  const top = Math.min(100, Math.max(step, Math.ceil(padded / step) * step));

  return {
    top,
    ticks: Array.from({ length: Math.floor(top / step) + 1 }, (_, index) => index * step),
  };
}
