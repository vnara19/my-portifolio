import { getMonthPositions } from "./get-month-positions";
import { exposureCurrency } from "../presentation/position-display";
import { getPortfolioGains } from "@/modules/portfolio/application/get-portfolio-gains";
import type { PortfolioGains } from "@/modules/portfolio/domain/portfolio-gains";
import { Prisma, type PortfolioMonthStatus } from "@/generated/prisma/client";
import { getUserDb } from "@/lib/user-db";
import { getAllocationOverview } from "@/modules/portfolio/application/get-allocation-overview";
import { assetTypeOf } from "@/modules/portfolio/domain/classification";
import {
  buildFixedIncomeDuration,
  type FixedIncomeDuration,
} from "@/modules/portfolio/domain/fixed-income-duration";
import {
  DEFAULT_REBALANCE_TOLERANCE,
  type AllocationGroup,
} from "@/modules/portfolio/domain/rebalance";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { readMonthQuoteValues, readQuoteSeries } from "@/modules/quotes/application/month-quote-values";
import { addMonths, currentReferenceMonth } from "@/modules/quotes/domain/calendar";


import { reportingAmounts, reportingChange, type ReportingAmounts, type ReportingChange } from "@/modules/portfolio/domain/reporting-currency";

export const PERIOD_START = new Date(Date.UTC(2023, 9, 1));

export type OverviewHistoryPoint = {
  month: string;
  day?: string;
  date: Date;
  totalBrl: number;
  totalUsd?: number | null;
  byClassUsd?: Record<string, number>;
  byCurrencyUsd?: Record<string, number>;
  byClass: Record<string, number>;
  byCurrency: Record<string, number>;
};

export type OverviewData = {
  referenceDate: Date;
  monthStatus: PortfolioMonthStatus;
  totalBrl: number;
  totalUsd: number | null;
  usdRate: number | null;
  btcRate: number | null;
  eurRate: number | null;
  gains: PortfolioGains;
  gainsEur?: PortfolioGains;
  reporting: { total: ReportingAmounts; monthly: ReportingChange; annual: ReportingChange; allTime: ReportingChange };
  changeBrl: number | null;
  changePercent: number | null;

  previousMonth: Date | null;
  previousMissing: boolean;
  change12mBrl: number | null;
  change12mPercent: number | null;
  yearAgoMonth: Date;
  yearAgoMissing: boolean;
  periodStart: Date;

  beforePeriodStart: boolean;
  changeSinceStartBrl: number | null;
  changeSinceStartPercent: number | null;
  positionCount: number;
  institutionCount: number;
  offTargetTolerance: number;
  history: OverviewHistoryPoint[];

  byType: { label: string; valueBrl: number; valueUsd?: number | null; share: number }[];
  rebalanceGroups: AllocationGroup[];
  fixedIncomeDuration: FixedIncomeDuration;
  classLabels: string[];
  currencyLabels: string[];
};

export async function getOverviewData(referenceDate?: Date): Promise<OverviewData | null> {
  const prisma = await getUserDb();

  if (!prisma) {
    return null;
  }

  try {
    const months = await prisma.portfolioMonth.findMany({
      orderBy: { referenceDate: "asc" },
      select: {
        referenceDate: true,
        status: true,

        positions: {
          where: { quantity: { gt: 0 } },
          select: {
            totalBrl: true,
            asset: { select: { baseCurrency: true, assetType: true, quoteSymbol: true, name: true, cashAccount: true } },
            account: { select: { institutionId: true } },
            allocations: { select: { assetClass: true, subclass: true, weight: true } },
          },
        },
      },
    });

    const requestedIndex = referenceDate
      ? months.findIndex((month) => month.referenceDate.getTime() === referenceDate.getTime())
      : -1;
    const selectedIndex = requestedIndex === -1 ? months.length - 1 : requestedIndex;
    const selected = months[selectedIndex];

    if (!selected) return null;
    if (!months.some((month) => month.positions.length > 0) && !(await prisma.positionTransaction.findFirst({ select: { id: true } }))) return null;

    const history: OverviewHistoryPoint[] = months.map((month) => {
      const byClass: Record<string, number> = {};
      const byCurrency: Record<string, number> = {};
      let total = new Prisma.Decimal(0);

      for (const position of month.positions) {
        total = total.plus(position.totalBrl);
        const currency = exposureCurrency(assetTypeOf(position.asset), position.asset.baseCurrency);
        byCurrency[currency] = (byCurrency[currency] ?? 0) + position.totalBrl.toNumber();

        if (position.allocations.length === 0) {
          byClass["Unclassified"] =
            (byClass["Unclassified"] ?? 0) + position.totalBrl.toNumber();
          continue;
        }

        for (const allocation of position.allocations) {
          const value = position.totalBrl.mul(allocation.weight).toNumber();
          const label = allocation.subclass === "Stablecoin" ? "Cripto" : allocation.assetClass;
          byClass[label] = (byClass[label] ?? 0) + value;
        }
      }

      return {
        month: toMonthParam(month.referenceDate),
        date: month.referenceDate,
        totalBrl: total.toNumber(),
        byClass,
        byCurrency,
      };
    });


    const selectedHistory = history[selectedIndex];
    const byTime = new Map(history.map((point) => [point.date.getTime(), point]));
    const previousMonth = addMonths(selected.referenceDate, -1);
    const yearAgoMonth = addMonths(selected.referenceDate, -12);
    const previousHistory = byTime.get(previousMonth.getTime()) ?? null;
    const yearAgoHistory = byTime.get(yearAgoMonth.getTime()) ?? null;
    const firstHistory = history.find((point) => point.date.getTime() >= PERIOD_START.getTime()) ?? history[0];
    const beforePeriodStart = selected.referenceDate.getTime() < firstHistory.date.getTime();
    const changeBrl = previousHistory ? selectedHistory.totalBrl - previousHistory.totalBrl : null;
    const change12mBrl = yearAgoHistory ? selectedHistory.totalBrl - yearAgoHistory.totalBrl : null;
    const changeSinceStartBrl =
      selected.referenceDate.getTime() > firstHistory.date.getTime()
        ? selectedHistory.totalBrl - firstHistory.totalBrl
        : null;

    // Independent quote reads share one network wait instead of three round trips.
    const [quotes, fxSeries, dailyFx] = await Promise.all([
      readMonthQuoteValues(prisma, selected.referenceDate, ["USD", "EUR", "BTC"]),
      readQuoteSeries(prisma, ["USD", "EUR"]),
      prisma.dailyQuote.findMany({
        where: { symbol: { in: ["USD", "EUR"] }, quoteDate: { lt: currentReferenceMonth() } },
        orderBy: { quoteDate: "asc" }, select: { symbol: true, quoteDate: true, valueBrl: true },
      }),
    ]);
    let usdRate = quotes.get("USD")?.valueBrl.toNumber() ?? null;
    const btcRate = quotes.get("BTC")?.valueBrl.toNumber() ?? null;

    let eurRate = quotes.get("EUR")?.valueBrl.toNumber() ?? null;
    const fxByMonth = new Map<string, Map<string, number>>();
    // Existing backfills may have daily closes without a materialized monthly quote.
    for (const quote of dailyFx) {
      const key = quote.quoteDate.toISOString().slice(0, 7);
      const rates = fxByMonth.get(key) ?? new Map<string, number>();
      rates.set(quote.symbol, quote.valueBrl.toNumber());
      fxByMonth.set(key, rates);
    }
    for (const quote of fxSeries) {
      if (quote.carriedFrom !== null) continue;
      const key = toMonthParam(quote.referenceDate);
      const rates = fxByMonth.get(key) ?? new Map<string, number>();
      rates.set(quote.symbol, quote.valueBrl.toNumber());
      fxByMonth.set(key, rates);
    }
    const amountsFor = (point: OverviewHistoryPoint | null) => {
      if (!point) return null;
      const rates = fxByMonth.get(point.month);
      return reportingAmounts(point.totalBrl, rates?.get("USD") ?? null, rates?.get("EUR") ?? null);
    };
    const selectedFx = fxByMonth.get(selectedHistory.month);
    usdRate ??= selectedFx?.get("USD") ?? null;
    eurRate ??= selectedFx?.get("EUR") ?? null;
    const reportingTotal = reportingAmounts(selectedHistory.totalBrl, usdRate, eurRate);
    const reporting = {
      total: reportingTotal,
      monthly: reportingChange(reportingTotal, amountsFor(previousHistory)),
      annual: reportingChange(reportingTotal, amountsFor(yearAgoHistory)),
      allTime: reportingChange(reportingTotal, selected.referenceDate > firstHistory.date ? amountsFor(firstHistory) : null),
    };

    for (const point of history) {
      const monthEnd = new Date(Date.UTC(point.date.getUTCFullYear(),point.date.getUTCMonth()+1,0)).toISOString().slice(0,10);
      const today = new Date().toISOString().slice(0,10);
      point.day = monthEnd < today ? monthEnd : fxSeries.find(q=>q.symbol==="USD"&&toMonthParam(q.referenceDate)===point.month)?.quoteDate?.toISOString().slice(0,10) ?? today;
      const rate = point.month === selectedHistory.month ? usdRate : fxByMonth.get(point.month)?.get("USD");
      point.totalUsd = rate && rate > 0 ? point.totalBrl / rate : null;
      point.byClassUsd = rate && rate > 0 ? Object.fromEntries(Object.entries(point.byClass).map(([key,value])=>[key,value/rate])) : {};
      point.byCurrencyUsd = rate && rate > 0 ? Object.fromEntries(Object.entries(point.byCurrency).map(([key,value])=>[key,value/rate])) : {};
    }
    // Use precisely the same product resolver as the Positions table.
    const positionsView = await getMonthPositions(selected.referenceDate);
    const typeTotals = new Map<string, number>();
    for (const position of positionsView?.positions ?? []) {
      if (position.liquidated || position.totalBrl <= 0) continue;
      const label = position.productType || "Unclassified";
      typeTotals.set(label, (typeTotals.get(label) ?? 0) + position.totalBrl);
    }
    const byType = [...typeTotals].map(([label,valueBrl])=>({label,valueBrl,
      valueUsd: usdRate && usdRate > 0 ? valueBrl/usdRate : null,
      share: selectedHistory.totalBrl > 0 ? valueBrl/selectedHistory.totalBrl*100 : 0,
    })).sort((a,b)=>b.valueBrl-a.valueBrl);

    const [allocation, gains, gainsEur] = await Promise.all([
      getAllocationOverview(selected.referenceDate),
      getPortfolioGains(selected.referenceDate, usdRate),
      getPortfolioGains(selected.referenceDate, eurRate, "EUR"),
    ]);

    return {
      referenceDate: selected.referenceDate,
      monthStatus: selected.status,
      totalBrl: selectedHistory.totalBrl,
      totalUsd: usdRate && usdRate !== 0 ? selectedHistory.totalBrl / usdRate : null,
      usdRate,
      btcRate,
      eurRate,
      reporting,
      gains,
      gainsEur,
      changeBrl,
      changePercent:
        changeBrl === null || !previousHistory || previousHistory.totalBrl === 0
          ? null
          : (changeBrl / previousHistory.totalBrl) * 100,
      previousMonth: selectedIndex > 0 ? previousMonth : null,
      previousMissing: selectedIndex > 0 && !previousHistory,
      change12mBrl,
      change12mPercent:
        change12mBrl === null || !yearAgoHistory || yearAgoHistory.totalBrl === 0
          ? null
          : (change12mBrl / yearAgoHistory.totalBrl) * 100,
      yearAgoMonth,
      yearAgoMissing: !yearAgoHistory && yearAgoMonth.getTime() >= history[0].date.getTime(),
      periodStart: firstHistory.date,
      beforePeriodStart,
      changeSinceStartBrl,
      changeSinceStartPercent:
        changeSinceStartBrl === null || firstHistory.totalBrl === 0
          ? null
          : (changeSinceStartBrl / firstHistory.totalBrl) * 100,
      positionCount: selected.positions.length,
      institutionCount: new Set(
        selected.positions.map((position) => position.account.institutionId),
      ).size,
      offTargetTolerance: allocation?.tolerance ?? DEFAULT_REBALANCE_TOLERANCE,
      history,
      byType,
      rebalanceGroups: allocation?.groups ?? [],
      fixedIncomeDuration: buildFixedIncomeDuration(
        allocation?.aggregates.fixedIncome ?? [],
        allocation?.targets ?? [],
      ),
      classLabels: collectLabels(history, "byClass"),
      currencyLabels: collectLabels(history, "byCurrency"),
    };
  } catch {
    return null;
  }
}

function collectLabels(history: OverviewHistoryPoint[], key: "byClass" | "byCurrency") {
  const totals = new Map<string, number>();

  for (const point of history) {
    for (const [label, value] of Object.entries(point[key])) {
      totals.set(label, (totals.get(label) ?? 0) + value);
    }
  }

  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([label]) => label);
}
