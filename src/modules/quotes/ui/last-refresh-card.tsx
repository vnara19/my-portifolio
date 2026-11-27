"use client";

import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";

import { useQuoteRefresh } from "@/components/product/use-quote-refresh";
import { cn } from "@/lib/utils";
import { formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { parseMonthParam } from "@/modules/portfolio/presentation/reference-month";
import type { QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";
import { formatRefreshDateTime } from "@/modules/quotes/presentation/refresh-time";


export function LastRefreshCard({
  summary: serverSummary,
  currentMonth,
  automaticUpdates,
}: {
  summary: QuoteRefreshSummary | null;
  currentMonth: string;
  automaticUpdates: boolean;
}) {
  const { now, summary, time, lastRun, hasIssues } = useQuoteRefresh(serverSummary);
  const lastAttemptIsLatestUpdate =
    lastRun !== null && summary?.lastUpdatedAt === (lastRun.finishedAt ?? lastRun.startedAt);
  const failed = lastRun?.failures ?? [];

  return (
    <section
      aria-labelledby="last-refresh-title"
      className="metric-card mt-6 flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5"
    >
      <span className="hidden size-10 shrink-0 place-items-center rounded-xl bg-primary/8 text-primary ring-1 ring-primary/10 sm:grid">
        <ClockCounterClockwiseIcon aria-hidden="true" size={19} weight="duotone" />
      </span>

      <div className="min-w-0 flex-1">
        <h2
          id="last-refresh-title"
          className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
        >Last update
        </h2>
        <p
          data-testid="last-refresh-time"
          className={cn(
            "mt-1.5 text-lg font-semibold tracking-[-0.03em] text-foreground",
            now === null && summary?.lastUpdatedAt ? "invisible" : null,
          )}
        >
          {time?.long ?? (summary?.lastUpdatedAt ? "Updated 10 min ago" : "Quotes not updated yet")}
        </p>
        {time ? <p className="mt-0.5 text-xs text-muted-foreground">On {time.absolute}</p> : null}
        {hasIssues && lastRun && now !== null ? (
          <p data-testid="last-refresh-issue" className="mt-1.5 text-xs text-destructive">
            {lastAttemptIsLatestUpdate ? "In this update" : `Last attempt on ${formatRefreshDateTime(lastRun.startedAt)}`}
            {failed.length > 0
              ? `: ${failed.length} ${failed.length === 1 ? "quote" : "quotes"} failed (${failed.map((failure) => failure.symbol).join(", ")}).`
              : `: ${lastRun.errorMessage ?? "the update failed."}`}
          </p>
        ) : null}
        <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{automaticUpdates ? `Scheduled updates run hourly and recalculate positions for ${compact(currentMonth)}.` : "Scheduled quote updates are not enabled in this preview."}
        </p>
      </div>

    </section>
  );
}

function compact(month: string) {
  const date = parseMonthParam(month);
  return date ? formatMonthCompact(date) : month;
}
