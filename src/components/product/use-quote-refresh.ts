"use client";

import { useRouter } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";

import {
  getQuoteRefreshServerState,
  getQuoteRefreshState,
  refreshUnlessEditing,
  subscribeQuoteRefresh,
} from "@/components/product/quote-refresh-client";
import type { QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";
import { describeRefreshTime } from "@/modules/quotes/presentation/refresh-time";

const CLOCK_STEP_MS = 15_000;


export function useQuoteRefresh(serverSummary: QuoteRefreshSummary | null) {
  const router = useRouter();
  const client = useSyncExternalStore(subscribeQuoteRefresh, getQuoteRefreshState, getQuoteRefreshServerState);
  const now = useClock();
  const summary = newestSummary(serverSummary, client.summary);
  const onDataChanged = useCallback(() => refreshUnlessEditing(() => router.refresh()), [router]);

  const time = summary?.lastUpdatedAt && now !== null ? describeRefreshTime(summary.lastUpdatedAt, now) : null;
  const lastRun = summary?.lastRun ?? null;
  const failedSymbols = lastRun?.failures.map((failure) => failure.symbol) ?? [];
  const hasIssues = failedSymbols.length > 0 || lastRun?.status === "FAILED";
  const issueText = hasIssues
    ? failedSymbols.length > 0
      ? `Last attempt failed: ${failedSymbols.join(", ")}`
      : "The last attempt failed"
    : null;

  return { client, now, summary, time, lastRun, hasIssues, issueText, onDataChanged };
}

function newestSummary(server: QuoteRefreshSummary | null, client: QuoteRefreshSummary | null) {
  if (!server) {
    return client;
  }

  if (!client) {
    return server;
  }

  return client.generatedAt > server.generatedAt ? client : server;
}

function subscribeClock(callback: () => void) {
  const timer = window.setInterval(callback, CLOCK_STEP_MS);
  return () => window.clearInterval(timer);
}

function readClock() {
  return Math.floor(Date.now() / CLOCK_STEP_MS) * CLOCK_STEP_MS;
}

function readServerClock() {
  return null;
}


function useClock() {
  return useSyncExternalStore(subscribeClock, readClock, readServerClock);
}
