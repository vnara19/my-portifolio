
/** Opening the application reads persisted refresh state. Scheduled jobs own provider updates; navigation does not trigger a full sync. */
import { showAppToast } from "@/components/product/app-toaster";
import { hasPendingChanges } from "@/components/product/unsaved-changes";
import type { MonthRolloverOutcome, OpenCheckResponse } from "@/modules/portfolio/domain/month-rollover";
import { formatMonth, formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { parseMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { providerLabel, type QuoteRefreshRunView, type QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";


export type PendingRollover = { latestMonth: string; months: string[] };

export type QuoteRefreshClientState = {
  running: boolean;
  summary: QuoteRefreshSummary | null;

  pendingRollover: PendingRollover | null;

  rollingOver: boolean;
};

const SERVER_STATE: QuoteRefreshClientState = { running: false, summary: null, pendingRollover: null, rollingOver: false };
const REQUEST_TIMEOUT_MS = 60 * 1000;

const OPEN_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const ANNOUNCED_RUN_KEY = "quotes:announced-run";

let state: QuoteRefreshClientState = SERVER_STATE;
let lastOpenCheckAt: number | null = null;
let refreshQueued = false;


let seen: Pick<QuoteRefreshSummary, "lastUpdatedAt"> & { lastRunId: string | null } | null = null;
const listeners = new Set<() => void>();
const runListeners = new Set<(run: QuoteRefreshRunView) => void>();

export function subscribeQuoteRefresh(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getQuoteRefreshState() {
  return state;
}

export function getQuoteRefreshServerState() {
  return SERVER_STATE;
}


export function subscribeQuoteRunFinished(listener: (run: QuoteRefreshRunView) => void) {
  runListeners.add(listener);
  return () => {
    runListeners.delete(listener);
  };
}

function setState(patch: Partial<QuoteRefreshClientState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}


export function runOpenCheck(onDataChanged: () => void, serverSummary: QuoteRefreshSummary | null = null) {
  seen ??= serverSummary
    ? { lastUpdatedAt: serverSummary.lastUpdatedAt, lastRunId: serverSummary.lastRun?.id ?? null }
    : null;

  if (state.running) {
    return;
  }

  if (lastOpenCheckAt !== null && Date.now() - lastOpenCheckAt < OPEN_CHECK_INTERVAL_MS) {
    return;
  }

  lastOpenCheckAt = Date.now();
  void execute(onDataChanged);
}


export function refreshUnlessEditing(refresh: () => void) {
  if (hasPendingChanges() || refreshQueued) {
    return;
  }

  refreshQueued = true;
  queueMicrotask(() => {
    refreshQueued = false;
    refresh();
  });
}

async function execute(onDataChanged: () => void) {
  setState({ running: true });

  try {
    const response = await fetch("/api/quotes/open-check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = (await response.json()) as OpenCheckResponse;
    const quotesChanged = (payload.summary ? noteSummary(payload.summary) : false) || payload.fixedIncomeChanged === true;

    if (payload.summary) {
      setState({ summary: payload.summary });
    }

    if (payload.rollover) {
      setState({ pendingRollover: null });
      announceRollover(payload.rollover);
    }

    const lastRun = payload.summary?.lastRun ?? null;

    if (lastRun) {
      announceRun(lastRun);
    }

    if (
      payload.rollover.state === "created" ||
      payload.rollover.state === "started" ||
      payload.targetPlan === "created" ||
      quotesChanged
    ) {
      onDataChanged();
    }
  } catch {

    // Replace the previous notice rather than stacking notifications.
    showAppToast({
      id: "quotes-unreachable",
      tone: "error",
      title: "Could not check the quotes",
      description: "The application did not respond on opening. It will retry on the next check.",
    });
  } finally {
    setState({ running: false });
  }
}


function noteSummary(summary: QuoteRefreshSummary) {
  const previous = seen;
  const lastRunId = summary.lastRun?.id ?? null;
  seen = { lastUpdatedAt: summary.lastUpdatedAt, lastRunId };

  if (!previous) {
    return false;
  }

  if (summary.lastRun && lastRunId !== previous.lastRunId) {
    const run = summary.lastRun;
    runListeners.forEach((listener) => listener(run));
  }

  return summary.lastUpdatedAt !== previous.lastUpdatedAt;
}

const listFormat = new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" });

function monthCompact(month: string) {
  const date = parseMonthParam(month);
  return date ? formatMonthCompact(date) : month;
}

function announceRollover(outcome: MonthRolloverOutcome) {
  if (outcome.state === "unavailable") {
    showAppToast({ tone: "error", title: "Could not create the reporting month", description: outcome.message });
    return;
  }

  if (outcome.state !== "created" || outcome.months.length === 0) {
    return;
  }

  const [first] = outcome.months;
  const firstDate = parseMonthParam(first.month);


  const carried = outcome.months.filter((month) => !month.isCurrent && month.carriedQuotes.length > 0);

  showAppToast({
    id: `rollover-${outcome.months.map((month) => month.month).join("-")}`,
    tone: carried.length > 0 ? "warning" : "info",
    title:
      outcome.months.length === 1 && firstDate
        ? `Reporting month for ${formatMonth(firstDate).toLocaleLowerCase("en-GB")} criada`
        : `${outcome.months.length} reporting months created: ${listFormat.format(outcome.months.map((month) => monthCompact(month.month)))}`,
    description:
      outcome.months.length === 1
        ? `Positions and allocations copied from ${monthCompact(first.sourceMonth)}.`
        : `Each month copied the previous month's positions and allocations, starting from ${monthCompact(first.sourceMonth)}.`,
    data:
      carried.length > 0
        ? {
            items: carried.map((month) => ({
              label: monthCompact(month.month),
              detail: "without a daily quote this month",
              reason: `Uses the quote from ${monthCompact(month.sourceMonth)} for ${month.carriedQuotes.join(", ")}.`,
            })),
            footnote: "If needed, adjust these prices under Positions → Quotes.",
          }
        : undefined,
  });
}


function announceRun(run: QuoteRefreshRunView) {
  if (run.status === "RUNNING" || (run.failures.length === 0 && run.status !== "FAILED") || wasAnnounced(run.id)) {
    return;
  }

  markAnnounced(run.id);

  if (run.failures.length > 0) {
    const [first] = run.failures;
    showAppToast({
      id: `quotes-${run.id}`,
      tone: "error",
      title:
        run.failures.length === 1
          ? `Quote for ${first.symbol} not updated`
          : `${run.failures.length} quotes not updated`,
      description:
        run.succeeded > 0
          ? `The other ${run.succeeded} were updated. ${run.failures.length === 1 ? "This asset keeps" : "These assets keep"} the previous value.`
          : `${run.failures.length === 1 ? "The asset keeps" : "The assets keep"} the previous value.`,
      data: {
        items: run.failures.map((failure) => ({
          label: failure.symbol,
          detail: failure.assets.length > 0 ? failure.assets.join(", ") : undefined,
          reason: `${providerLabel(failure.provider)}: ${failure.errorMessage}`,
        })),
      },
    });
    return;
  }

  if (run.status === "FAILED") {
    showAppToast({
      id: `quotes-${run.id}`,
      tone: "error",
      title: "Could not update quotes",
      description: run.errorMessage ?? "The update failed before contacting providers.",
    });
    return;
  }
}

function wasAnnounced(runId: string) {
  try {
    return window.localStorage.getItem(ANNOUNCED_RUN_KEY) === runId;
  } catch {
    return false;
  }
}

function markAnnounced(runId: string) {
  try {
    window.localStorage.setItem(ANNOUNCED_RUN_KEY, runId);
  } catch {

  }
}
