import { readSavings, type Savings, type SavingsCalculation } from "../domain/savings";
import { savingsState } from "./savings";
import { readInternationalBond, type InternationalBond } from "../domain/international-bond";

/** Assemble user-scoped position, cost and transaction history without contacting market-data providers. */
import { readFixedIncomeContract, type BrazilianFixedIncome } from "@/modules/portfolio/domain/brazilian-fixed-income";
import { Prisma, type PortfolioMonthStatus } from "@/generated/prisma/client";
import { getUserDb } from "@/lib/user-db";
import { readMonthQuoteValues, readQuoteSeries } from "@/modules/quotes/application/month-quote-values";
import type { PortfolioMonthSummary } from "@/modules/portfolio/application/get-portfolio-months";
import {
  buildHistorySlots,
  monthKey,
  summarizeHistory,
  type HistorySlot,
  type PositionObservation,
  type PositionSummary,
} from "@/modules/portfolio/domain/position-history";
import { calendarDay, lastDayOf, toDateKey } from "@/modules/quotes/domain/calendar";
import { buildPriceHistory, type PriceHistory } from "@/modules/quotes/domain/price-history";
import { emptyRecordedMonth, recordedByMonth } from "@/modules/portfolio/domain/position-transactions";
import { autoIncomeParts, indexerOfSubclass, type AutoIncomeIndexer } from "@/modules/portfolio/domain/fixed-income-policy";
import { businessDaysBetween } from "@/modules/portfolio/domain/business-days";


export type PositionScopeView = {
  slots: HistorySlot[];
  summary: PositionSummary;
  transactions: PositionTransactionView[];
};

export type OtherAccountHolding = {
  accountId: string;
  label: string;
  firstMonth: string;
  lastMonth: string;
  months: number;
};

export type PositionHistoryView = {
  accountId: string;
  assetId: string;
  assetName: string;
  ticker: string | null;
  quoteSymbol: string | null;
  baseCurrency: string;

  maturityDate: string | null;

  liquidity: string | null;
  selectedMonth: string;
  monthStatus: PortfolioMonthStatus;

  referenceDay: string;

  usdRate: number | null;

  classTotals: Record<string, number>;
  otherAccounts: OtherAccountHolding[];
  account: PositionScopeView;

  all: PositionScopeView | null;
  prices: PriceHistory | null;


  history: { state: "ready" | "pending" | "failed"; error: string | null } | null;

  transactions: PositionTransactionView[];

  savings?: { terms: Savings; state: SavingsCalculation | null; error?: string };
  bond?: InternationalBond | null;
  cdi: CdiView | null;

  rate: { parts: RatePart[]; automatic: boolean } | null;
};


export type RatePart = { indexer: AutoIncomeIndexer; percent: number; weight: number };

export type CdiView = {
  contract?: BrazilianFixedIncome | null;
  inflationThrough?: string | null;
  parts: RatePart[];

  start: string;
  baseBrl: number;

  incomeBrl: number;
  balanceBrl: number;

  through: string | null;
  error: string | null;

  projection: { until: string; businessDays: number; balanceBrl: number; dailyPercent: number; toMaturity: boolean } | null;
};

export type PositionTransactionView = {
  id: string;
  accountId: string;
  accountLabel: string;
  kind: "OPENING" | "CONTRIBUTION" | "WITHDRAWAL" | "INCOME";

  transferId: string | null;
  /** YYYY-MM-DD */
  occurredOn: string;
  quantity: number;
  unitPriceBrl: number | null;
  amountBrl: number;
  note: string | null;

  monthId: string;
  /** YYYY-MM */
  month: string;


  automatic?: boolean;
  locked?: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPositionHistory({
  accountId,
  assetId,
  months,
  selected,
}: {
  accountId: string;
  assetId: string;
  months: PortfolioMonthSummary[];
  selected: PortfolioMonthSummary | null;
}): Promise<PositionHistoryView | null> {
  const prisma = await getUserDb();

  if (!prisma || !selected || !UUID.test(accountId) || !UUID.test(assetId)) {
    return null;
  }

  try {
    const [asset, account, positions, classRows] = await Promise.all([
      prisma.asset.findUnique({
        where: { id: assetId },
        select: {
          name: true,
          fixedIncomeContract: true,
          ticker: true,
          quoteSymbol: true,
          baseCurrency: true,
          maturityDate: true,
          liquidity: true,
          autoIncome: true,
        },
      }),
      prisma.account.findUnique({
        where: { id: accountId },
        select: { id: true },
      }),
      prisma.position.findMany({
        where: { assetId },
        select: {
          id: true,
          accountId: true,
          portfolioMonthId: true,
          openingQuantity: true,
          calculationStartDate: true,
          calculatedIncomeBrl: true,
          incomeCalculatedThrough: true,
          quantity: true,
          unitPriceBrl: true,
          totalBrl: true,
          strategy: true,
          portfolioMonth: { select: { referenceDate: true } },
          allocations: { select: { assetClass: true, subclass: true, duration: true, weight: true, ratePercent: true } },
        },
      }),
      prisma.positionAllocation.findMany({
        where: { position: { portfolioMonthId: selected.id } },
        select: { assetClass: true, weight: true, position: { select: { totalBrl: true } } },
      }),
    ]);

    if (!asset || !account || !positions.some((position) => position.accountId === accountId)) {
      return null;
    }


    const accountIds = [...new Set(positions.map((position) => position.accountId))].sort();
    const positionLabel = (id: string) => `Position ${accountIds.indexOf(id) + 1}`;
    const transactions = [...(await readTransactions(assetId)), ...automaticIncome(positions)].map((entry) => ({ ...entry, accountLabel: positionLabel(entry.accountId) })).sort(
      (left, right) => right.occurredOn.localeCompare(left.occurredOn) || Number(Boolean(right.automatic)) - Number(Boolean(left.automatic)),
    );
    const recordedByAccount = new Map(
      [...new Set(positions.map((position) => position.accountId))].map((id) => [
        id,
        recordedByMonth(transactions.filter((entry) => entry.accountId === id).reverse()),
      ]),
    );


    // Preserve estimated cost basis (spec 073).
    const trackedSince = new Map(
      [...recordedByAccount].map(([id, byMonth]) => [id, [...byMonth.keys()].sort()[0] ?? null]),
    );
    const observations: PositionObservation[] = positions.map((position) => {
      const month = monthKey(position.portfolioMonth.referenceDate);
      const movements = recordedByAccount.get(position.accountId)?.get(month) ?? null;
      const since = trackedSince.get(position.accountId) ?? null;
      const tracked = since !== null && month >= since;
      const recorded = movements ?? (position.calculationStartDate || tracked ? emptyRecordedMonth() : null);
      return {
      month: monthKey(position.portfolioMonth.referenceDate),
      accountId: position.accountId,

      accountLabel: positionLabel(position.accountId),
      quantity: position.quantity.toNumber(),
      openingQuantity: position.openingQuantity.toNumber(),


      recorded,
      unitPriceBrl: position.unitPriceBrl?.toNumber() ?? null,
      totalBrl: position.totalBrl.toNumber(),
      strategy: position.strategy,
      allocations: position.allocations.map((allocation) => ({
        assetClass: allocation.assetClass,
        subclass: allocation.subclass,
        duration: allocation.duration,
        weight: allocation.weight.mul(100).toNumber(),
      })),
    }; });

    const quoted = Boolean(asset.quoteSymbol) || Boolean(readInternationalBond(asset.fixedIncomeContract));
    const monthTotals = months.map((month) => ({ month: month.month, totalBrl: month.totalBrl }));
    const selectedMonth = selected.month;
    const scope = (scopeAccountId: string | null): PositionScopeView => {
      const slots = buildHistorySlots({ months: monthTotals, observations, scopeAccountId, quoted });
      return {
        slots,
        summary: summarizeHistory(slots, selectedMonth, quoted),
        transactions: transactions.filter((entry) => scopeAccountId === null || entry.accountId === scopeAccountId),
      };
    };

    const others = new Map<string, OtherAccountHolding>();

    for (const observation of [...observations].sort((left, right) => left.month.localeCompare(right.month))) {
      if (observation.accountId === accountId) {
        continue;
      }

      const current = others.get(observation.accountId);

      if (current) {
        current.lastMonth = observation.month;
        current.months += 1;
      } else {
        others.set(observation.accountId, {
          accountId: observation.accountId,
          label: observation.accountLabel,
          firstMonth: observation.month,
          lastMonth: observation.month,
          months: 1,
        });
      }
    }

    const classTotals: Record<string, number> = {};

    for (const row of classRows) {
      classTotals[row.assetClass] =
        (classTotals[row.assetClass] ?? 0) + row.position.totalBrl.mul(row.weight).toNumber();
    }

    const today = calendarDay(new Date());
    const lastDay = lastDayOf(selected.referenceDate);
    const usdQuote = (await readMonthQuoteValues(prisma, selected.referenceDate, ["USD"])).get("USD");

    return {
      accountId,
      assetId,
      assetName: asset.name,
      ticker: asset.ticker,
      quoteSymbol: asset.quoteSymbol,
      baseCurrency: asset.baseCurrency,
      maturityDate: asset.maturityDate ? toDateKey(asset.maturityDate) : null,
      liquidity: asset.liquidity,
      selectedMonth,
      monthStatus: selected.status,
      referenceDay: toDateKey(today.getTime() < lastDay.getTime() ? today : lastDay),
      usdRate: usdQuote?.valueBrl.toNumber() ?? null,
      classTotals,
      otherAccounts: [...others.values()],
      account: scope(accountId),
      all: others.size > 0 ? scope(null) : null,
      prices: asset.quoteSymbol ? await getPriceHistory(asset.quoteSymbol, toDateKey(today)) : null,
      history: asset.quoteSymbol ? await readHistoryState(asset.quoteSymbol) : null,
      transactions: transactions.filter((entry) => entry.accountId === accountId),
      savings: readSavings(asset.fixedIncomeContract) ? await (async()=>{const terms=readSavings(asset.fixedIncomeContract)!;try{return {terms,state:await savingsState(prisma,terms,toDateKey(new Date(Math.min(+today,+lastDayOf(selected.referenceDate)))))};}catch(error){return{terms,state:null,error:error instanceof Error?error.message:"Savings could not be calculated."};}})() : undefined,
      bond: readInternationalBond(asset.fixedIncomeContract),
      cdi: asset.autoIncome && !asset.quoteSymbol ? await readCdi(accountId, assetId, selected.id, asset.maturityDate) : null,
      rate: rateOf(positions, accountId, selected.id, asset.autoIncome),
    };
  } catch {
    return null;
  }
}


function rateOf(
  positions: {
    accountId: string;
    portfolioMonthId: string;
    portfolioMonth: { referenceDate: Date };
    allocations: { subclass: string; weight: Prisma.Decimal; ratePercent: Prisma.Decimal | null }[];
  }[],
  accountId: string,
  monthId: string,
  automatic: boolean,
): PositionHistoryView["rate"] {
  const inAccount = positions.filter((position) => position.accountId === accountId);
  const current =
    inAccount.find((position) => position.portfolioMonthId === monthId) ??
    [...inAccount].sort((left, right) => right.portfolioMonth.referenceDate.getTime() - left.portfolioMonth.referenceDate.getTime())[0];
  const parts = current ? rateParts(current.allocations) : [];

  return parts.length > 0 ? { parts, automatic } : null;
}

function rateParts(allocations: { subclass: string; weight: Prisma.Decimal | string; ratePercent: Prisma.Decimal | string | null }[]) {
  const parts: RatePart[] = [];

  for (const allocation of allocations) {
    const indexer = indexerOfSubclass(allocation.subclass);

    if (!indexer || allocation.ratePercent === null) {
      continue;
    }

    const percent = Number(allocation.ratePercent);
    const weight = Number(allocation.weight);
    const same = parts.find((part) => part.indexer === indexer && part.percent === percent);

    if (same) {
      same.weight += weight;
    } else {
      parts.push({ indexer, percent, weight });
    }
  }

  return parts;
}


async function readCdi(accountId: string, assetId: string, monthId: string, maturity: Date | null): Promise<CdiView | null> {
  const prisma = (await getUserDb())!;
  const position = await prisma.position.findFirst({
    where: { accountId, assetId, portfolioMonthId: monthId, calculationStartDate: { not: null } },
    select: {
      openingQuantity: true,
      totalBrl: true,
      calculationStartDate: true,
      calculatedIncomeBrl: true,
      incomeCalculatedThrough: true,
      incomeCalculationError: true,
      asset: { select: { autoIncome: true, quoteSymbol: true, fixedIncomeContract: true } },
      allocations: { select: { subclass: true, weight: true, ratePercent: true } },
    },
  });
  const parts = position ? autoIncomeParts(position.asset, position.allocations) : null;

  if (!position?.calculationStartDate || !parts) {
    return null;
  }

  const from = position.incomeCalculatedThrough ? addDay(toDateKey(position.incomeCalculatedThrough)) : toDateKey(calendarDay(new Date()));
  const twelve = new Date(`${from}T00:00:00.000Z`);
  twelve.setUTCFullYear(twelve.getUTCFullYear() + 1);
  const maturityKey = maturity ? toDateKey(maturity) : null;
  const until = maturityKey && maturityKey > from ? maturityKey : maturityKey ? null : toDateKey(twelve);
  const latest = parts.some((part) => part.indexer === "CDI")
    ? await prisma.rateObservation.findFirst({ where: { indexer: "CDI" }, orderBy: { date: "desc" }, select: { dailyPercent: true } })
    : null;
  let projection: CdiView["projection"] = null;

  if (until && !parts.some((part) => part.indexer === "IPCA") && (latest || parts.every((part) => part.indexer === "PRE"))) {


    const total = parts.reduce((sum, part) => sum.plus(part.weight), new Prisma.Decimal(0));
    const daily = parts.reduce((sum, part) => {
      const rate = new Prisma.Decimal(part.ratePercent).div(100);
      const factor =
        part.indexer === "PRE"
          ? new Prisma.Decimal(1).plus(rate).pow(new Prisma.Decimal(1).div(readFixedIncomeContract(position.asset.fixedIncomeContract)?.basis === "CALENDAR_365" ? 365 : 252))
          : new Prisma.Decimal(1).plus(latest!.dailyPercent.div(100).mul(rate));
      return sum.plus(factor.mul(part.weight).div(total));
    }, new Prisma.Decimal(0));
    const businessDays = readFixedIncomeContract(position.asset.fixedIncomeContract)?.basis === "CALENDAR_365" ? Math.round((Date.parse(until) - Date.parse(from)) / 86400000) : businessDaysBetween(from, until);
    projection = {
      until,
      businessDays,
      dailyPercent: daily.minus(1).mul(100).toNumber(),
      toMaturity: Boolean(maturityKey),
      balanceBrl: position.totalBrl.mul(daily.pow(businessDays)).toDecimalPlaces(2).toNumber(),
    };
  }

  return {
    inflationThrough: parts.some((part) => part.indexer === "IPCA") ? (await prisma.rateObservation.findFirst({ where: { indexer: "IPCA", date: { lte: new Date(from) } }, orderBy: { date: "desc" }, select: { date: true } }))?.date.toISOString().slice(0, 7) ?? null : null,
    contract: readFixedIncomeContract(position.asset.fixedIncomeContract),
    parts: rateParts(position.allocations),
    start: toDateKey(position.calculationStartDate),
    baseBrl: position.openingQuantity.toNumber(),
    incomeBrl: position.calculatedIncomeBrl.toNumber(),
    balanceBrl: position.totalBrl.toNumber(),
    through: position.incomeCalculatedThrough ? toDateKey(position.incomeCalculatedThrough) : null,
    error: position.incomeCalculationError,
    projection,
  };
}


function automaticIncome(
  positions: {
    id: string;
    accountId: string;
    portfolioMonthId: string;
    calculatedIncomeBrl: Prisma.Decimal;
    incomeCalculatedThrough: Date | null;
    portfolioMonth: { referenceDate: Date };
  }[],
): PositionTransactionView[] {
  return positions.flatMap((position) => {
    const income = position.calculatedIncomeBrl.toDecimalPlaces(2);

    if (income.isZero()) {
      return [];
    }

    const day = position.incomeCalculatedThrough ?? position.portfolioMonth.referenceDate;
    return [
      {
        id: `auto-${position.id}`,
        accountId: position.accountId,
        accountLabel: "",
        kind: "INCOME" as const,
        transferId: null,
        occurredOn: toDateKey(day),
        quantity: income.abs().toNumber(),
        unitPriceBrl: null,
        amountBrl: income.toNumber(),
        note: `Automatic accrual through ${toDateKey(day).split("-").reverse().join("/")}`,
        monthId: position.portfolioMonthId,
        month: monthKey(position.portfolioMonth.referenceDate),
        automatic: true,
      },
    ];
  });
}

function addDay(day: string) {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

async function readTransactions(assetId: string): Promise<PositionTransactionView[]> {
  const rows = await (await getUserDb())!.positionTransaction.findMany({
    where: { position: { assetId } },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      kind: true,
      occurredOn: true,
      quantity: true,
      unitPriceBrl: true,
      amountBrl: true,
      note: true,
      transferId: true,
      position: {
        select: {
          asset: { select: { assetType: true } },
          accountId: true,
          portfolioMonthId: true,
          portfolioMonth: { select: { referenceDate: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    accountId: row.position.accountId,
    accountLabel: "",
    kind: row.kind,
    occurredOn: toDateKey(row.occurredOn),
    quantity: row.quantity.toNumber(),
    unitPriceBrl: row.unitPriceBrl?.toNumber() ?? null,
    amountBrl: /^Net withdrawal: BRL (\d+(?:\.\d+)?);/.test(row.note ?? "") ? Number(/^Net withdrawal: BRL (\d+(?:\.\d+)?);/.exec(row.note!)![1]) : row.amountBrl.toNumber(),
    locked: row.position.asset.assetType === "savings",
    automatic: row.position.asset.assetType === "savings" && row.note === "Savings automatic return",
    note: row.note,
    transferId: row.transferId,
    monthId: row.position.portfolioMonthId,
    month: monthKey(row.position.portfolioMonth.referenceDate),
  }));
}

async function readHistoryState(symbol: string): Promise<PositionHistoryView["history"]> {

  const registry = await (await getUserDb())!.quoteSymbol.findUnique({
    where: { symbol },
    select: { historySyncedUntil: true, historyError: true },
  });

  if (!registry || registry.historySyncedUntil) {
    return { state: "ready", error: null };
  }

  return registry.historyError
    ? { state: "failed", error: registry.historyError }
    : { state: "pending", error: null };
}

async function getPriceHistory(symbol: string, today: string): Promise<PriceHistory> {
  const prisma = (await getUserDb())!;
  const symbols = symbol === "USD" ? ["USD"] : [symbol, "USD"];

  const [monthly, daily] = await Promise.all([
    readQuoteSeries(prisma, symbols),
    prisma.dailyQuote.findMany({
      where: { symbol: { in: symbols } },
      orderBy: { quoteDate: "asc" },
      select: { symbol: true, quoteDate: true, valueBrl: true },
    }),
  ]);

  const toMonthly = (quote: (typeof monthly)[number]) => ({
    month: monthKey(quote.referenceDate),
    valueBrl: quote.valueBrl.toNumber(),
    quoteDate: quote.quoteDate ? toDateKey(quote.quoteDate) : null,
    carriedFrom: quote.carriedFrom ? monthKey(quote.carriedFrom) : null,
  });
  const toDaily = (quote: (typeof daily)[number]) => ({
    day: toDateKey(quote.quoteDate),
    valueBrl: quote.valueBrl.toNumber(),
  });

  return buildPriceHistory({
    symbol,
    monthly: monthly.filter((quote) => quote.symbol === symbol).map(toMonthly),
    daily: daily.filter((quote) => quote.symbol === symbol).map(toDaily),
    usdMonthly: monthly.filter((quote) => quote.symbol === "USD").map(toMonthly),
    usdDaily: daily.filter((quote) => quote.symbol === "USD").map(toDaily),
    today,
  });
}
