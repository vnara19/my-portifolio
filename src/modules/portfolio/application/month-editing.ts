
/** Transactional edits require user ownership and an open reporting month. Verify tickers and classifications server-side; preserve historical months. */
import { createHash, randomUUID } from "node:crypto";

import { PortfolioMonthStatus, PositionTransactionKind, Prisma, QuoteUpdateStatus } from "@/generated/prisma/client";
import { currentUserId, getUserDb, SCOPED_USER } from "@/lib/user-db";
import {
  parseCdiPercent,
  parseFixedRate,
  applyAssetAttributes,
  AssetAttributeError,
  restoreAssetState,
  type AssetAttributes,
  type AssetState,
} from "@/modules/portfolio/application/asset-attributes";
import {
  ASSET_KIND_DEFINITIONS,
  baseCurrencyOf,
  buildAssetKey,
  cleanName,
  duplicateAssetMessage,
  normalizeKey,
  normalizeTicker,
  providerForQuote,
  USD_SYMBOL,
  type AssetKind,
} from "@/modules/portfolio/domain/asset-kinds";
import { MAX_LIQUIDITY_LENGTH, normalizeLiquidity } from "@/modules/portfolio/domain/liquidity";
import { autoIncomeParts, indexerOfSubclass, supportsAutoIncome } from "@/modules/portfolio/domain/fixed-income-policy";
import { assetTypeOf } from "@/modules/portfolio/domain/classification";
import { classificationIssue } from "@/modules/portfolio/domain/classification";
import { isMarketKind, marketAllocation } from "@/modules/portfolio/domain/market-assets";
import { valueCdiPositions } from "@/modules/portfolio/application/cdi-positions";
import { readVerifiedTicker } from "@/modules/quotes/application/check-ticker";
import { readMonthQuoteValues } from "@/modules/quotes/application/month-quote-values";
import { addMonths, calendarDay, currentReferenceMonth, lastDayOf, toDateKey } from "@/modules/quotes/domain/calendar";
import { isQuoteEditable } from "@/modules/quotes/domain/quote-refresh";

type Transaction = Prisma.TransactionClient;

export class MonthEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonthEditError";
  }
}


export type NewAccountInput = {
  institutionId: string | null;
  institutionName: string | null;
  name: string;
};

export type NewAssetInput = {
  name: string;
  kind: AssetKind;
  ticker: string | null;
  maturityDate: string | null;
  /** Optional liquidity period (spec 039). */
  liquidity?: string | null;
  quoteCheckToken: string | null;
  manualPriceBrl: string | null;

  cashAccount?: boolean;


  autoIncome?: boolean;
  appliedOn?: string | null;
};

export type PositionAddition = {
  accountId?: string;
  newAccount?: NewAccountInput;
  assetId?: string;
  newAsset?: NewAssetInput;
  value: string;


  valueKind?: "quantity" | "amount";


  initialKind?: "OPENING" | "CONTRIBUTION";

  executedPriceBrl?: string | null;
  strategy: string | null;
  allocations: AllocationInput[];
};


export type PositionEdit = {
  positionId: string;
  strategy: string | null;
  allocations: AllocationInput[];
  asset: AssetAttributes;
};
export type AllocationInput = {
  assetClass: string;
  subclass: string;
  duration: string;
  weightPercent: string;


  ratePercent?: string | null;
};
export type QuoteInput = { symbol: string; valueBrl: string };

type SnapshotPosition = {
  id: string;
  accountId: string;
  assetId: string;
  quantity: Prisma.Decimal;
  openingQuantity: Prisma.Decimal;
  calculationStartDate: Date | null;
  calculatedIncomeBrl: Prisma.Decimal;
  incomeCalculatedThrough: Date | null;
  incomeCalculationError: string | null;
  unitPriceBrl: Prisma.Decimal | null;
  exchangeRateBrl: Prisma.Decimal | null;
  totalBrl: Prisma.Decimal;
  strategy: string | null;
  allocations: {
    id: string;
    assetClass: string;
    subclass: string;
    duration: string;
    weight: Prisma.Decimal;
    ratePercent: Prisma.Decimal | null;
  }[];
};


type SnapshotQuote = {
  id: string;
  symbol: string;
  instrumentType: string;
  baseCurrency: string;
  valueBrl: Prisma.Decimal;
};


type SnapshotTransaction = {
  id: string;
  positionId: string;
  kind: PositionTransactionKind;
  occurredOn: Date;
  quantity: Prisma.Decimal;
  unitPriceBrl: Prisma.Decimal | null;
  amountBrl: Prisma.Decimal;
  note: string | null;
  transferId: string | null;
  createdAt: Date;
};

type MonthSnapshot = { positions: SnapshotPosition[]; quotes: SnapshotQuote[]; transactions: SnapshotTransaction[] };


type CreatedEntities = {
  institutionIds: string[];
  accountIds: string[];
  assetIds: string[];
  dailyQuoteIds: string[];
};


type UndoEntry = { userId: string } & (
  | {
      kind: "restore";
      monthId: string;
      snapshot: MonthSnapshot;
      fingerprint: string;
      expiresAt: number;
      created?: CreatedEntities;

      assets?: AssetState[];
    }
  | { kind: "delete-month"; monthId: string; fingerprint: string; expiresAt: number }
);

type NewUndoEntry = UndoEntry extends infer Entry ? (Entry extends unknown ? Omit<Entry, "userId"> : never) : never;

const UNDO_TTL_MS = 10 * 60 * 1000;
const MAX_STRATEGY_LENGTH = 60;
const MAX_LABEL_LENGTH = 80;
const MAX_ENTITY_NAME_LENGTH = 60;
const MAX_ASSET_NAME_LENGTH = 80;

const globalForUndo = globalThis as unknown as { monthUndoStore?: Map<string, UndoEntry> };
const undoStore = (globalForUndo.monthUndoStore ??= new Map<string, UndoEntry>());


export async function addPosition(input: { monthId: string; addition: PositionAddition }) {
  const newAsset = input.addition.newAsset;
  const identity = newAsset && isMarketKind(newAsset.kind) ? await verifiedMarketIdentity(newAsset, input.monthId) : null;
  const allocationInputs = identity ? marketAllocation(identity).map((seed) => ({ ...seed, weightPercent: "100", ratePercent: null })) : input.addition.allocations;
  const allocations = allocationInputs.length ? parseAllocations(allocationInputs) : [];

  return withUndo(input.monthId, async (transaction, month) => {
    const positions = await transaction.position.findMany({
      where: { portfolioMonthId: month.id },
      select: { accountId: true, assetId: true },
    });
    const quotes = await readMonthQuoteValues(transaction, month.referenceDate);
    const quoteBySymbol = new Map([...quotes].map(([symbol, quote]) => [symbol, quote.valueBrl]));
    const batch: AdditionBatch = {
      month,
      isCurrentMonth: month.referenceDate.getTime() === currentReferenceMonth().getTime(),
      quoteBySymbol,
      institutions: new Map(),
      accounts: new Map(),
      assets: new Map(),
      created: { institutionIds: [], accountIds: [], assetIds: [], dailyQuoteIds: [] },
    };
    const addition = input.addition;
    const account = await resolveAdditionAccount(transaction, addition, batch);
    const asset = await resolveAdditionAsset(transaction, addition, account, batch);

    if (positions.some((position) => position.accountId === account.id && position.assetId === asset.id)) {
      throw new MonthEditError("This asset already has a position at this institution in this reporting month.");
    }

    const value = parseNonNegative(addition.value);
    let unitPriceBrl: Prisma.Decimal | null = null;
    let quantity = value.toDecimalPlaces(2);
    let totalBrl = quantity;

    if (asset.quoteSymbol) {
      const price = quoteBySymbol.get(asset.quoteSymbol);

      if (!price) {
        throw new MonthEditError(
          `No quote exists for ${asset.quoteSymbol} in this reporting month. Enter it on the Quotes page.`,
        );
      }
      unitPriceBrl = price;

      if (addition.valueKind === "amount") {


        totalBrl = value.toDecimalPlaces(2);
        quantity = totalBrl.div(price).toDecimalPlaces(12);
      } else {
        quantity = value;
        totalBrl = value.mul(price).toDecimalPlaces(2);
      }
    }

    assertAllocationRules(allocations);
    const created = await transaction.position.create({
      data: {
        userId: SCOPED_USER,
        portfolioMonthId: month.id,
        accountId: account.id,
        assetId: asset.id,
        quantity,
        unitPriceBrl,
        exchangeRateBrl: asset.quoteSymbol ? (quoteBySymbol.get(USD_SYMBOL) ?? null) : null,
        totalBrl,
        strategy: normalizeStrategy(addition.strategy),
      },
      select: { id: true },
    });
    await transaction.positionAllocation.createMany({
      data: allocations.map((allocation) => ({ ...allocation, userId: SCOPED_USER, positionId: created.id })),
    });
    const income = await assertIncomeRates(transaction, asset.id, allocations);


    if (quantity.greaterThan(0)) {


      const dates = batch.created.assetIds.includes(asset.id)
        ? await transaction.asset.findUnique({
            where: { id: asset.id },
            select: { appliedOn: true },
          })
        : null;

      if (dates?.appliedOn && dates.appliedOn > lastDayOf(month.referenceDate)) {
        throw new MonthEditError(
          `The investment date must be on or before the end of the reporting month (${formatDay(lastDayOf(month.referenceDate))}).`,
        );
      }

      const contribution = addition.initialKind === "CONTRIBUTION";
      const executed =
        contribution && unitPriceBrl
          ? addition.executedPriceBrl
            ? parsePositive(addition.executedPriceBrl, 8)
            : unitPriceBrl
          : null;
      await transaction.positionTransaction.create({
        data: {
          userId: SCOPED_USER,
          positionId: created.id,
          kind: contribution ? PositionTransactionKind.CONTRIBUTION : PositionTransactionKind.OPENING,
          occurredOn: dates?.appliedOn ?? transactionDay(month.referenceDate),
          quantity,

          unitPriceBrl: executed,
          amountBrl: executed ? quantity.mul(executed).toDecimalPlaces(2) : totalBrl,
        },
      });


      if (income) {
        const start = dates?.appliedOn && dates.appliedOn < month.referenceDate ? dates.appliedOn : month.referenceDate;
        await transaction.position.update({ where: { id: created.id }, data: { calculationStartDate: start } });
        await valueCdiPositions(transaction, { where: { id: created.id } });
      }
    }

    return hasCreated(batch.created) ? { created: batch.created } : undefined;
  });
}


export async function editPosition(input: { monthId: string; edit: PositionEdit }) {
  const allocations = parseAllocations(input.edit.allocations);

  return withUndo(input.monthId, async (transaction, month) => {
    const position = await transaction.position.findFirst({
      where: { id: input.edit.positionId, portfolioMonthId: month.id },
      select: {
        id: true,
        assetId: true,
        openingQuantity: true,
        calculationStartDate: true,
        allocations: { select: { assetClass: true, subclass: true, duration: true } },
      },
    });

    if (!position) {
      throw new MonthEditError("The position does not belong to this reporting month.");
    }


    // (spec 057).
    await transaction.position.update({
      where: { id: position.id },
      data: { strategy: normalizeStrategy(input.edit.strategy) },
    });


    assertAllocationRules(allocations, position.allocations);
    await transaction.positionAllocation.deleteMany({ where: { positionId: position.id } });
    await transaction.positionAllocation.createMany({
      data: allocations.map((allocation) => ({ ...allocation, userId: SCOPED_USER, positionId: position.id })),
    });

    let previous: AssetState | null;

    try {
      previous = await applyAssetAttributes(transaction, position.assetId, input.edit.asset);
    } catch (error) {
      if (error instanceof AssetAttributeError) {
        throw new MonthEditError(error.message);
      }
      throw error;
    }

    await applyAutoIncome(transaction, month, position, await assertIncomeRates(transaction, position.assetId, allocations));

    return previous ? { assets: [previous] } : undefined;
  });
}


async function applyAutoIncome(
  transaction: Transaction,
  month: { id: string; referenceDate: Date },
  position: { id: string; assetId: string; calculationStartDate: Date | null },
  automatic: boolean,
) {
  if (!automatic) {
    if (position.calculationStartDate) {
      await foldCalculatedIncome(transaction, month, position.id);
    }
    return;
  }

  if (!position.calculationStartDate) {

    const liquidated = await transaction.positionTransaction.count({
      where: { positionId: position.id, OR: [{ note: { startsWith: LIQUIDATION_NOTE } }, { note: { startsWith: "Liquidação" } }] },
    });

    if (liquidated > 0) {
      return;
    }


    const manual = await transaction.positionTransaction.count({
      where: {
        positionId: position.id,
        kind: PositionTransactionKind.INCOME,

        OR: [{ note: null }, { NOT: { OR: [{ note: { startsWith: AUTO_INCOME_NOTE } }, { note: { startsWith: "Rendimento automático" } }] } }],
      },
    });

    if (manual > 0) {
      throw new MonthEditError(
        "This month already has a manual return. Delete it in Transactions before enabling automatic accrual.",
      );
    }

    await transaction.positionTransaction.deleteMany({
      where: { positionId: position.id, kind: PositionTransactionKind.INCOME, OR: [{ note: { startsWith: AUTO_INCOME_NOTE } }, { note: { startsWith: "Rendimento automático" } }] },
    });
    await transaction.position.update({ where: { id: position.id }, data: { calculationStartDate: month.referenceDate } });
  }

  await valueCdiPositions(transaction, { where: { id: position.id } });
}

const AUTO_INCOME_NOTE = "Automatic accrual";
const LIQUIDATION_NOTE = "Liquidation";


export async function foldCalculatedIncome(
  transaction: Transaction,
  month: { referenceDate: Date },
  positionId: string,
  occurredOn: Date = transactionDay(month.referenceDate),
) {
  const current = await transaction.position.findUniqueOrThrow({
    where: { id: positionId },
    select: { calculatedIncomeBrl: true, incomeCalculatedThrough: true },
  });
  const income = current.calculatedIncomeBrl.toDecimalPlaces(2);

  if (income.greaterThan(0)) {
    await transaction.positionTransaction.create({
      data: {
        userId: SCOPED_USER,
        positionId,
        kind: PositionTransactionKind.INCOME,
        occurredOn,
        quantity: income,
        amountBrl: income,
        note: `${AUTO_INCOME_NOTE}${current.incomeCalculatedThrough ? ` through ${formatDay(current.incomeCalculatedThrough)}` : ""}`,
      },
    });
  }

  await transaction.position.update({
    where: { id: positionId },
    data: { calculationStartDate: null, calculatedIncomeBrl: 0, incomeCalculatedThrough: null, incomeCalculationError: null },
  });
}


function formatDay(day: Date) {
  const [year, month, date] = toDateKey(day).split("-");
  return `${date}/${month}/${year}`;
}


function incomeOfNewAsset(input: NewAssetInput) {
  if (!input.autoIncome) {
    return {};
  }

  if (!supportsAutoIncome(input.kind)) {
    throw new MonthEditError("Only fixed income and BRL cash support automatic accrual.");
  }

  const applied = input.appliedOn && /^\d{4}-\d{2}-\d{2}$/.test(input.appliedOn) ? new Date(`${input.appliedOn}T00:00:00.000Z`) : null;

  if (!applied || Number.isNaN(applied.getTime()) || toDateKey(applied) !== input.appliedOn || applied > calendarDay(new Date()) || input.appliedOn < "2000-01-01") {
    throw new MonthEditError("Enter an investment date no later than today to calculate accrual.");
  }

  return { autoIncome: true, appliedOn: applied };
}


async function assertIncomeRates(
  transaction: Transaction,
  assetId: string,
  allocations: { subclass: string; weight: Prisma.Decimal; ratePercent: Prisma.Decimal | null }[],
) {
  const asset = await transaction.asset.findUniqueOrThrow({
    where: { id: assetId },
    select: { autoIncome: true, quoteSymbol: true, assetType: true, baseCurrency: true, name: true, cashAccount: true },
  });
  const supported = !asset.quoteSymbol && supportsAutoIncome(assetTypeOf(asset));

  if (allocations.some((allocation) => allocation.ratePercent !== null) && !supported) {
    throw new MonthEditError("Only fixed income and BRL cash without a market quote support a rate of return.");
  }

  if (asset.autoIncome && !autoIncomeParts(asset, allocations)) {
    throw new MonthEditError(
      "With automatic accrual, every classification must be floating-rate or fixed-rate and have a rate of return.",
    );
  }

  return Boolean(autoIncomeParts(asset, allocations));
}


export async function removePosition(input: { monthId: string; positionId: string }) {
  return withUndo(input.monthId, async (transaction, month) => {
    const removed = await transaction.position.deleteMany({
      where: { id: input.positionId, portfolioMonthId: month.id },
    });

    if (removed.count === 0) {
      throw new MonthEditError("The position does not belong to this reporting month.");
    }
  });
}

type AdditionBatch = {
  month: { id: string; referenceDate: Date };
  isCurrentMonth: boolean;
  quoteBySymbol: Map<string, Prisma.Decimal>;


  institutions: Map<string, { id: string; name: string }>;
  accounts: Map<string, string>;
  assets: Map<string, { id: string; signature: string; quoteSymbol: string | null }>;
  created: CreatedEntities;
};

async function resolveAdditionAccount(
  transaction: Transaction,
  addition: PositionAddition,
  batch: AdditionBatch,
): Promise<{ id: string; institutionName: string }> {
  if (addition.accountId) {
    const account = await transaction.account.findUnique({
      where: { id: addition.accountId },
      select: { id: true, institution: { select: { name: true } } },
    });

    if (!account) {
      throw new MonthEditError("The selected account does not exist.");
    }

    return { id: account.id, institutionName: account.institution.name };
  }

  const input = addition.newAccount;

  if (!input) {
    throw new MonthEditError("Choose the position account.");
  }

  const institution = await resolveInstitution(transaction, input, batch);
  const name = requireName(input.name, MAX_ENTITY_NAME_LENGTH, "the account name");
  const key = `${institution.id}:${normalizeKey(name)}`;
  const reused = batch.accounts.get(key);

  if (reused) {
    return { id: reused, institutionName: institution.name };
  }

  const siblings = await transaction.account.findMany({
    where: { institutionId: institution.id },
    select: { name: true },
  });
  const duplicate = siblings.find((account) => normalizeKey(account.name) === normalizeKey(name));

  if (duplicate) {
    throw new MonthEditError(`The account "${duplicate.name}" already exists in ${institution.name}. Select it from the list.`);
  }

  const account = await transaction.account.create({
    data: { userId: SCOPED_USER, institutionId: institution.id, name },
    select: { id: true },
  });
  batch.accounts.set(key, account.id);
  batch.created.accountIds.push(account.id);

  return { id: account.id, institutionName: institution.name };
}

async function resolveInstitution(transaction: Transaction, input: NewAccountInput, batch: AdditionBatch) {
  if (input.institutionId) {
    const institution = await transaction.institution.findUnique({
      where: { id: input.institutionId },
      select: { id: true, name: true },
    });

    if (!institution) {
      throw new MonthEditError("The selected institution does not exist.");
    }

    return institution;
  }

  const name = requireName(input.institutionName ?? "", MAX_ENTITY_NAME_LENGTH, "the institution name");
  const normalizedName = normalizeKey(name);
  const reused = batch.institutions.get(normalizedName);

  if (reused) {
    return reused;
  }

  const existing = await transaction.institution.findFirst({
    where: { normalizedName },
    select: { name: true },
  });

  if (existing) {
    throw new MonthEditError(`The institution "${existing.name}" already exists. Select it from the list.`);
  }

  const institution = await transaction.institution.create({
    data: { userId: SCOPED_USER, name, normalizedName },
    select: { id: true, name: true },
  });
  batch.institutions.set(normalizedName, institution);
  batch.created.institutionIds.push(institution.id);

  return institution;
}

async function resolveAdditionAsset(
  transaction: Transaction,
  addition: PositionAddition,
  account: { institutionName: string },
  batch: AdditionBatch,
): Promise<{ id: string; quoteSymbol: string | null }> {
  if (addition.assetId) {
    const asset = await transaction.asset.findUnique({
      where: { id: addition.assetId },
      select: { id: true, quoteSymbol: true },
    });

    if (!asset) {
      throw new MonthEditError("The selected asset does not exist.");
    }

    return asset;
  }

  const input = addition.newAsset;

  if (!input) {
    throw new MonthEditError("Choose the position asset.");
  }

  const definition = ASSET_KIND_DEFINITIONS[input.kind];
  const identity = isMarketKind(input.kind) ? await verifiedMarketIdentity(input, batch.month.id) : null;
  const name = requireName(identity ? identity.name.slice(0, MAX_ASSET_NAME_LENGTH) : input.name, MAX_ASSET_NAME_LENGTH, "the asset name");
  const symbol = definition.ticker === null ? null : normalizeTicker(input.kind, input.ticker ?? "");

  if (definition.ticker !== null && !symbol) {
    throw new MonthEditError(`Enter a valid ticker for ${name}.`);
  }

  const officialMaturity = input.kind === "treasury" ? symbol?.slice(-10) ?? null : null;
  if (officialMaturity && input.maturityDate && input.maturityDate !== officialMaturity) {
    throw new MonthEditError("The maturity date must match the selected official security.");
  }
  const maturityDate = parseMaturityDate(officialMaturity ?? input.maturityDate);

  if (maturityDate && !definition.allowsMaturity) {
    throw new MonthEditError("Only assets without a market ticker have a maturity date.");
  }

  const maturityKey = maturityDate ? maturityDate.toISOString().slice(0, 10) : null;
  const normalizedKey = buildAssetKey({
    name,
    ticker: symbol,
    institutionName: account.institutionName,
    maturityDate: maturityKey,
  });
  const signature = JSON.stringify([input.kind, symbol, maturityKey]);
  const reused = batch.assets.get(normalizedKey);

  if (reused) {
    if (reused.signature !== signature) {
      throw new MonthEditError(`Two new positions create the asset ${name} with different details.`);
    }

    return { id: reused.id, quoteSymbol: reused.quoteSymbol };
  }

  const existing = await transaction.asset.findFirst({ where: { normalizedKey }, select: { name: true } });

  if (existing) {
    throw new MonthEditError(
      duplicateAssetMessage({ name: existing.name, kind: input.kind, symbol, maturityDate: maturityKey }),
    );
  }

  const verifiedCoinId = symbol ? await ensureMonthQuote(transaction, input, symbol, batch) : null;


  const quoteProviderId =
    symbol && definition.provider === "coingecko"
      ? ((
          await transaction.asset.findFirst({
            where: { quoteSymbol: symbol, quoteProviderId: { not: null } },
            orderBy: { createdAt: "asc" },
            select: { quoteProviderId: true },
          })
        )?.quoteProviderId ?? verifiedCoinId)
      : definition.provider === "tesouro" ? verifiedCoinId : null;

  const asset = await transaction.asset.create({
    data: {
      userId: SCOPED_USER,
      normalizedKey,
      name,
      ticker: symbol,
      quoteSymbol: symbol,
      baseCurrency: identity?.currency ?? baseCurrencyOf(input.kind, symbol),
      maturityDate,
      liquidity: normalizeLiquidity(input.liquidity)?.slice(0, MAX_LIQUIDITY_LENGTH) ?? null,
      quoteProviderId,
      cashAccount: Boolean(input.cashAccount) && (input.kind === "brl-cash" || input.kind === "usd-balance"),

      assetType: identity?.assetType ?? input.kind,
      ...incomeOfNewAsset(input),
    },
    select: { id: true },
  });
  batch.assets.set(normalizedKey, { id: asset.id, signature, quoteSymbol: symbol });
  batch.created.assetIds.push(asset.id);

  return { id: asset.id, quoteSymbol: symbol };
}


async function verifiedMarketIdentity(input: NewAssetInput, monthId: string) {
  const verified = input.quoteCheckToken ? readVerifiedTicker(input.quoteCheckToken, { userId: await currentUserId(), monthId }) : null;
  const symbol = normalizeTicker(input.kind, input.ticker ?? "");
  if (!verified || verified.kind !== input.kind || verified.symbol !== symbol || verified.status !== "found" || !verified.identity) {
    throw new MonthEditError(`Ticker verification for ${symbol ?? "this listing"} has expired. Verify the ticker again and try saving.`);
  }
  return verified.identity;
}

async function ensureMonthQuote(
  transaction: Transaction,
  input: NewAssetInput,
  symbol: string,
  batch: AdditionBatch,
): Promise<string | null> {
  const definition = ASSET_KIND_DEFINITIONS[input.kind];
  const identity = isMarketKind(input.kind) ? await verifiedMarketIdentity(input, batch.month.id) : null;
  const instrumentType = identity?.instrumentType ?? definition.instrumentType ?? "FIAT";
  const baseCurrency = identity?.currency ?? baseCurrencyOf(input.kind, symbol);
  const provider = providerForQuote(instrumentType, baseCurrency);
  const stored =
    (await transaction.marketQuote.findFirst({
      where: { symbol },
      orderBy: { referenceDate: "desc" },
      select: { instrumentType: true, baseCurrency: true },
    })) ??
    (await transaction.dailyQuote.findFirst({
      where: { symbol },
      orderBy: { quoteDate: "desc" },
      select: { instrumentType: true, baseCurrency: true },
    }));

  if (definition.ticker === "market" && stored && providerForQuote(stored.instrumentType, stored.baseCurrency) !== provider) {
    throw new MonthEditError(`${symbol} is already quoted in the portfolio by another provider. Choose the corresponding type.`);
  }

  if (batch.quoteBySymbol.has(symbol)) {
    return null;
  }

  if (definition.ticker !== "market") {
    throw new MonthEditError(`No quote exists for ${symbol} in this reporting month. Enter it on the Quotes page.`);
  }

  const verified = input.quoteCheckToken ? readVerifiedTicker(input.quoteCheckToken, {
    userId: await currentUserId(), monthId: batch.month.id,
  }) : null;

  if (!verified || verified.symbol !== symbol || verified.kind !== input.kind) {
    throw new MonthEditError(`Ticker verification for ${symbol} has expired. Verify the ticker again and try saving.`);
  }

  const useFetched = verified.status === "found" && verified.priceBrl !== null && batch.isCurrentMonth;
  const official = useFetched ? new Prisma.Decimal(verified.priceBrl!).toDecimalPlaces(8) : null;
  const typed = input.manualPriceBrl ? parsePositive(input.manualPriceBrl, 8) : null;

  if (!official && !typed) {
    throw new MonthEditError(`Enter the quote for ${symbol} in BRL.`);
  }


  const own = typed && (!official || (input.kind === "treasury" && !typed.equals(official))) ? typed : null;
  const valueBrl = own ?? official!;

  if (official) {


    await transaction.marketQuote.createMany({
      data: [
        {
          referenceDate: batch.month.referenceDate,
          symbol,
          instrumentType,
          baseCurrency,
          valueBrl: official,
          quoteDate: verified.quoteDate,
        },
      ],
      skipDuplicates: true,
    });
  }

  if (own) {


    await transaction.manualQuote.create({
      data: {
        userId: SCOPED_USER,
        referenceDate: batch.month.referenceDate,
        symbol,
        instrumentType,
        baseCurrency,
        valueBrl,
      },
    });
  }
  batch.quoteBySymbol.set(symbol, valueBrl);


  await transaction.quoteSymbol.createMany({
    data: [{ symbol, instrumentType, baseCurrency, providerId: verified.coinId }],
    skipDuplicates: true,
  });

  if (verified.status === "found" && verified.priceBrl !== null) {
    const daily = await transaction.dailyQuote.findUnique({
      where: { symbol_quoteDate: { symbol, quoteDate: verified.quoteDate } },
      select: { id: true },
    });

    if (!daily) {
      const created = await transaction.dailyQuote.create({
        data: {
          symbol,
          quoteDate: verified.quoteDate,
          instrumentType,
          baseCurrency,
          valueBrl: new Prisma.Decimal(verified.priceBrl).toDecimalPlaces(8),
          provider: verified.provider,
          fetchedAt: verified.fetchedAt,
        },
        select: { id: true },
      });
      batch.created.dailyQuoteIds.push(created.id);
    }
  }

  return verified.coinId;
}

function hasCreated(created: CreatedEntities) {
  return (
    created.institutionIds.length +
      created.accountIds.length +
      created.assetIds.length +
      created.dailyQuoteIds.length >
    0
  );
}


async function removeUnusedCreated(transaction: Transaction, created: CreatedEntities) {
  if (created.assetIds.length > 0) {
    await transaction.asset.deleteMany({ where: { id: { in: created.assetIds }, positions: { none: {} } } });
  }

  if (created.dailyQuoteIds.length > 0) {
    const daily = await transaction.dailyQuote.findMany({
      where: { id: { in: created.dailyQuoteIds } },
      select: { id: true, symbol: true },
    });


    const symbols = daily.map((entry) => entry.symbol);
    const inUse = new Set(
      symbols.length > 0
        ? (
            await transaction.$queryRaw<{ quote_symbol: string }[]>`
              SELECT DISTINCT "quote_symbol" FROM "assets" WHERE "quote_symbol" = ANY(${symbols})
            `
          ).map((row) => row.quote_symbol)
        : [],
    );
    const removable = daily.filter((entry) => !inUse.has(entry.symbol)).map((entry) => entry.id);

    if (removable.length > 0) {
      await transaction.dailyQuote.deleteMany({ where: { id: { in: removable } } });
    }
  }

  if (created.accountIds.length > 0) {
    await transaction.account.deleteMany({ where: { id: { in: created.accountIds }, positions: { none: {} } } });
  }

  if (created.institutionIds.length > 0) {
    await transaction.institution.deleteMany({
      where: { id: { in: created.institutionIds }, accounts: { none: {} } },
    });
  }
}


function parseAllocations(inputs: AllocationInput[]) {
  const parsed = inputs.map((allocation) => {
    const subclass = normalizeLabel(allocation.subclass, "subclasse");

    return {
      assetClass: normalizeLabel(allocation.assetClass, "classe"),
      subclass,
      duration: normalizeLabel(allocation.duration, "resgate"),
      weight: parsePositive(allocation.weightPercent, 8).div(100),
      ratePercent: parseAllocationRate(subclass, allocation.ratePercent ?? null),
    };
  });

  if (parsed.length === 0) {
    throw new MonthEditError("Enter at least one classification.");
  }

  const identities = new Set(parsed.map((entry) => `${entry.assetClass}|${entry.subclass}|${entry.duration}`));
  if (identities.size !== parsed.length) {
    throw new MonthEditError("There are duplicate allocations with the same class, subclass and redemption term.");
  }

  const sum = parsed.reduce((total, entry) => total.plus(entry.weight), new Prisma.Decimal(0));
  if (sum.minus(1).abs().greaterThan("0.0001")) {
    throw new MonthEditError(`Weights add up to ${sum.mul(100).toFixed(2)}%. The total must be 100%.`);
  }

  if (parsed.some((entry) => entry.weight.greaterThan(1))) {
    throw new MonthEditError("No weight can exceed 100%.");
  }

  return parsed;
}


function parseAllocationRate(subclass: string, raw: string | null) {
  if (raw === null || raw.trim() === "") {
    return null;
  }

  const indexer = indexerOfSubclass(subclass);

  if (!indexer) {
    throw new MonthEditError("Only floating-rate or fixed-rate classifications support a rate of return.");
  }

  try {
    return indexer === "CDI" ? parseCdiPercent(raw) : parseFixedRate(raw);
  } catch (error) {
    throw new MonthEditError(error instanceof Error ? error.message : "Review the rate of return.");
  }
}

export async function updateMonthQuotes(input: {
  monthId: string;
  quotes: QuoteInput[];
}) {
  const parsed = input.quotes.map((quote) => ({
    symbol: quote.symbol.trim(),
    valueBrl: parsePositive(quote.valueBrl, 8),
  }));

  if (parsed.length === 0) {
    throw new MonthEditError("No quotes to save.");
  }

  if (new Set(parsed.map((quote) => quote.symbol)).size !== parsed.length) {
    throw new MonthEditError("There are duplicate quotes.");
  }

  return withUndo(input.monthId, async (transaction, month) => {
    await assertQuotesEditable(
      transaction,
      month.referenceDate,
      parsed.map((quote) => quote.symbol),
    );

    for (const quote of parsed) {


      const reference =
        (await transaction.marketQuote.findFirst({
          where: { symbol: quote.symbol },
          orderBy: { referenceDate: "desc" },
          select: { instrumentType: true, baseCurrency: true },
        })) ??
        (await transaction.manualQuote.findFirst({
          where: { symbol: quote.symbol },
          orderBy: { referenceDate: "desc" },
          select: { instrumentType: true, baseCurrency: true },
        }));

      if (!reference) {
        throw new MonthEditError(`No history exists for ${quote.symbol} to identify the quote type.`);
      }

      const existing = await transaction.manualQuote.findFirst({
        where: { referenceDate: month.referenceDate, symbol: quote.symbol },
        select: { id: true },
      });

      if (existing) {
        await transaction.manualQuote.update({ where: { id: existing.id }, data: { valueBrl: quote.valueBrl } });
      } else {
        await transaction.manualQuote.create({
          data: {
            userId: SCOPED_USER,
            referenceDate: month.referenceDate,
            symbol: quote.symbol,
            instrumentType: reference.instrumentType,
            baseCurrency: reference.baseCurrency,
            valueBrl: quote.valueBrl,
          },
        });
      }

      const positions = await transaction.position.findMany({
        where: { portfolioMonthId: month.id, asset: { quoteSymbol: quote.symbol } },
        select: { id: true, quantity: true },
      });

      for (const position of positions) {
        await transaction.position.update({
          where: { id: position.id },
          data: {
            unitPriceBrl: quote.valueBrl,
            totalBrl: position.quantity.mul(quote.valueBrl).toDecimalPlaces(2),
          },
        });
      }

      if (quote.symbol === "USD") {
        await transaction.position.updateMany({
          where: { portfolioMonthId: month.id, exchangeRateBrl: { not: null } },
          data: { exchangeRateBrl: quote.valueBrl },
        });
      }
    }
  });
}

export async function cloneLatestMonth() {
  const prisma = await requirePrisma();
  const userId = await currentUserId();

  return prisma.$transaction(
    async (transaction) => {


      const head = await transaction.portfolioMonth.findFirst({
        orderBy: { referenceDate: "desc" },
        select: { id: true, referenceDate: true },
      });

      if (head) {
        await valueCdiPositions(transaction, {
          where: { portfolioMonthId: head.id },
          asOf: toDateKey(nextMonth(head.referenceDate)),
        });
      }

      const latest = await transaction.portfolioMonth.findFirst({
        orderBy: { referenceDate: "desc" },
        select: {
          id: true,
          referenceDate: true,

          positions: {
            where: { quantity: { gt: 0 } },
            select: {
              accountId: true,
              assetId: true,
              quantity: true,
              unitPriceBrl: true,
              exchangeRateBrl: true,
              totalBrl: true,
              strategy: true,
              asset: { select: { quoteSymbol: true, autoIncome: true } },
              allocations: {
                select: { assetClass: true, subclass: true, duration: true, weight: true, ratePercent: true },
              },
            },
          },
        },
      });

      if (!latest || latest.positions.length === 0) {
        throw new MonthEditError("No reporting month contains positions to copy.");
      }

      const target = nextMonth(latest.referenceDate);

      if (target.getTime() > currentReferenceMonth().getTime()) {
        throw new MonthEditError("The latest reporting month is already the current month.");
      }

      const month = await transaction.portfolioMonth.create({
        data: { userId: SCOPED_USER, referenceDate: target, status: PortfolioMonthStatus.DRAFT },
        select: { id: true },
      });

      for (const position of latest.positions) {
        const { allocations, asset, ...fields } = position;


        const created = await transaction.position.create({
          data: {
            ...fields,
            openingQuantity: fields.quantity,
            calculationStartDate: autoIncomeParts(asset, allocations) ? target : null,
            userId: SCOPED_USER,
            portfolioMonthId: month.id,
          },
          select: { id: true },
        });

        if (allocations.length > 0) {
          await transaction.positionAllocation.createMany({
            data: allocations.map((allocation) => ({ ...allocation, userId: SCOPED_USER, positionId: created.id })),
          });
        }
      }

      await carryMonthQuotes(transaction, latest.referenceDate, target);

      const after = await readSnapshot(transaction, { id: month.id, referenceDate: target });
      const token = storeUndo(userId, {
        kind: "delete-month",
        monthId: month.id,
        fingerprint: fingerprint(after),
        expiresAt: Date.now() + UNDO_TTL_MS,
      });

      return { monthId: month.id, referenceDate: target, undoToken: token };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

export async function undoChange(token: string) {
  const prisma = await requirePrisma();
  const userId = await currentUserId();
  const stored = undoStore.get(token);

  const entry = stored?.userId === userId ? stored : undefined;

  if (entry) {
    undoStore.delete(token);
  }

  if (!entry || entry.expiresAt < Date.now()) {
    throw new MonthEditError("This change can no longer be undone.");
  }


  return prisma.$transaction(
    async (transaction) => {
      const month = await transaction.portfolioMonth.findUnique({
        where: { id: entry.monthId },
        select: { id: true, referenceDate: true },
      });

      if (!month) {
        throw new MonthEditError("The reporting month no longer exists.");
      }

      const current = await readSnapshot(transaction, month);

      if (fingerprint(current) !== entry.fingerprint) {
        throw new MonthEditError(
          "The reporting month changed after this operation. Undoing would overwrite later changes.",
        );
      }

      if (entry.kind === "delete-month") {


        await transaction.manualQuote.deleteMany({ where: { referenceDate: month.referenceDate } });
        await transaction.portfolioMonth.delete({ where: { id: month.id } });
        return { referenceDate: month.referenceDate, deleted: true };
      }

      await restoreSnapshot(transaction, month, entry.snapshot);

      for (const asset of entry.assets ?? []) {
        try {
          await restoreAssetState(transaction, asset);
        } catch (error) {
          if (error instanceof AssetAttributeError) {
            throw new MonthEditError(error.message);
          }
          throw error;
        }
      }

      if (entry.created) {
        await removeUnusedCreated(transaction, entry.created);
      }

      return { referenceDate: month.referenceDate, deleted: false };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}


function assertAllocationRules(
  allocations: { assetClass: string; subclass: string; duration: string }[],
  legacy: { assetClass: string; subclass: string; duration: string }[] = [],
) {
  const sameAs = (left: (typeof allocations)[number], right: (typeof allocations)[number]) =>
    left.assetClass === right.assetClass && left.subclass === right.subclass && left.duration === right.duration;

  for (const allocation of allocations) {
    const issue = classificationIssue(allocation);

    if (issue && !legacy.some((entry) => sameAs(entry, allocation))) {
      throw new MonthEditError(`${issue} Choose an option from the list.`);
    }
  }
}


export async function setMonthOpen({ monthId, open }: { monthId: string; open: boolean }) {
  const prisma = await requirePrisma();
  const month = await prisma.portfolioMonth.findUnique({ where: { id: monthId }, select: { id: true, status: true } });

  if (!month) {
    throw new MonthEditError("This reporting month does not exist.");
  }

  const isOpen = month.status === PortfolioMonthStatus.DRAFT;

  if (isOpen === open) {
    throw new MonthEditError(open ? "This month is already open." : "This month is already closed.");
  }

  await prisma.portfolioMonth.update({
    where: { id: month.id },
    data: { status: open ? PortfolioMonthStatus.DRAFT : PortfolioMonthStatus.REVIEWED },
  });
}


async function assertQuotesEditable(transaction: Transaction, referenceDate: Date, symbols: string[]) {
  const [quoteBySymbol, lastResults] = await Promise.all([
    readMonthQuoteValues(transaction, referenceDate, symbols),
    transaction.quoteRefreshResult.findMany({
      where: {
        symbol: { in: symbols },
        run: { quoteDate: { gte: referenceDate, lt: addMonths(referenceDate, 1) } },
      },
      orderBy: [{ fetchedAt: "desc" }, { id: "desc" }],
      distinct: ["symbol"],
      select: { symbol: true, status: true },
    }),
  ]);
  const failed = new Set(
    lastResults.filter((result) => result.status === QuoteUpdateStatus.FAILED).map((result) => result.symbol),
  );
  const locked = symbols.filter((symbol) => {
    const quote = quoteBySymbol.get(symbol);

    return (
      !quote?.manual &&
      !isQuoteEditable({ hasValue: quote !== undefined, carried: Boolean(quote?.carriedFrom), lastFailed: failed.has(symbol) })
    );
  });

  if (locked.length > 0) {
    throw new MonthEditError(
      `${locked.join(", ")} ${locked.length === 1 ? "comes" : "come"} from automatic updates and cannot ${
        locked.length === 1 ? "pode" : "podem"
      } ser ${locked.length === 1 ? "editada" : "editadas"}.`,
    );
  }
}

export async function withUndo(
  monthId: string,
  mutate: (
    transaction: Transaction,
    month: { id: string; referenceDate: Date },
  ) => Promise<{ created?: CreatedEntities; assets?: AssetState[] } | void>,
) {
  const prisma = await requirePrisma();
  const userId = await currentUserId();

  try {
    return await prisma.$transaction(
      async (transaction) => {
        const month = await assertEditable(transaction, monthId);
        const before = await readSnapshot(transaction, month);
        const extras = await mutate(transaction, month);
        const after = await readSnapshot(transaction, month);
        const undoToken = storeUndo(userId, {
          kind: "restore",
          monthId: month.id,
          snapshot: before,
          fingerprint: fingerprint(after),
          expiresAt: Date.now() + UNDO_TTL_MS,
          created: extras?.created,
          assets: extras?.assets,
        });

        return { referenceDate: month.referenceDate, undoToken };
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  } catch (error) {
    if (error instanceof MonthEditError) {
      throw error;
    }

    throw new MonthEditError("Could not save. No changes were applied.");
  }
}

async function assertEditable(transaction: Transaction, monthId: string) {
  const month = await transaction.portfolioMonth.findUnique({
    where: { id: monthId },
    select: { id: true, referenceDate: true, status: true },
  });

  if (!month) {
    throw new MonthEditError("This reporting month does not exist.");
  }


  if (month.status !== PortfolioMonthStatus.DRAFT) {
    throw new MonthEditError("This month is closed. Open it in the timeline to edit.");
  }

  return { id: month.id, referenceDate: month.referenceDate };
}

async function readSnapshot(
  transaction: Transaction,
  month: { id: string; referenceDate: Date },
): Promise<MonthSnapshot> {
  const [positions, quotes] = await Promise.all([
    transaction.position.findMany({
      where: { portfolioMonthId: month.id },
      orderBy: { id: "asc" },
      select: {
        id: true,
        accountId: true,
        assetId: true,
        quantity: true,
        openingQuantity: true,
        calculationStartDate: true,
        calculatedIncomeBrl: true,
        incomeCalculatedThrough: true,
        incomeCalculationError: true,
        unitPriceBrl: true,
        exchangeRateBrl: true,
        totalBrl: true,
        strategy: true,
        allocations: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            assetClass: true,
            subclass: true,
            duration: true,
            weight: true,
            ratePercent: true,
          },
        },
      },
    }),
    transaction.manualQuote.findMany({
      where: { referenceDate: month.referenceDate },
      orderBy: { symbol: "asc" },
      select: { id: true, symbol: true, instrumentType: true, baseCurrency: true, valueBrl: true },
    }),
  ]);
  const transactions = await transaction.positionTransaction.findMany({
    where: { position: { portfolioMonthId: month.id } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      positionId: true,
      kind: true,
      occurredOn: true,
      quantity: true,
      unitPriceBrl: true,
      amountBrl: true,
      note: true,
      transferId: true,
      createdAt: true,
    },
  });

  return { positions, quotes, transactions };
}

async function restoreSnapshot(
  transaction: Transaction,
  month: { id: string; referenceDate: Date },
  snapshot: MonthSnapshot,
) {
  const keepPositionIds = snapshot.positions.map((position) => position.id);
  await transaction.position.deleteMany({
    where: { portfolioMonthId: month.id, id: { notIn: keepPositionIds } },
  });

  for (const { allocations, ...position } of snapshot.positions) {
    await transaction.position.upsert({
      where: { id: position.id },
      create: { ...position, userId: SCOPED_USER, portfolioMonthId: month.id },
      update: {
        quantity: position.quantity,
        openingQuantity: position.openingQuantity,
        calculationStartDate: position.calculationStartDate,
        calculatedIncomeBrl: position.calculatedIncomeBrl,
        incomeCalculatedThrough: position.incomeCalculatedThrough,
        incomeCalculationError: position.incomeCalculationError,
        unitPriceBrl: position.unitPriceBrl,
        exchangeRateBrl: position.exchangeRateBrl,
        totalBrl: position.totalBrl,
        strategy: position.strategy,
      },
    });
    await transaction.positionAllocation.deleteMany({ where: { positionId: position.id } });

    if (allocations.length > 0) {
      await transaction.positionAllocation.createMany({
        data: allocations.map((allocation) => ({ ...allocation, userId: SCOPED_USER, positionId: position.id })),
      });
    }
  }


  const keepQuoteIds = snapshot.quotes.map((quote) => quote.id);
  await transaction.manualQuote.deleteMany({
    where: { referenceDate: month.referenceDate, id: { notIn: keepQuoteIds } },
  });

  for (const quote of snapshot.quotes) {
    await transaction.manualQuote.upsert({
      where: { id: quote.id },
      create: { ...quote, userId: SCOPED_USER, referenceDate: month.referenceDate },
      update: { valueBrl: quote.valueBrl },
    });
  }


  const keepTransactionIds = snapshot.transactions.map((entry) => entry.id);
  await transaction.positionTransaction.deleteMany({
    where: { position: { portfolioMonthId: month.id }, id: { notIn: keepTransactionIds } },
  });

  for (const entry of snapshot.transactions) {
    const { id, ...data } = entry;
    await transaction.positionTransaction.upsert({
      where: { id },
      create: { id, ...data, userId: SCOPED_USER },
      update: data,
    });
  }
}


async function carryMonthQuotes(transaction: Transaction, source: Date, target: Date) {
  const [shared, manual] = await Promise.all([
    transaction.marketQuote.findMany({
      where: { referenceDate: source },
      select: { symbol: true, instrumentType: true, baseCurrency: true, valueBrl: true, quoteDate: true, carriedFrom: true },
    }),
    transaction.manualQuote.findMany({
      where: { referenceDate: source },
      select: { symbol: true, instrumentType: true, baseCurrency: true, valueBrl: true },
    }),
  ]);

  if (shared.length > 0) {
    await transaction.marketQuote.createMany({
      data: shared.map((quote) => ({ ...quote, referenceDate: target, carriedFrom: quote.carriedFrom ?? source })),
      skipDuplicates: true,
    });
  }

  const sharedSymbols = new Set(shared.map((quote) => quote.symbol));
  const manualOnly = manual.filter((quote) => !sharedSymbols.has(quote.symbol));

  if (manualOnly.length > 0) {
    await transaction.manualQuote.createMany({
      data: manualOnly.map((quote) => ({ ...quote, userId: SCOPED_USER, referenceDate: target })),
      skipDuplicates: true,
    });
  }
}

function fingerprint(snapshot: MonthSnapshot) {
  return createHash("sha256")
    .update(
      JSON.stringify(snapshot, (_key, value: unknown) => (value instanceof Prisma.Decimal ? value.toString() : value)),
    )
    .digest("hex");
}

function storeUndo(userId: string, entry: NewUndoEntry) {
  const now = Date.now();

  for (const [key, value] of undoStore) {
    if (value.expiresAt < now) {
      undoStore.delete(key);
    }
  }

  const token = randomUUID();
  undoStore.set(token, { ...entry, userId } as UndoEntry);
  return token;
}


export function transactionDay(referenceDate: Date, now = new Date()) {
  const today = calendarDay(now);
  const last = lastDayOf(referenceDate);
  return today.getTime() > last.getTime() ? last : today < referenceDate ? referenceDate : today;
}

async function requirePrisma() {
  const prisma = await getUserDb();

  if (!prisma) {
    throw new MonthEditError("The database is unavailable.");
  }

  return prisma;
}

function nextMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function normalizeStrategy(value: string | null) {
  const trimmed = value?.trim() ?? "";

  if (trimmed.length > MAX_STRATEGY_LENGTH) {
    throw new MonthEditError("The strategy is too long.");
  }

  return trimmed === "" ? null : trimmed;
}

function requireName(value: string, maxLength: number, field: string) {
  const name = cleanName(value);

  if (!name || name.length > maxLength || !normalizeKey(name)) {
    throw new MonthEditError(`Informe ${field} with up to ${maxLength} characters.`);
  }

  return name;
}

function parseMaturityDate(value: string | null) {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;

  if (!date || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) {
    throw new MonthEditError("Enter a valid maturity date.");
  }

  return date;
}

function normalizeLabel(value: string, field: string) {
  const trimmed = value.trim();

  if (!trimmed || trimmed.length > MAX_LABEL_LENGTH) {
    throw new MonthEditError(`Enter a ${field} that is valid for every classification.`);
  }

  return trimmed;
}

function parseNonNegative(raw: string) {
  const value = parseDecimal(raw);

  if (!value || value.isNegative()) {
    throw new MonthEditError("Use only numeric values greater than or equal to zero.");
  }

  if (value.decimalPlaces() > 12 || value.precision() > 30) {
    throw new MonthEditError("One value exceeds the allowed precision limit.");
  }

  return value;
}

function parsePositive(raw: string, maxDecimals = 10) {
  const value = parseDecimal(raw);

  if (!value || !value.greaterThan(0)) {
    throw new MonthEditError("Use only numeric values greater than zero.");
  }

  if (value.decimalPlaces() > maxDecimals || value.precision() > 24) {
    throw new MonthEditError("One value exceeds the allowed precision limit.");
  }

  return value;
}

export function parseDecimal(value: string) {
  const trimmed = value.trim().replace(/\s/g, "");
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  try {
    return new Prisma.Decimal(normalized);
  } catch {
    return null;
  }
}
