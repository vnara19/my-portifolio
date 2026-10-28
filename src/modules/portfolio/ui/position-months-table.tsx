"use client";
import { usePositionMoney } from "./position-money-context";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { CollapsibleSection } from "@/modules/portfolio/ui/collapsible-section";
import type { HistorySlot, PresentSlot } from "@/modules/portfolio/domain/position-history";
import type { RecordedMonth } from "@/modules/portfolio/domain/position-transactions";
import { formatPercent, formatSharePercent } from "@/modules/portfolio/presentation/portfolio-format";
import { formatQuantity, monthLabel, monthRangeLabel } from "@/modules/portfolio/presentation/position-page";

type TableRow =
  | { kind: "present"; slot: PresentSlot; first: boolean; returned: boolean; cameFrom: string[] }
  | { kind: "absent"; from: string; to: string; count: number; elsewhere: string[]; exitBrl: number | null }
  | { kind: "missing"; from: string; to: string; count: number };


export function PositionMonthsTable({
  slots,
  selectedMonth,
  quoted,
  quoteSymbol,
  ticker,
  scope,
  recorded,
}: {
  slots: HistorySlot[];
  selectedMonth: string;
  quoted: boolean;
  quoteSymbol: string | null;
  ticker: string | null;
  scope: "account" | "all";


  recorded: Map<string, RecordedMonth> | null;
}) {
 const { formatSignedBrl } = usePositionMoney();

  const rows = buildTableRows(slots).reverse();
  const presentCount = slots.filter((slot) => slot.kind === "present").length;
  const columnCount = quoted ? 8 : 5;

  return (
    <CollapsibleSection
      id="months"
      title="Month by Month"
      summary={`${presentCount} ${presentCount === 1 ? "reporting month" : "reporting months"}`}
      testId="position-months-section"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left" data-testid="position-months">
          <thead>
            <tr className="border-b border-border/60 text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
              <th className="px-4 py-3 pl-5 sm:pl-6">Reporting month</th>
              {quoted ? <th className="hidden px-4 py-3 text-right md:table-cell">Quantity</th> : null}
              {quoted ? <th className="hidden px-4 py-3 text-right lg:table-cell">Quote</th> : null}
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3 text-right">Change</th>
              {quoted ? <th className="hidden px-4 py-3 text-right lg:table-cell">Price</th> : null}
              <th className="hidden px-4 py-3 text-right whitespace-nowrap lg:table-cell">Contributions and redemptions</th>
              <th className="hidden px-4 py-3 pr-5 text-right sm:table-cell sm:pr-6">Portfolio share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/55">
            {rows.map((row) =>
              row.kind === "present" ? (
                <PresentRow
                  key={row.slot.month}
                  row={row}
                  selected={row.slot.month === selectedMonth}
                  quoted={quoted}
                  quoteSymbol={quoteSymbol}
                  ticker={ticker}
                  recorded={recorded?.get(row.slot.month) ?? null}
                />
              ) : (
                <tr key={`${row.kind}-${row.from}`} data-gap={row.kind} className="bg-white/[0.012]">
                  <td colSpan={columnCount} className="px-5 py-2.5 sm:px-6">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[11px] font-medium whitespace-nowrap text-muted-foreground">
                        {monthRangeLabel(row.from, row.to)}
                      </span>
                      <span className="text-[11px] text-muted-foreground/90">
                        {row.kind === "missing"
                          ? row.count === 1
                            ? "No reporting month in history"
                            : `${row.count} months missing from the history`
                          : `${scope === "account" ? "Outside this account" : "Outside the portfolio"}${
                              row.elsewhere.length > 0 ? ` · in ${row.elsewhere.join(", ")}` : ""
                            }`}
                      </span>
                      {row.kind === "absent" && row.exitBrl !== null ? (
                        <span className="ml-auto font-mono text-[11px] text-muted-foreground">withdrawal {formatSignedBrl(row.exitBrl)}
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

function PresentRow({
  row,
  selected,
  quoted,
  quoteSymbol,
  ticker,
  recorded,
}: {
  row: Extract<TableRow, { kind: "present" }>;
  selected: boolean;
  quoted: boolean;
  quoteSymbol: string | null;
  ticker: string | null;
  recorded: RecordedMonth | null;
}) {
 const { formatBrl, formatPriceBrl, formatSignedBrl } = usePositionMoney();

  const { slot } = row;
  const step = slot.step;


  const entry = row.first || row.returned || slot.entryBrl !== null;


  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  params.set("mes", slot.month);
  const href = `${pathname}?${params.toString()}`;

  return (
    <tr
      aria-current={selected ? "date" : undefined}
      data-month={slot.month}
      onClick={(event) => {
        if (!selected && !(event.target as HTMLElement).closest("a, button")) {
          router.push(href, { scroll: false });
        }
      }}
      className={cn(
        "align-top transition-colors duration-150 hover:bg-white/[0.018]",
        selected ? "bg-primary/[0.06] shadow-[inset_2px_0_0_var(--primary)]" : "cursor-pointer",
      )}
    >
      <td className="px-4 py-3 pl-5 sm:pl-6">
        <p className={cn("text-xs font-medium whitespace-nowrap", selected ? "text-primary" : "text-foreground/90")}>
          {selected ? (
            monthLabel(slot.month)
          ) : (
            <Link
              href={href}
              scroll={false}
              className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {monthLabel(slot.month)}
            </Link>
          )}
        </p>
        {entry ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {row.first ? "Opening" : "Back"}
            {row.cameFrom.length > 0 ? ` · from ${row.cameFrom.join(", ")}` : ""}
          </p>
        ) : step?.acrossMissing ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground">since {monthLabel(step.fromMonth)}</p>
        ) : null}
        {slot.liquidated ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground" data-testid="month-liquidated">Liquidated
          </p>
        ) : null}
        {slot.source === "mixed" || step?.source === "mixed" ? <p className="mt-0.5 text-[10px] text-muted-foreground">mixed source</p> : null}

        {step?.unexplainedBrl && Math.abs(step.unexplainedBrl) >= 0.05 ? <p className="mt-0.5 text-[10px] text-muted-foreground">not recorded {formatSignedBrl(step.unexplainedBrl)}</p> : null}
      </td>
      {quoted ? (
        <td className="hidden px-4 py-3 text-right font-mono text-xs whitespace-nowrap text-foreground/85 md:table-cell">
          {formatQuantity(slot.quantity, quoteSymbol, ticker)}
        </td>
      ) : null}
      {quoted ? (
        <td className="hidden px-4 py-3 text-right font-mono text-xs whitespace-nowrap text-muted-foreground lg:table-cell">
          {slot.priceBrl === null ? "—" : formatPriceBrl(slot.priceBrl)}
        </td>
      ) : null}
      <td className="px-4 py-3 text-right font-mono text-xs font-medium whitespace-nowrap text-foreground sm:text-sm">
        {formatBrl(slot.valueBrl)}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {step ? (
          <>
            <p
              className={cn(
                "font-mono text-xs",
                step.changeBrl > 0 ? "text-primary" : step.changeBrl < 0 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {formatSignedBrl(step.changeBrl)}
            </p>
            {step.changePercent !== null ? (
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{formatPercent(step.changePercent)}</p>
            ) : null}
          </>
        ) : (
          <span className="font-mono text-xs text-muted-foreground">—</span>
        )}
      </td>
      {quoted ? (
        <td className="hidden px-4 py-3 text-right whitespace-nowrap lg:table-cell">
          {step?.priceEffectBrl != null ? (
            <>
              <p className="font-mono text-xs text-foreground/85">{formatSignedBrl(step.priceEffectBrl)}</p>
              {step.pricePercent !== null ? (
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">quote {formatPercent(step.pricePercent)}
                </p>
              ) : null}
            </>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">—</span>
          )}
        </td>
      ) : null}
      <td
        className="hidden px-4 py-3 text-right font-mono text-xs whitespace-nowrap text-foreground/85 lg:table-cell"
        data-testid="month-flows"
      >

        {recorded ? (
          <>
            <p>{formatSignedBrl(recorded.netFlowBrl)}</p>
            <p className="mt-0.5 text-[10px] text-primary">recorded
              {recorded.incomeBrl !== 0 ? ` · return ${formatSignedBrl(recorded.incomeBrl)}` : ""}
              {recorded.openingBrl !== 0 ? " · opening balance" : ""}
              {recorded.internalBrl !== 0 ? " · internal transfer" : ""}
            </p>
          </>
        ) : slot.source === "recorded" ? (

          <>
            <p>{formatSignedBrl(0)}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">no transactions</p>
          </>
        ) : quoted && (slot.entryBrl !== null || step?.flowBrl != null) ? (
          <>
            <p>{formatSignedBrl(slot.entryBrl ?? step!.flowBrl!)}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{step?.source === "mixed" ? "no recorded transactions" : "estimated"}</p>
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="hidden px-4 py-3 pr-5 text-right font-mono text-xs text-muted-foreground sm:table-cell sm:pr-6">
        {formatSharePercent(slot.share)}
      </td>
    </tr>
  );
}

function buildTableRows(slots: HistorySlot[]): TableRow[] {
  const firstIndex = slots.findIndex((slot) => slot.kind === "present");

  if (firstIndex === -1) {
    return [];
  }

  const rows: TableRow[] = [];
  let previousExisting: HistorySlot | null = null;

  for (const slot of slots.slice(firstIndex)) {
    const last = rows.at(-1);

    if (slot.kind === "present") {

      const returned =
        previousExisting?.kind === "absent" || (previousExisting?.kind === "present" && previousExisting.liquidated);
      rows.push({
        kind: "present",
        slot,
        first: rows.length === 0,
        returned,
        cameFrom: returned && previousExisting?.kind === "absent" ? previousExisting.elsewhere : [],
      });
    } else if (last && last.kind === slot.kind) {
      last.to = slot.month;
      last.count += 1;

      if (last.kind === "absent" && slot.kind === "absent") {
        last.elsewhere = [...new Set([...last.elsewhere, ...slot.elsewhere])];
      }
    } else if (slot.kind === "absent") {
      rows.push({
        kind: "absent",
        from: slot.month,
        to: slot.month,
        count: 1,
        elsewhere: slot.elsewhere,
        exitBrl: slot.exitBrl,
      });
    } else {
      rows.push({ kind: "missing", from: slot.month, to: slot.month, count: 1 });
    }

    if (slot.kind !== "missing") {
      previousExisting = slot;
    }
  }

  return rows;
}
