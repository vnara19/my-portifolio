
/** Updated time means the most recent run that saved a quote for this user, not the most recent idle job invocation. */
import { cache } from "react";

import { Prisma, QuoteRefreshStatus, QuoteUpdateStatus, type PrismaClient } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { getUserDb } from "@/lib/user-db";
import { readQuoteViewer, runViewFor, type QuoteViewer } from "@/modules/quotes/application/run-views";
import type { QuoteRefreshRunView, QuoteRefreshSummary } from "@/modules/quotes/domain/quote-refresh";


export async function getQuoteRefreshSummary(now = new Date()): Promise<QuoteRefreshSummary | null> {
  const prisma = getPrismaClient();
  const userDb = await getUserDb();

  if (!prisma || !userDb) {
    return null;
  }

  try {
    const viewer = await readQuoteViewer(userDb);
    const [lastRun, lastUpdated] = await Promise.all([
      prisma.quoteRefreshRun.findFirst({
        where: visibleRunsFor(viewer),
        orderBy: { startedAt: "desc" },
        select: { id: true },
      }),


      prisma.quoteRefreshRun.findFirst({
        where: {
          status: { in: [QuoteRefreshStatus.COMPLETED, QuoteRefreshStatus.COMPLETED_WITH_ISSUES] },
          results: { some: { status: QuoteUpdateStatus.SUCCESS, symbol: { in: [...viewer.symbols] } } },
        },
        orderBy: { startedAt: "desc" },
        select: { finishedAt: true, startedAt: true },
      }),
    ]);

    return {
      generatedAt: now.toISOString(),
      lastUpdatedAt: lastUpdated ? (lastUpdated.finishedAt ?? lastUpdated.startedAt).toISOString() : null,
      lastRun: lastRun ? await readRunView(prisma, lastRun.id, viewer) : null,
    };
  } catch {
    return null;
  }
}


export const getRequestQuoteRefreshSummary = cache(() => getQuoteRefreshSummary());


export function visibleRunsFor(viewer: QuoteViewer): Prisma.QuoteRefreshRunWhereInput {
  return {
    OR: [
      { results: { some: { symbol: { in: [...viewer.symbols] } } } },
      { status: QuoteRefreshStatus.FAILED, results: { none: {} } },
    ],
  };
}

async function readRunView(
  prisma: PrismaClient,
  runId: string,
  viewer: QuoteViewer,
): Promise<QuoteRefreshRunView | null> {
  const run = await prisma.quoteRefreshRun.findUnique({
    where: { id: runId },
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
  });

  return run ? runViewFor(run, run.results, viewer) : null;
}
