import { Prisma, type PortfolioMonthStatus } from "@/generated/prisma/client";
import { getUserDb } from "@/lib/user-db";
import { assetTypeOf, type AssetType } from "@/modules/portfolio/domain/classification";
import { readMonthQuoteValues } from "@/modules/quotes/application/month-quote-values";
import { calendarDay, currentReferenceMonth, lastDayOf, toDateKey } from "@/modules/quotes/domain/calendar";

export type MonthPositionAllocation = {
  assetClass: string;
  subclass: string;
  duration: string;
  weight: number;

  ratePercent?: number | null;
};

export type MonthPosition = {
  id: string;
  accountId: string;
  assetId: string;
  assetName: string;
  ticker: string | null;
  quoteSymbol: string | null;
  institutionName: string;
  accountName: string;
  strategy: string | null;
  baseCurrency: string;

  maturityDate: string | null;

  liquidity: string | null;

  cashAccount: boolean;

  assetType: AssetType;

  assetTypeInferred: boolean;

  fixedIncomeEstimate?: boolean;
  autoIncome?: boolean;
  appliedOn?: string | null;
  calculationStartDate?: string | null;
  calculatedIncomeBrl?: number;
  incomeCalculatedThrough?: string | null;
  incomeCalculationError?: string | null;
  quantity: number;
  quantityText: string;


  liquidated: boolean;
  unitPriceBrl: number | null;
  totalBrl: number;
  totalUsd: number | null;
  share: number;
  allocations: MonthPositionAllocation[];
};

export type MonthQuote = {
  symbol: string;
  valueBrl: number | null;
  valueText: string;
  positionCount: number;
};

export type MonthPositions = {
  id: string;
  referenceDate: Date;
  status: PortfolioMonthStatus;
  isLatest: boolean;

  isLocked: boolean;

  isCurrent: boolean;


  referenceDay: string;
  totalBrl: number;
  usdRate: number | null;
  quotes: MonthQuote[];
  positions: MonthPosition[];
};

export async function getMonthPositions(
  referenceDate?: Date,
): Promise<MonthPositions | null> {
  const prisma = await getUserDb();

  if (!prisma) {
    return null;
  }

  try {
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
              id: true,
              accountId: true,
              assetId: true,
              quantity: true,
              calculationStartDate: true,
              calculatedIncomeBrl: true,
              incomeCalculatedThrough: true,
              incomeCalculationError: true,
              unitPriceBrl: true,
              totalBrl: true,
              strategy: true,
              asset: {
                select: {
                  name: true,
                  ticker: true,
                  quoteSymbol: true,
                  baseCurrency: true,
                  maturityDate: true,
                  liquidity: true,
                  cashAccount: true,
                  fixedIncomeContract: true,
                  autoIncome: true,
                  appliedOn: true,
                  assetType: true,
                },
              },
              account: {
                select: { name: true, institution: { select: { name: true } } },
              },
              allocations: {
                select: { assetClass: true, subclass: true, duration: true, weight: true, ratePercent: true },
              },
            },
          },
        },
      }),
      prisma.portfolioMonth.findFirst({
        orderBy: { referenceDate: "desc" },
        select: { id: true },
      }),
    ]);

    if (!month) {
      return null;
    }


    const storedQuotes = await readMonthQuoteValues(prisma, month.referenceDate);
    const quoteBySymbol = new Map([...storedQuotes].map(([symbol, quote]) => [symbol, quote.valueBrl]));
    const usdRate = quoteBySymbol.get("USD")?.toNumber() ?? null;
    const totalBrl = month.positions
      .reduce((total, position) => total.plus(position.totalBrl), new Prisma.Decimal(0))
      .toNumber();

    const usage = new Map<string, number>();
    for (const position of month.positions) {
      const symbol = position.asset.quoteSymbol;
      if (symbol) {
        usage.set(symbol, (usage.get(symbol) ?? 0) + 1);
      }
    }
    const symbols = [...new Set([...quoteBySymbol.keys(), ...usage.keys()])].sort((left, right) =>
      left === "USD" ? -1 : right === "USD" ? 1 : left.localeCompare(right),
    );

    const today = calendarDay(new Date());
    const lastDay = lastDayOf(month.referenceDate);

    return {
      id: month.id,
      referenceDate: month.referenceDate,
      status: month.status,
      isLatest: latest?.id === month.id,
      isLocked: month.status !== "DRAFT",
      isCurrent: month.referenceDate.getTime() === currentReferenceMonth().getTime(),
      referenceDay: toDateKey(today.getTime() < lastDay.getTime() ? today : lastDay),
      totalBrl,
      usdRate,
      quotes: symbols.map((symbol) => {
        const stored = quoteBySymbol.get(symbol);

        return {
          symbol,
          valueBrl: stored?.toNumber() ?? null,
          valueText: stored?.toString() ?? "",
          positionCount: usage.get(symbol) ?? 0,
        };
      }),
      positions: month.positions
        .map((position) => {
          const positionTotal = position.totalBrl.toNumber();

          return {
            id: position.id,
            accountId: position.accountId,
            assetId: position.assetId,
            assetName: position.asset.name,
            ticker: position.asset.ticker,
            quoteSymbol: position.asset.quoteSymbol,
            institutionName: position.account.institution.name,
            accountName: position.account.name,
            strategy: position.strategy,
            baseCurrency: position.asset.baseCurrency,
            maturityDate: position.asset.maturityDate ? toDateKey(position.asset.maturityDate) : null,
            liquidity: position.asset.liquidity,
            cashAccount: position.asset.cashAccount,
            assetType: assetTypeOf(position.asset),
            assetTypeInferred: position.asset.assetType === null,
            fixedIncomeEstimate: Boolean(position.asset.autoIncome && position.allocations.some((allocation) => allocation.subclass === "IPCA")),
            autoIncome: position.asset.autoIncome,
            appliedOn: position.asset.appliedOn ? toDateKey(position.asset.appliedOn) : null,
            calculationStartDate: position.calculationStartDate ? toDateKey(position.calculationStartDate) : null,
            calculatedIncomeBrl: position.calculatedIncomeBrl.toNumber(),
            incomeCalculatedThrough: position.incomeCalculatedThrough ? toDateKey(position.incomeCalculatedThrough) : null,
            incomeCalculationError: position.incomeCalculationError,
            quantity: position.quantity.toNumber(),
            quantityText: position.quantity.toString(),
            liquidated: !position.quantity.greaterThan(0),
            unitPriceBrl: position.unitPriceBrl ? position.unitPriceBrl.toNumber() : null,
            totalBrl: positionTotal,
            totalUsd: usdRate === null || usdRate === 0 ? null : positionTotal / usdRate,
            share: totalBrl === 0 ? 0 : (positionTotal / totalBrl) * 100,
            allocations: position.allocations.map((allocation) => ({
              assetClass: allocation.assetClass,
              subclass: allocation.subclass,
              duration: allocation.duration,
              weight: allocation.weight.mul(100).toNumber(),
              ratePercent: allocation.ratePercent?.toNumber() ?? null,
            })),
          };
        })
        .sort((left, right) => right.totalBrl - left.totalBrl),
    };
  } catch {
    return null;
  }
}
