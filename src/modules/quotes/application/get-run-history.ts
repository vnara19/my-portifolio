import { getPrismaClient } from "@/lib/prisma";
import { getUserDb } from "@/lib/user-db";
import { visibleRunsFor } from "@/modules/quotes/application/quote-refresh-summary";
import { readQuoteViewer, runViewFor } from "@/modules/quotes/application/run-views";
import { addMonths } from "@/modules/quotes/domain/calendar";
import { type QuoteFailureView, type QuoteRefreshRunStatus } from "@/modules/quotes/domain/quote-refresh";


// (spec 051).

export type QuoteRunHistoryStatus = QuoteRefreshRunStatus;

export type QuoteRunHistoryEntry = {
  id: string;
  status: QuoteRunHistoryStatus;

  at: string;
  succeeded: number;
  failures: QuoteFailureView[];
  errorMessage: string | null;
};

export type QuoteRunHistoryPage = {
  runs: QuoteRunHistoryEntry[];
  total: number;

  nextCursor: string | null;
};

export const RUN_HISTORY_PAGE_SIZE = 30;

export async function getRunHistory(referenceDate: Date, before?: string): Promise<QuoteRunHistoryPage | null> {
  const prisma = getPrismaClient();
  const userDb = await getUserDb();

  if (!prisma || !userDb) {
    return null;
  }

  const inMonth = { gte: referenceDate, lt: addMonths(referenceDate, 1) };
  const cursor = before ? new Date(before) : null;

  if (cursor && Number.isNaN(cursor.getTime())) {
    return null;
  }

  try {

    const viewer = await readQuoteViewer(userDb);
    const visible = visibleRunsFor(viewer);
    const [runs, total] = await Promise.all([
      prisma.quoteRefreshRun.findMany({
        where: { quoteDate: inMonth, ...visible, ...(cursor ? { startedAt: { lt: cursor } } : {}) },
        orderBy: { startedAt: "desc" },
        take: RUN_HISTORY_PAGE_SIZE + 1,
        select: {
          id: true,
          status: true,
          quoteDate: true,
          repricedMonth: true,
          startedAt: true,
          finishedAt: true,
          errorMessage: true,
          results: {
            orderBy: { symbol: "asc" },
            select: { symbol: true, provider: true, status: true, errorCode: true, errorMessage: true },
          },
        },
      }),
      prisma.quoteRefreshRun.count({ where: { quoteDate: inMonth, ...visible } }),
    ]);

    const entries: QuoteRunHistoryEntry[] = runs.map((run) => {
      const view = runViewFor(run, run.results, viewer);

      return {
        id: view.id,
        status: view.status,
        at: view.startedAt,
        succeeded: view.succeeded,
        failures: view.failures,
        errorMessage: view.errorMessage,
      };
    });

    const page = entries.slice(0, RUN_HISTORY_PAGE_SIZE);

    return {
      runs: page,
      total,
      nextCursor: entries.length > RUN_HISTORY_PAGE_SIZE ? page.at(-1)!.at : null,
    };
  } catch (error) {
    console.error("Could not load the execution history.", error);
    return null;
  }
}
