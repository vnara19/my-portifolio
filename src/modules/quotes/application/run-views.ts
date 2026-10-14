import { QuoteUpdateStatus, type PrismaClient } from "@/generated/prisma/client";
import type {
  QuoteFailureView,
  QuoteRefreshRunStatus,
  QuoteRefreshRunView,
} from "@/modules/quotes/domain/quote-refresh";
import { toDateKey } from "@/modules/quotes/domain/calendar";


export type QuoteViewer = {
  symbols: Set<string>;

  assetNames: Map<string, string[]>;
};


export async function readQuoteViewer(db: PrismaClient): Promise<QuoteViewer> {
  const [assets, latest] = await Promise.all([
    db.asset.findMany({
      where: { quoteSymbol: { not: null } },
      orderBy: { name: "asc" },
      select: { name: true, quoteSymbol: true, positions: { select: { portfolioMonthId: true } } },
    }),
    db.portfolioMonth.findFirst({ orderBy: { referenceDate: "desc" }, select: { id: true } }),
  ]);
  const symbols = new Set<string>();
  const current = new Map<string, string[]>();
  const all = new Map<string, string[]>();

  for (const asset of assets) {
    const symbol = asset.quoteSymbol!;
    symbols.add(symbol);
    all.set(symbol, [...(all.get(symbol) ?? []), asset.name]);


    if (latest && asset.positions.some((position) => position.portfolioMonthId === latest.id)) {
      current.set(symbol, [...(current.get(symbol) ?? []), asset.name]);
    }
  }

  return {
    symbols,
    assetNames: new Map([...symbols].map((symbol) => [symbol, current.get(symbol) ?? all.get(symbol) ?? []])),
  };
}

type RunRow = {
  id: string;
  status: QuoteRefreshRunStatus;
  quoteDate: Date;
  repricedMonth: Date | null;
  startedAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
};

type ResultRow = {
  symbol: string;
  provider: string;
  status: QuoteUpdateStatus;
  errorCode: string | null;
  errorMessage: string | null;
};


export function runViewFor(run: RunRow, results: ResultRow[], viewer: QuoteViewer): QuoteRefreshRunView {
  const own = results.filter((result) => viewer.symbols.has(result.symbol));
  const failed = own.filter((result) => result.status === QuoteUpdateStatus.FAILED);
  const succeeded = own.filter((result) => result.status === QuoteUpdateStatus.SUCCESS).length;
  const failures: QuoteFailureView[] = failed.map((result) => ({
    symbol: result.symbol,
    assets: viewer.assetNames.get(result.symbol) ?? [],
    provider: result.provider,
    errorCode: result.errorCode ?? "UNKNOWN",
    errorMessage: result.errorMessage ?? "Failure without a description.",
  }));

  return {
    id: run.id,
    status: statusFor(run.status, own.length, failed.length, succeeded),
    quoteDate: toDateKey(run.quoteDate),
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    succeeded,
    failures,


    errorMessage:
      run.status === "FAILED"
        ? run.errorMessage
        : failed.length > 0
          ? `${failed.length} of ${own.length} quotes were not updated.`
          : null,
    repricedMonth: run.repricedMonth ? toDateKey(run.repricedMonth).slice(0, 7) : null,
  };
}

function statusFor(
  status: QuoteRefreshRunStatus,
  own: number,
  failed: number,
  succeeded: number,
): QuoteRefreshRunStatus {
  if (status === "RUNNING" || status === "FAILED") {
    return status;
  }

  if (own === 0 || failed === 0) {
    return "COMPLETED";
  }

  return succeeded === 0 ? "FAILED" : "COMPLETED_WITH_ISSUES";
}
