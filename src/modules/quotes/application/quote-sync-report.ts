import type { CdiReport } from "@/modules/portfolio/application/cdi-positions";
import type { SelicSyncReport } from "@/modules/quotes/application/selic-reference";
import type { QuoteSyncOutcome } from "@/modules/quotes/application/sync-quotes";


// Avoid counting the same result twice.
export function describeQuoteSync(outcome: QuoteSyncOutcome): string[] {
  switch (outcome.state) {
    case "idle":
      return ["Quotes are up to date: no symbols are due.", ...describeSelic(outcome.selic), ...describeCdi(outcome.cdi)];
    case "busy":
      return [`Another execution is in progress (${outcome.runId}).`];
    case "unavailable":
      return [`Job unavailable: ${outcome.message}`];
    case "done":
      return [
        `Execution ${outcome.runId}: ${outcome.status}.`,
        ...(outcome.succeeded.length > 0
          ? [`Quotes updated (${outcome.succeeded.length}): ${outcome.succeeded.join(", ")}.`]
          : []),
        ...outcome.failed.map((failure) => `Failed for ${failure.symbol} (${failure.errorCode}): ${failure.errorMessage}`),
        ...outcome.histories.map((report) =>
          report.status === "FAILED"
            ? `History for ${report.symbol}: falhou: ${report.message}`
            : report.status === "UP_TO_DATE"
              ? `History for ${report.symbol}: already complete.`
              : `History for ${report.symbol} (${report.provider}): ${report.months} months saved.`,
        ),
        ...describeSelic(outcome.selic),
        ...describeCdi(outcome.cdi),
      ];
  }
}


export function isQuoteSyncFailure(outcome: QuoteSyncOutcome) {
  return outcome.state === "unavailable" ||
    (outcome.state === "done" && outcome.status === "FAILED") ||
    ((outcome.state === "done" || outcome.state === "idle") && outcome.selic?.state === "failed");
}

function describeSelic(report: SelicSyncReport | undefined): string[] {
  if (!report) {
    return [];
  }

  return [report.state === "failed"
    ? `Selic: failed to fetch the target from Banco Central: ${report.message}`
    : report.state === "fetched"
      ? `Selic: target updated, reference date ${report.observedOn ?? "—"}.`
      : `Selic: daily check is up to date, reference date ${report.observedOn ?? "—"}.`];
}

function describeCdi(report: CdiReport | undefined): string[] {
  if (!report || (report.rates.state === "skipped" && report.valued === 0 && report.failed.length === 0)) {
    return [];
  }

  const rates =
    report.rates.state === "failed"
      ? `CDI: failed to fetch data from Banco Central: ${report.rates.message}`
      : report.rates.state === "fetched"
        ? `CDI: ${report.rates.inserted} new rates, checked through ${report.rates.through ?? "—"}.`
        : report.rates.state === "fresh"
          ? `CDI: rates are up to date, checked through ${report.rates.through ?? "—"}.`
          : null;

  return [
    ...(rates ? [rates] : []),
    `Automatic accrual: ${report.valued} positions recalculated.`,
    ...report.failed.map((failure) => `Automatic accrual: position ${failure.positionId} not calculated: ${failure.message}`),
  ];
}
