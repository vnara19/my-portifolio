import type { Prisma } from "@/generated/prisma/client";


type QuoteReader = Pick<Prisma.TransactionClient, "marketQuote" | "manualQuote">;

export type MonthQuoteValue = {
  symbol: string;
  instrumentType: string;
  baseCurrency: string;
  valueBrl: Prisma.Decimal;

  quoteDate: Date | null;

  carriedFrom: Date | null;

  manual: boolean;
};

export type QuoteSeriesPoint = MonthQuoteValue & { referenceDate: Date };


export async function readMonthQuoteValues(
  db: QuoteReader,
  referenceDate: Date,
  symbols?: string[],
): Promise<Map<string, MonthQuoteValue>> {
  const symbolFilter = symbols ? { symbol: { in: symbols } } : {};
  const [shared, manual] = await Promise.all([
    db.marketQuote.findMany({
      where: { referenceDate, ...symbolFilter },
      orderBy: { symbol: "asc" },
      select: {
        symbol: true,
        instrumentType: true,
        baseCurrency: true,
        valueBrl: true,
        quoteDate: true,
        carriedFrom: true,
      },
    }),
    db.manualQuote.findMany({
      where: { referenceDate, ...symbolFilter },
      select: { symbol: true, instrumentType: true, baseCurrency: true, valueBrl: true },
    }),
  ]);
  const values = new Map<string, MonthQuoteValue>();

  for (const quote of shared) {
    values.set(quote.symbol, { ...quote, manual: false });
  }

  for (const quote of manual) {
    values.set(quote.symbol, { ...quote, quoteDate: null, carriedFrom: null, manual: true });
  }

  return values;
}


export async function readQuoteSeries(db: QuoteReader, symbols: string[]): Promise<QuoteSeriesPoint[]> {
  const [shared, manual] = await Promise.all([
    db.marketQuote.findMany({
      where: { symbol: { in: symbols } },
      select: {
        referenceDate: true,
        symbol: true,
        instrumentType: true,
        baseCurrency: true,
        valueBrl: true,
        quoteDate: true,
        carriedFrom: true,
      },
    }),
    db.manualQuote.findMany({
      where: { symbol: { in: symbols } },
      select: { referenceDate: true, symbol: true, instrumentType: true, baseCurrency: true, valueBrl: true },
    }),
  ]);
  const points = new Map<string, QuoteSeriesPoint>();
  const key = (referenceDate: Date, symbol: string) => `${referenceDate.toISOString()}|${symbol}`;

  for (const quote of shared) {
    points.set(key(quote.referenceDate, quote.symbol), { ...quote, manual: false });
  }

  for (const quote of manual) {
    points.set(key(quote.referenceDate, quote.symbol), { ...quote, quoteDate: null, carriedFrom: null, manual: true });
  }

  return [...points.values()].sort(
    (left, right) =>
      left.referenceDate.getTime() - right.referenceDate.getTime() || left.symbol.localeCompare(right.symbol),
  );
}
