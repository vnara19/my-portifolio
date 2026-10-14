import { getPortfolioGains } from "@/modules/portfolio/application/get-portfolio-gains";
import type { PortfolioGains } from "@/modules/portfolio/domain/portfolio-gains";
import { Prisma, type PortfolioMonthStatus } from "@/generated/prisma/client";
import { getUserDb } from "@/lib/user-db";
import { getAllocationOverview } from "@/modules/portfolio/application/get-allocation-overview";
import { ASSET_TYPE_LABELS, assetTypeOf } from "@/modules/portfolio/domain/classification";
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
  date: Date;
  totalBrl: number;
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

  byType: { label: string; valueBrl: number; share: number }[];
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
            allocations: { select: { assetClass: true, weight: true } },
          },
        },
      },
    });

    const requestedIndex = referenceDate
      ? months.findIndex((month) => month.referenceDate.getTime() === referenceDate.getTime())
      : -1;
    const selectedIndex = requestedIndex === -1 ? months.length - 1 : requestedIndex;
    const selected = months[selectedIndex];

    if (!selected || selected.positions.length === 0) {
      return null;
    }

    const history: OverviewHistoryPoint[] = months.map((month) => {
      const byClass: Record<string, number> = {};
      const byCurrency: Record<string, number> = {};
      let total = new Prisma.Decimal(0);

      for (const position of month.positions) {
        total = total.plus(position.totalBrl);
        const currency = position.asset.baseCurrency;
        byCurrency[currency] = (byCurrency[currency] ?? 0) + position.totalBrl.toNumber();

        if (position.allocations.length === 0) {
          byClass["Unclassified"] =
            (byClass["Unclassified"] ?? 0) + position.totalBrl.toNumber();
          continue;
        }

        for (const allocation of position.allocations) {
          const value = position.totalBrl.mul(allocation.weight).toNumber();
          byClass[allocation.assetClass] = (byClass[allocation.assetClass] ?? 0) + value;
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

    const typeTotals = new Map<string, number>();
    for (const position of selected.positions) {
      const label = ASSET_TYPE_LABELS[assetTypeOf(position.asset)];
      typeTotals.set(label, (typeTotals.get(label) ?? 0) + position.totalBrl.toNumber());
    }
    const byType = [...typeTotals.entries()]
      .filter(([, valueBrl]) => valueBrl > 0)
      .map(([label, valueBrl]) => ({
        label,
        valueBrl,
        share: selectedHistory.totalBrl === 0 ? 0 : (valueBrl / selectedHistory.totalBrl) * 100,
      }))
      .sort((left, right) => right.valueBrl - left.valueBrl);

    const quotes = await readMonthQuoteValues(prisma, selected.referenceDate, ["USD", "EUR", "BTC"]);
    let usdRate = quotes.get("USD")?.valueBrl.toNumber() ?? null;
    const btcRate = quotes.get("BTC")?.valueBrl.toNumber() ?? null;

    let eurRate = quotes.get("EUR")?.valueBrl.toNumber() ?? null;
    const fxSeries = await readQuoteSeries(prisma, ["USD", "EUR"]);
    const fxByMonth = new Map<string, Map<string, number>>();
    // Existing backfills may have daily closes without a materialized monthly quote.
    const dailyFx = await prisma.dailyQuote.findMany({
      where: { symbol: { in: ["USD", "EUR"] }, quoteDate: { lt: currentReferenceMonth() } },
      orderBy: { quoteDate: "asc" }, select: { symbol: true, quoteDate: true, valueBrl: true },
    });
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

    const allocation = await getAllocationOverview(selected.referenceDate);

    return {
      referenceDate: selected.referenceDate,
      monthStatus: selected.status,
      totalBrl: selectedHistory.totalBrl,
      totalUsd: usdRate && usdRate !== 0 ? selectedHistory.totalBrl / usdRate : null,
      usdRate,
      btcRate,
      eurRate,
      reporting,
      gains: await getPortfolioGains(selected.referenceDate, usdRate),
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
