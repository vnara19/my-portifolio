
/** Current prices become due after 50 minutes. History failures retry after 24 hours; repeated quote failures back off for 1, 2, 4 and at most 6 hours. */

// Apply retry backoff after network failures.

import { addMonths, lastDayOf, toDateKey } from "@/modules/quotes/domain/calendar";
import { HISTORY_BACKFILL_MONTHS } from "@/modules/quotes/domain/history-backfill";


export const QUOTE_DUE_AFTER_MS = 50 * 60 * 1000;

export const HISTORY_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
export const MAX_QUOTES_PER_RUN = 150;
export const MAX_HISTORIES_PER_RUN = 10;

const MAX_BACKOFF_HOURS = 6;

const CLOSING_TOLERANCE_DAYS = 7;


export function backoffUntil(now: Date, failures: number) {
  const hours = Math.min(2 ** Math.max(0, failures - 1), MAX_BACKOFF_HOURS);
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

export function isQuoteDue(
  symbol: { lastSuccessAt: Date | null; nextAttemptAt: Date | null },
  now: Date,
) {
  if (symbol.nextAttemptAt && symbol.nextAttemptAt > now) {
    return false;
  }

  return !symbol.lastSuccessAt || now.getTime() - symbol.lastSuccessAt.getTime() >= QUOTE_DUE_AFTER_MS;
}


export function isHistoryDue(
  symbol: { historySyncedUntil: Date | null; historyAttemptedAt: Date | null; historyError: string | null },
  currentMonth: Date,
  now: Date,
) {
  const previousMonth = addMonths(currentMonth, -1);

  if (symbol.historySyncedUntil && symbol.historySyncedUntil >= previousMonth) {
    return false;
  }

  return !(
    symbol.historyError &&
    symbol.historyAttemptedAt &&
    now.getTime() - symbol.historyAttemptedAt.getTime() < HISTORY_RETRY_AFTER_MS
  );
}


export function missingClosingMonths({
  currentMonth,
  syncedUntil,
  closingDays,
}: {
  currentMonth: Date;
  syncedUntil: Date | null;
  closingDays: Map<string, string>;
}) {
  const windowStart = addMonths(currentMonth, -HISTORY_BACKFILL_MONTHS);
  let month = syncedUntil && syncedUntil >= windowStart ? addMonths(syncedUntil, 1) : windowStart;
  const missing: string[] = [];

  while (month < currentMonth) {
    const key = toDateKey(month).slice(0, 7);
    const lastDay = lastDayOf(month);
    const threshold = toDateKey(new Date(lastDay.getTime() - (CLOSING_TOLERANCE_DAYS - 1) * 24 * 60 * 60 * 1000));
    const latest = closingDays.get(key);

    if (!latest || latest < threshold) {
      missing.push(key);
    }

    month = addMonths(month, 1);
  }

  return missing;
}
