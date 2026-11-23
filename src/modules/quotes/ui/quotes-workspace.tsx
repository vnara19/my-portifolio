"use client";

import { englishLabel } from "@/lib/english-labels";

import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CurrencyCircleDollarIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { LocalDateTime } from "@/components/product/local-time";
import { refreshUnlessEditing, subscribeQuoteRunFinished } from "@/components/product/quote-refresh-client";
import { cn } from "@/lib/utils";
import {
  formatBrl,
  formatCurrency,
  formatMonthCompact,
  formatPriceBrl,
} from "@/modules/portfolio/presentation/portfolio-format";
import { parseMonthParam } from "@/modules/portfolio/presentation/reference-month";
import type { MonthQuoteRow, MonthQuotesView } from "@/modules/quotes/application/get-month-quotes";
import type { QuoteRunHistoryPage } from "@/modules/quotes/application/get-run-history";
import { providerLabel, type QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";
import { LastRefreshCard } from "@/modules/quotes/ui/last-refresh-card";
import { RefreshRunHistory } from "@/modules/quotes/ui/refresh-run-history";
import { DevQuoteSyncButton } from "@/modules/quotes/ui/dev-quote-sync-button";



const INSTRUMENT_LABELS: Record<string, string> = {
  ACAO: "Stock",
  CRIPTO: "Cryptocurrency",
  ETF: "ETF",
  FIAT: "Currency",
};

export function QuotesWorkspace({
  month,
  summary,
  history,
  automaticUpdates,
}: {
  month: MonthQuotesView | null;
  summary: QuoteRefreshSummary | null;
  history: QuoteRunHistoryPage | null;
  automaticUpdates: boolean;
}) {
  const router = useRouter();
  const monthParam = useSearchParams().get("mes");
  const rows = month?.quotes ?? [];

  useEffect(
    () => subscribeQuoteRunFinished(() => refreshUnlessEditing(() => router.refresh())),
    [router],
  );


  const positionsHref = monthParam ? `/posicoes?mes=${monthParam}` : "/posicoes";

  if (!month) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center px-5 text-center">
        <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
          <CurrencyCircleDollarIcon aria-hidden="true" size={22} weight="duotone" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">No quotes in this reporting month</h1>
        <DevQuoteSyncButton className="mt-6" />
      </div>
    );
  }

  const monthLabel = formatMonthCompact(month.referenceDate);
  const usdRow = rows.find((row) => row.symbol === "USD");
  const usdRate = usdRow ? usdRow.valueBrl : null;
  const carriedCount = month.quotes.filter((quote) => quote.carriedFrom !== null).length;
  const failedCount = month.quotes.filter((quote) => quote.lastResult?.status === "FAILED").length;
  return (
    <div className="relative mx-auto w-full max-w-[1472px] px-5 py-8 pb-32 sm:px-7 sm:py-10 sm:pb-32 xl:px-12 xl:py-12 xl:pb-32">
      <div className="ambient-glow pointer-events-none absolute top-0 right-0 -z-10 h-[460px] w-[460px]" />

      <header className="flex flex-col gap-6 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>

          <Link
            href={positionsHref}
            aria-label="Back to Positions"
            className="group inline-flex items-center gap-1.5 rounded-md text-[11px] font-semibold tracking-[0.16em] text-primary uppercase outline-none transition-colors hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ArrowLeftIcon
              aria-hidden="true"
              size={12}
              weight="bold"
              className="transition-transform duration-150 group-hover:-translate-x-0.5"
            />Positions
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-[2.65rem]">Quotes</h1>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <DevQuoteSyncButton />
        </div>
      </header>

      {month.isCurrent ? <LastRefreshCard summary={summary} currentMonth={month.currentMonth} automaticUpdates={automaticUpdates} /> : null}

      <section className="premium-panel mt-6 overflow-hidden rounded-[24px]" aria-labelledby="month-quotes-title">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/60 px-5 py-4 sm:px-6">
          <CurrencyCircleDollarIcon aria-hidden="true" className="text-primary" size={17} weight="duotone" />
          <h2 id="month-quotes-title" className="text-sm font-semibold text-foreground">Quotes for {monthLabel}
          </h2>
          <span className="text-[11px] text-muted-foreground">
            {month.quotes.length} {month.quotes.length === 1 ? "symbol" : "symbols"}
          </span>
          {carriedCount > 0 ? (
            <span className="rounded-full bg-warning/50 px-2 py-0.5 text-[10px] font-semibold text-warning-foreground">
              {carriedCount} carried forward
            </span>
          ) : null}
          {failedCount > 0 ? (
            <span className="rounded-full bg-destructive/12 px-2 py-0.5 text-[10px] font-semibold text-destructive">
              {failedCount} failed in the last update
            </span>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="mobile-record-table w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border/60 text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
                <th className="px-4 py-3 pl-5 sm:pl-6">Quote</th>
                <th className="px-3 py-3 text-right sm:px-4">Value</th>
                <th className="hidden px-4 py-3 md:table-cell">Source</th>
                <th className="hidden px-4 py-3 text-right whitespace-nowrap sm:table-cell">
                  Total Position Value
                </th>
                <th className="hidden px-4 py-3 pr-5 whitespace-nowrap lg:table-cell sm:pr-6">Last update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/55">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-muted-foreground">No quotes in this reporting month.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <QuoteRow
                    key={row.symbol}
                    row={row}
                    usdRate={usdRate}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <RefreshRunHistory initial={history} month={month.month} monthLabel={monthLabel} />


    </div>
  );
}

function QuoteRow({
  row,
  usdRate,
}: {
  row: MonthQuoteRow;
  usdRate: number | null;
}) {
  const symbolLabel = row.symbol.replace(/\.(SAO|SA)$/i, "");
  const currencyName = row.symbol === "USD" ? "US Dollar" : row.symbol === "EUR" ? "Euro" : null;
  const assetNames = [...new Set(row.assets.map(name => name.replace(/^ETF\s*[-–:]\s*/i, "").trim()))]
    .filter(name => name.replace(/\.(SAO|SA)$/i, "").toUpperCase() !== symbolLabel.toUpperCase());
  const subtitle = currencyName ?? assetNames.join(", ");

  return (
    <tr data-testid="quote-row" className="align-top transition-colors duration-150 hover:bg-white/[0.018]">
      <td className="px-4 py-4 pl-5 sm:pl-6">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-sm font-semibold text-foreground">{symbolLabel}</span>
          {row.instrumentType ? (
            <span className="text-[10px] text-muted-foreground">
              {INSTRUMENT_LABELS[row.instrumentType] ?? row.instrumentType}
            </span>
          ) : null}
        </p>
        {subtitle ? <p className="mt-1 max-w-[340px] text-[11px] leading-snug text-muted-foreground">{subtitle}</p> : null}
        <p className="mt-0.5 text-[10px] text-muted-foreground/80">
          {row.quantities.length > 0
            ? `${row.quantities.length} ${row.quantities.length === 1 ? "Position" : "Positions"}`
            : currencyName ? "Reporting Currency" : "No Active Positions"}
        </p>
        <div className="mt-1.5 md:hidden">
          <QuoteOrigin row={row} />
        </div>
        <div className="mt-1 lg:hidden">
          <LastResult row={row} compact />
        </div>
      </td>
      <td
        data-label="Quote"
        data-record-wide
        className={cn(
          "px-3 py-4 text-right sm:px-4",
        )}
      >
          <>
            <span className="font-mono text-xs font-medium whitespace-nowrap text-foreground sm:text-sm">
              {row.valueBrl === null ? <span className="text-muted-foreground">No quote</span> : row.symbol === "BTC"
                ? usdRate !== null && usdRate > 0 ? formatCurrency(row.valueBrl / usdRate, "USD") : "USD rate unavailable"
                : row.symbol === "EUR" ? `1 BRL = ${formatCurrency(1 / row.valueBrl, "EUR", false, 4)}` : formatPriceBrl(row.valueBrl)}
            </span>
            {row.valueBrl !== null && (row.symbol === "BTC" || row.symbol === "EUR") ? (
              <span className="mt-1 block text-[10px] text-muted-foreground" title="Conversion uses the exchange rate for this reporting month.">
                {row.symbol === "EUR" ? `1 EUR = ${formatPriceBrl(row.valueBrl)}` : `BTC/BRL: ${formatPriceBrl(row.valueBrl)}`}
              </span>
            ) : null}
          </>

      </td>
      <td className="hidden px-4 py-4 md:table-cell">
        <QuoteOrigin row={row} />
      </td>
      <td
        className={cn(
          "hidden bg-white/[0.012] px-4 py-4 text-right sm:table-cell",
        )}
      >
        {row.quantities.length === 0 ? (
          <span className="font-mono text-xs text-muted-foreground">—</span>
        ) : (
          <>
            <span className="font-mono text-xs whitespace-nowrap text-foreground">{formatBrl(row.totalBrl)}</span>
          </>
        )}
      </td>
      <td className="hidden px-4 py-4 pr-5 lg:table-cell sm:pr-6">
        <LastResult row={row} />
      </td>
    </tr>
  );
}

function QuoteOrigin({ row }: { row: MonthQuoteRow }) {
  if (row.valueBrl === null) {
    return <span className="text-[11px] text-muted-foreground">No value this month</span>;
  }

  if (row.manual) {
    return (
      <span
        title="Your manual value applies only to your portfolio until the next successful update."
        className="text-[11px] whitespace-nowrap text-foreground/85"
      >Manual
      </span>
    );
  }

  if (row.carriedFrom) {
    const source = parseMonthParam(row.carriedFrom);
    const label = source ? formatMonthCompact(source) : row.carriedFrom;

    return (
      <span
        title={`No daily quote this month: the value was copied from ${englishLabel(label)}.`}
        className="inline-flex rounded-full bg-warning/50 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-warning-foreground"
      >Carried forward from {englishLabel(label)}
      </span>
    );
  }

  if (row.quoteDate) {
    return <span className="text-[11px] whitespace-nowrap text-foreground/85">Quote for {formatDay(row.quoteDate)}</span>;
  }

  return (
    <span
      title="Monthly value without a daily history date, such as values imported from a spreadsheet."
      className="text-[11px] whitespace-nowrap text-muted-foreground"
    >Monthly value
    </span>
  );
}

function LastResult({ row, compact = false }: { row: MonthQuoteRow; compact?: boolean }) {
  const result = row.lastResult;

  if (!result) {
    return compact ? null : (
      <span title="No quote updates this month" className="text-[11px] text-muted-foreground">
        —
      </span>
    );
  }

  const ok = result.status === "SUCCESS";

  return (
    <div data-testid={compact ? undefined : "quote-last-result"} className="flex items-start gap-1.5">
      {ok ? (
        <CheckCircleIcon aria-hidden="true" className="mt-px shrink-0 text-primary" size={13} weight="fill" />
      ) : (
        <WarningCircleIcon aria-hidden="true" className="mt-px shrink-0 text-destructive" size={13} weight="fill" />
      )}
      <div className="min-w-0 text-[11px] leading-snug">
        <p className={ok ? "text-foreground/85" : "text-destructive"}>
          {result.source === "inclusion" ? "Added" : ok ? "Updated" : "Failed"} on{" "}
          <LocalDateTime iso={result.fetchedAt} />
        </p>

        <p className={cn("text-muted-foreground wrap-anywhere", compact && "max-w-[260px]")}>
          {providerLabel(result.provider)}
          {result.source === "inclusion" ? " · when adding the position" : null}
          {ok ? null : `: ${result.errorMessage ?? "failure without a description."}`}
        </p>
      </div>
    </div>
  );
}

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });


function formatDay(dateKey: string) {
  return dayFormat.format(new Date(`${dateKey}T00:00:00Z`));
}
