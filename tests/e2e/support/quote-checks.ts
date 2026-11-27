import type { Page, Route } from "@playwright/test";

import type { OpenCheckResponse } from "@/modules/portfolio/domain/month-rollover";
import type { QuoteRefreshRunView, QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";


export const IDLE_OPEN_CHECK: OpenCheckResponse = {
  rollover: { state: "up-to-date", latestMonth: null },
  targetPlan: "existing",
  summary: null,
};

export async function stubQuoteChecks(
  page: Page,
  { openCheck, delayMs = 0 }: { openCheck?: Partial<OpenCheckResponse>; delayMs?: number } = {},
) {
  const openCheckResponse: OpenCheckResponse = { ...IDLE_OPEN_CHECK, ...openCheck };

  await page.route("**/api/quotes/open-check", async (route: Route) => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    await route.fulfill({ json: openCheckResponse });
  });
}

const MINUTE = 60 * 1000;


export function stubRun(overrides: Partial<QuoteRefreshRunView> = {}): QuoteRefreshRunView {
  const startedAt = new Date(Date.now() - 5.5 * MINUTE).toISOString();

  return {
    id: "00000000-0000-4000-8000-000000000001",
    status: "COMPLETED",
    quoteDate: "2026-10-02",
    startedAt,
    finishedAt: startedAt,
    succeeded: 10,
    failures: [],
    errorMessage: null,
    repricedMonth: "2026-10",
    ...overrides,
  };
}


export function stubSummary(lastRun: QuoteRefreshRunView, lastUpdatedAt: string | null): QuoteRefreshSummary {
  return {
    generatedAt: new Date(Date.now() + 24 * 60 * MINUTE).toISOString(),
    lastUpdatedAt,
    lastRun,
  };
}
