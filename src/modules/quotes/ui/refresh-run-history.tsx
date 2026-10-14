"use client";

import { englishLabel } from "@/lib/english-labels";

import {
  CaretDownIcon,
  CheckCircleIcon,
  ClockIcon,
  ListChecksIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState, useTransition } from "react";

import { loadRunHistoryAction } from "@/app/actions/quote-history";
import { LocalDateTime } from "@/components/product/local-time";
import { cn } from "@/lib/utils";
import type {
  QuoteRunHistoryEntry,
  QuoteRunHistoryPage,
  QuoteRunHistoryStatus,
} from "@/modules/quotes/application/get-run-history";
import { providerLabel } from "@/modules/quotes/domain/quote-refresh";

const STATUS: Record<QuoteRunHistoryStatus, { label: string; className: string }> = {
  COMPLETED: { label: "Completed", className: "bg-primary/10 text-primary" },
  COMPLETED_WITH_ISSUES: { label: "Completed with issues", className: "bg-warning/50 text-warning-foreground" },
  FAILED: { label: "Failed", className: "bg-destructive/12 text-destructive" },
  RUNNING: { label: "In progress", className: "bg-white/[0.06] text-muted-foreground" },
};


export function RefreshRunHistory({
  initial,
  month,
  monthLabel,
}: {
  initial: QuoteRunHistoryPage | null;
  /** YYYY-MM */
  month: string;
  monthLabel: string;
}) {
  const [initialPage, setInitialPage] = useState(initial);
  const [extra, setExtra] = useState<QuoteRunHistoryEntry[]>([]);
  const [cursor, setCursor] = useState(initial?.nextCursor ?? null);
  const [isLoading, startLoading] = useTransition();


  if (initial !== initialPage) {
    setInitialPage(initial);
    setExtra([]);
    setCursor(initial?.nextCursor ?? null);
  }

  const runs = [...(initial?.runs ?? []), ...extra];
  const total = initial?.total ?? 0;

  const loadMore = () => {
    if (!cursor) {
      return;
    }

    startLoading(async () => {
      const page = await loadRunHistoryAction(month, cursor);

      if (page) {
        setExtra((current) => [...current, ...page.runs.filter((run) => !current.some((item) => item.id === run.id))]);
        setCursor(page.nextCursor);
      }
    });
  };

  return (
    <section className="premium-panel mt-6 overflow-hidden rounded-[24px]" aria-labelledby="run-history-title">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-5 py-4 sm:px-6">
        <ListChecksIcon aria-hidden="true" className="text-primary" size={17} weight="duotone" />
        <h2 id="run-history-title" className="text-sm font-semibold text-foreground">Execution history
        </h2>
        <span data-testid="run-history-count" className="text-[11px] text-muted-foreground">
          {total} {total === 1 ? "execution" : "executions"} in {monthLabel}
        </span>
      </div>

      {runs.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground sm:px-6">
          {initial ? `No quote updates in ${monthLabel}.` : "Could not load the execution history."}
        </p>
      ) : (
        <ol className="divide-y divide-border/55">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </ol>
      )}

      {cursor ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-5 py-3 sm:px-6">
          <p className="text-[11px] text-muted-foreground">Showing {runs.length} of {total}.
          </p>
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoading}
            className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            {isLoading ? "Loading…" : "Show more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function RunRow({ run }: { run: QuoteRunHistoryEntry }) {
  const [open, setOpen] = useState(false);
  const status = STATUS[run.status];
  const expandable = run.failures.length > 0;
  const detailsId = `run-${run.id}-falhas`;

  const content = (
    <>
      <RunIcon status={run.status} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <LocalDateTime iso={run.at} className="font-mono text-xs text-foreground" />
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">{describeRun(run)}</span>
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap",
          status.className,
        )}
      >
        {englishLabel(status.label)}
      </span>
      {expandable ? (
        <CaretDownIcon
          aria-hidden="true"
          className={cn("shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
          size={13}
          weight="bold"
        />
      ) : null}
    </>
  );

  return (
    <li data-testid="quote-run">
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-start gap-3 px-5 py-3.5 text-left outline-none transition-colors hover:bg-white/[0.02] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset sm:items-center sm:px-6"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-start gap-3 px-5 py-3.5 sm:items-center sm:px-6">{content}</div>
      )}

      {expandable && open ? (
        <ul id={detailsId} className="space-y-2 border-t border-border/40 bg-white/[0.012] px-5 py-3.5 pl-12 sm:px-6 sm:pl-[3.25rem]">
          {run.failures.map((failure) => (
            <li key={failure.symbol} className="text-xs leading-snug">
              <span className="font-mono font-semibold text-foreground">{failure.symbol}</span>
              {failure.assets.length > 0 ? (
                <span className="text-muted-foreground"> · {failure.assets.join(", ")}</span>
              ) : null}
              <span className="block text-[11px] text-muted-foreground/80">
                {providerLabel(failure.provider)}: {failure.errorMessage}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function RunIcon({ status }: { status: QuoteRunHistoryStatus }) {
  if (status === "COMPLETED") {
    return <CheckCircleIcon aria-hidden="true" className="mt-px shrink-0 text-primary" size={16} weight="fill" />;
  }

  if (status === "RUNNING") {
    return <ClockIcon aria-hidden="true" className="mt-px shrink-0 text-muted-foreground" size={16} weight="duotone" />;
  }

  return (
    <WarningCircleIcon
      aria-hidden="true"
      className={cn(
        "mt-px shrink-0",
        status === "COMPLETED_WITH_ISSUES" ? "text-warning-foreground" : "text-destructive",
      )}
      size={16}
      weight="fill"
    />
  );
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function describeRun(run: QuoteRunHistoryEntry) {
  if (run.status === "RUNNING") {
    return "Contacting providers.";
  }

  const total = run.succeeded + run.failures.length;

  if (total === 0) {
    return run.status === "FAILED"
      ? (run.errorMessage ?? "The update failed before contacting providers.")
      : "No quotes to update.";
  }

  if (run.failures.length === 0) {
    return `${plural(run.succeeded, "quote updated", "quotes updated")}.`;
  }

  if (run.succeeded === 0) {
    return run.failures.every((failure) => failure.errorCode === "NOT_SAVED")
      ? `${plural(total, "quote fetched", "quotes fetched")}, but not saved.`
      : `${plural(run.failures.length, "failed quote", "failed quotes")}; nada mudou.`;
  }

  return `${plural(run.succeeded, "quote updated", "quotes updated")} e ${plural(run.failures.length, "failed", "failed")}.`;
}
