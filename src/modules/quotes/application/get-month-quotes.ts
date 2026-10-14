import { Prisma, QuoteUpdateStatus, type PortfolioMonthStatus } from "@/generated/prisma/client";
import { getUserDb } from "@/lib/user-db";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { readMonthQuoteValues } from "@/modules/quotes/application/month-quote-values";
import { readQuoteViewer } from "@/modules/quotes/application/run-views";
import { addMonths, currentReferenceMonth, toDateKey } from "@/modules/quotes/domain/calendar";
import { isQuoteEditable } from "@/modules/quotes/domain/quote-refresh";


export type QuoteLastResult = {
  status: "SUCCESS" | "FAILED";

  source: "update" | "inclusion";
  fetchedAt: string;
  provider: string;
  valueBrl: number | null;
  errorMessage: string | null;
};

export type MonthQuoteRow = {
  symbol: string;
  instrumentType: string | null;
  baseCurrency: string | null;
  valueBrl: number | null;

  valueText: string;

  quoteDate: string | null;


  carriedFrom: string | null;

  manual: boolean;
  assets: string[];

  quantities: number[];
  totalBrl: number;
  lastResult: QuoteLastResult | null;

  editable: boolean;
};

export type MonthQuotesView = {
  id: string;
  month: string;
  referenceDate: Date;
  status: PortfolioMonthStatus;
  isLatest: boolean;

  isLocked: boolean;

  isCurrent: boolean;
  currentMonth: string;
  totalBrl: number;
  quotes: MonthQuoteRow[];
};

export async function getMonthQuotes(referenceDate?: Date): Promise<MonthQuotesView | null> {
  const prisma = await getUserDb();

  if (!prisma) {
    return null;
  }

  try {
    const current = currentReferenceMonth();
    const [month, latest] = await Promise.all([
      prisma.portfolioMonth.findFirst({
        where: referenceDate ? { referenceDate } : undefined,
        orderBy: { referenceDate: "desc" },
        select: {
          id: true,
          referenceDate: true,
          status: true,
          positions: {
            select: {
              quantity: true,
              totalBrl: true,
              asset: { select: { name: true, quoteSymbol: true } },
            },
          },
        },
      }),
      prisma.portfolioMonth.findFirst({ orderBy: { referenceDate: "desc" }, select: { id: true } }),
    ]);

    if (!month) {
      return null;
    }


    const runsInMonth = {
      quoteDate: { gte: month.referenceDate, lt: addMonths(month.referenceDate, 1) },
    } satisfies Prisma.QuoteRefreshRunWhereInput;

    const [stored, viewer, lastResults, inclusions] = await Promise.all([
      readMonthQuoteValues(prisma, month.referenceDate),
      readQuoteViewer(prisma),
      prisma.quoteRefreshResult.findMany({
        where: { run: runsInMonth },
        orderBy: [{ fetchedAt: "desc" }, { id: "desc" }],
        distinct: ["symbol"],
        select: {
          symbol: true,
          status: true,
          provider: true,
          valueBrl: true,
          errorMessage: true,
          fetchedAt: true,
        },
      }),


      prisma.dailyQuote.findMany({
        where: { runId: null, quoteDate: runsInMonth.quoteDate },
        orderBy: { fetchedAt: "desc" },
        distinct: ["symbol"],
        select: { symbol: true, provider: true, valueBrl: true, fetchedAt: true },
      }),
    ]);

    const usage = new Map<string, { assets: Set<string>; quantities: number[]; total: Prisma.Decimal }>();

    for (const position of month.positions) {
      const symbol = position.asset.quoteSymbol;

      if (!symbol) {
        continue;
      }

      const entry = usage.get(symbol) ?? { assets: new Set<string>(), quantities: [], total: new Prisma.Decimal(0) };
      entry.assets.add(position.asset.name);
      entry.quantities.push(position.quantity.toNumber());
      entry.total = entry.total.plus(position.totalBrl);
      usage.set(symbol, entry);
    }

    const lastBySymbol = new Map(lastResults.map((result) => [result.symbol, result]));


    const own = [...stored.values()]
      .filter((quote) => quote.manual || quote.symbol === "USD" || quote.symbol === "EUR" || viewer.symbols.has(quote.symbol))
      .map((quote) => quote.symbol);
    const priority = (symbol: string) => symbol === "USD" ? 0 : symbol === "EUR" ? 1 : 2;
    const symbols = [...new Set(["USD", "EUR", ...own, ...usage.keys()])].sort((left, right) =>
      priority(left) - priority(right) || left.localeCompare(right));
    const assetsOf = (symbol: string) =>
      [...(usage.get(symbol)?.assets ?? [])].sort((left, right) => left.localeCompare(right, "en-GB"));
    const inclusionBySymbol = new Map(inclusions.map((quote) => [quote.symbol, quote]));

    return {
      id: month.id,
      month: toMonthParam(month.referenceDate),
      referenceDate: month.referenceDate,
      status: month.status,
      isLatest: latest?.id === month.id,
      isLocked: month.status !== "DRAFT",
      isCurrent: month.referenceDate.getTime() === current.getTime(),
      currentMonth: toMonthParam(current),
      totalBrl: month.positions
        .reduce((total, position) => total.plus(position.totalBrl), new Prisma.Decimal(0))
        .toNumber(),
      quotes: symbols.map((symbol) => {
        const quote = stored.get(symbol);
        const used = usage.get(symbol);
        const last = lastBySymbol.get(symbol);
        const inclusion = last ? undefined : inclusionBySymbol.get(symbol);
        const lastResult: QuoteLastResult | null = last
          ? {
              status: last.status === QuoteUpdateStatus.SUCCESS ? "SUCCESS" : "FAILED",
              source: "update",
              fetchedAt: last.fetchedAt.toISOString(),
              provider: last.provider,
              valueBrl: last.valueBrl?.toNumber() ?? null,
              errorMessage: last.errorMessage,
            }
          : inclusion
            ? {
                status: "SUCCESS",
                source: "inclusion",
                fetchedAt: inclusion.fetchedAt.toISOString(),
                provider: inclusion.provider,
                valueBrl: inclusion.valueBrl.toNumber(),
                errorMessage: null,
              }
            : null;

        return {
          symbol,
          instrumentType: quote?.instrumentType ?? (symbol === "USD" || symbol === "EUR" ? "FIAT" : null),
          baseCurrency: quote?.baseCurrency ?? (symbol === "USD" || symbol === "EUR" ? symbol : null),
          valueBrl: quote?.valueBrl.toNumber() ?? null,
          valueText: quote?.valueBrl.toString() ?? "",
          quoteDate: quote?.quoteDate ? toDateKey(quote.quoteDate) : null,
          carriedFrom: quote?.carriedFrom ? toMonthParam(quote.carriedFrom) : null,
          manual: quote?.manual ?? false,
          assets: assetsOf(symbol),
          quantities: used?.quantities ?? [],
          totalBrl: used?.total.toNumber() ?? 0,
          lastResult,


          editable:
            quote?.manual === true ||
            isQuoteEditable({
              hasValue: quote !== undefined,
              carried: Boolean(quote?.carriedFrom),
              lastFailed: lastResult?.status === "FAILED",
            }),
        };
      }),
    };
  } catch (error) {
    console.error("Could not load quotes for the reporting month.", error);
    return null;
  }
}
