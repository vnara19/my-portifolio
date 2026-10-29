import { MATURITY_EXIT_NOTE } from "./maturity-exits";
import { sameSavedClassifications } from "../domain/saved-classification";
import { ensureDatedMonth } from "./month-rollover";
import { carryDatedPositions } from "./carry-dated-position";

/** Transactional edits require user ownership and a dated reporting month. Verify tickers and classifications server-side; preserve historical months. */
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
import { MAX_LIQUIDITY_LENGTH, normalizeLiquidity, automaticLiquidity } from "@/modules/portfolio/domain/liquidity";
import { autoIncomeParts, indexerOfSubclass, supportsAutoIncome } from "@/modules/portfolio/domain/fixed-income-policy";
import { assetTypeOf } from "@/modules/portfolio/domain/classification";
import { classificationIssue } from "@/modules/portfolio/domain/classification";
import { isMarketKind, marketAllocation } from "@/modules/portfolio/domain/market-assets";
import { primeFixedIncomeRates, valueCdiPositions } from "@/modules/portfolio/application/cdi-positions";
import { readVerifiedTicker } from "@/modules/quotes/application/check-ticker";
import { readMonthQuoteValues } from "@/modules/quotes/application/month-quote-values";
import { addMonths, calendarDay, currentReferenceMonth, lastDayOf, toDateKey } from "@/modules/quotes/domain/calendar";
import { isQuoteEditable } from "@/modules/quotes/domain/quote-refresh";

import { automaticAllocation } from "../domain/automatic-allocation";
import { brazilianFixedIncomeSchema, fixedIncomeName, fixedIncomeAllocation, type BrazilianFixedIncome } from "@/modules/portfolio/domain/brazilian-fixed-income";
import { preparePurchase } from "./prepare-purchase";
import { fetchReferenceFxLatest } from "@/modules/quotes/infrastructure/frankfurter";
import { readCurrentTreasuryBook } from "@/modules/quotes/infrastructure/treasury";
import { treasurySeriesOf } from "@/modules/quotes/domain/treasury";
import { tradeBalance } from "../domain/trade-balance";
import { purchaseCost, purchaseNote, type PurchaseInput } from "../domain/purchase-cost";

import { internationalBondSchema, bondAllocation, bondName, bondValue, type InternationalBond } from "@/modules/portfolio/domain/international-bond";

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
  fixedIncomeContract?: BrazilianFixedIncome;
  bondContract?: InternationalBond;
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
  purchase?: PurchaseInput;
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
      carried?: boolean;
      following?: { monthId: string; referenceDate: Date; snapshot: MonthSnapshot; fingerprint: string }[];
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
  if (newAsset?.kind === "savings") throw new MonthEditError("Use the Savings form to register a Savings investment.");
  if (newAsset && ["brl-cash", "usd-balance", "eur-balance"].includes(newAsset.kind)) throw new MonthEditError("Cash-only positions are no longer supported. Add an investment instead.");
  if (newAsset?.bondContract && newAsset.kind !== "international-bond") throw new MonthEditError("Bond terms require International Bonds.");
  const bond = newAsset?.kind === "international-bond" ? internationalBondSchema.parse(newAsset.bondContract) : null;
  const today = toDateKey(calendarDay(new Date()));
  if (bond) {
    if (bond.valuationMode === "Cost" && bond.costEvents?.length) throw new MonthEditError("Record cash receipts after creating the bond purchase.");
    if (bond.settlementDate > today || bond.quotes.some((quote) => quote.date > today)) throw new MonthEditError("Bond dates cannot be in the future.");
    newAsset!.bondContract = bond;
    newAsset!.name = bondName(bond);
    newAsset!.maturityDate = bond.maturityDate;
    newAsset!.autoIncome = false;
    newAsset!.appliedOn = bond.settlementDate;
    if (input.addition.purchase) throw new MonthEditError("Use the direct bond form for this holding.");
    input.addition.value = bond.faceAmount;
  }
  if (newAsset?.kind === "fixed-income" && !newAsset.fixedIncomeContract) throw new MonthEditError("Enter the CDB, LCI or LCA contract terms and maturity date.");
  const fixed = newAsset?.kind === "fixed-income" && newAsset.fixedIncomeContract ? brazilianFixedIncomeSchema.parse(newAsset.fixedIncomeContract) : null;
  if (fixed) {
    fixed.basis = "BUSINESS_252";
    newAsset!.fixedIncomeContract = fixed;
    if (!newAsset!.appliedOn || !newAsset!.maturityDate || newAsset!.maturityDate <= newAsset!.appliedOn) throw new MonthEditError("Enter a maturity date after the purchase date.");
    if (fixed.indexer !== "CDI" && Number(fixed.rate) > 100) throw new MonthEditError("The annual rate must be at most 100%.");
    newAsset!.name = fixedIncomeName(fixed, newAsset!.maturityDate ?? "", newAsset!.appliedOn!);
    newAsset!.autoIncome = true;
  }
  const identity = newAsset && isMarketKind(newAsset.kind) ? await verifiedMarketIdentity(newAsset, input.monthId) : null;
  if (identity && !identity.exposure) throw new MonthEditError("This fund cannot be added until its asset class has been identified.");
  const purchaseDay = input.addition.purchase?.occurredOn ?? bond?.settlementDate ?? newAsset?.appliedOn ?? today;
  const requestedMonth = await (await requirePrisma()).portfolioMonth.findUnique({ where: { id: input.monthId }, select: { id: true } });
  if (!requestedMonth) throw new MonthEditError("The reporting month does not exist.");
  const datedMonth = await ensureDatedMonth(purchaseDay);
  const treasury = newAsset?.kind === "treasury" ? treasurySeriesOf(await readCurrentTreasuryBook(), { symbol: normalizeTicker("treasury", newAsset.ticker ?? "") ?? "" }) : null;
  if (newAsset?.kind === "treasury" && (!treasury || treasury.maturityDate <= toDateKey(calendarDay(new Date())))) throw new MonthEditError("Choose an outstanding security from the official Tesouro Direto list.");
  const seeds = bond ? [bondAllocation(bond)] : fixed ? [fixedIncomeAllocation(fixed, newAsset!.appliedOn!, newAsset!.maturityDate ?? "")] : treasury ? [{ assetClass: "Renda Fixa", subclass: /IPCA|Renda|Educa/i.test(treasury.type) ? "IPCA" : /Selic|Reserva|IGPM/i.test(treasury.type) ? "Pós-fixado" : "Prefixado", duration: "Longo" }] : identity ? marketAllocation(identity) : newAsset?.kind === "crypto" ? automaticAllocation("crypto", newAsset.ticker) : null;
  const allocationInputs = seeds ? seeds.map((seed) => ({ ...seed, weightPercent: "100", ratePercent: fixed?.rate ?? null })) : input.addition.allocations;
  const allocations = allocationInputs.length ? parseAllocations(allocationInputs) : [];

  const db = input.addition.purchase ? await getUserDb() : null;
  const existingAsset = input.addition.purchase && input.addition.assetId ? await db?.asset.findUnique({ where: { id: input.addition.assetId }, select: { baseCurrency: true, assetType: true, quoteSymbol: true } }) : null;
  const purchaseKind = newAsset?.kind ?? existingAsset?.assetType;
  const purchaseCurrency = identity?.currency ?? (purchaseKind === "crypto" ? "USD" : purchaseKind === "treasury" ? "BRL" : existingAsset?.baseCurrency);
  const ownedMonth = input.addition.purchase ? await db?.portfolioMonth.findUnique({ where: { id: datedMonth.id }, select: { referenceDate: true } }) : null;
  if (input.addition.purchase && (!purchaseCurrency || !ownedMonth || !purchaseKind || (!automaticLiquidity(purchaseKind) && purchaseKind !== "treasury"))) throw new MonthEditError("This asset cannot use the market purchase form.");
  let purchase: Awaited<ReturnType<typeof preparePurchase>> | null = null;
  if (input.addition.purchase) {
    let purchaseInput = input.addition.purchase;
    if (purchaseKind === "treasury") {
      if (treasury?.offered === false && purchaseInput.occurredOn >= treasury.points[0].day) throw new MonthEditError("This security is no longer offered. Enter the original purchase date from your confirmation.");
      const rate = purchaseInput.contractedRate;
      if (!rate || !/^-?\d+(?:\.\d{1,8})?$/.test(rate) || new Prisma.Decimal(rate).lte(-100) || new Prisma.Decimal(rate).gt(1000)) throw new MonthEditError("Enter the contracted annual rate from your purchase confirmation.");
      if (purchaseInput.side === "SELL") throw new MonthEditError("Use the existing redemption workflow for a Tesouro Direto sale.");
      if (parseNonNegative(input.addition.value).decimalPlaces() > 2) throw new MonthEditError("Tesouro Direto quantities use increments of 0.01 security.");
      const type = treasury?.type ?? existingAsset?.quoteSymbol ?? "";
      purchaseInput = { ...purchaseInput, contractedIndexer: /IPCA|Renda|Educa/i.test(type) ? "IPCA" : /IGPM/i.test(type) ? "IGPM" : /Selic|Reserva/i.test(type) ? "Selic" : "Fixed" };
    }
    try { purchase = await preparePurchase(purchaseInput, parseNonNegative(input.addition.value).toFixed(), purchaseCurrency!, toDateKey(new Date(Math.min(calendarDay(new Date()).getTime(), lastDayOf(ownedMonth!.referenceDate).getTime())))); }
    catch (error) { throw new MonthEditError(error instanceof Error ? error.message : "Could not verify purchase exchange rates."); }
  }

  let bondFx: { acquisition: Awaited<ReturnType<typeof fetchReferenceFxLatest>>; current: Awaited<ReturnType<typeof fetchReferenceFxLatest>>; usd: Awaited<ReturnType<typeof fetchReferenceFxLatest>> } | null = null;
  if (bond) {
    const bondDb = await getUserDb();
    const bondMonth = await bondDb?.portfolioMonth.findUnique({ where: { id: datedMonth.id }, select: { referenceDate: true } });
    if (!bondMonth) throw new MonthEditError("The reporting month does not exist.");
    const asOf = toDateKey(new Date(Math.min(Date.parse(today), lastDayOf(bondMonth.referenceDate).getTime())));
    if (bond.settlementDate > asOf || bond.quotes.some((quote) => quote.date > asOf)) throw new MonthEditError("Bond dates must be within or before the reporting month.");
    const [acquisition, current, usd] = await Promise.all([fetchReferenceFxLatest(bond.currency, bond.settlementDate), fetchReferenceFxLatest(bond.currency, asOf), fetchReferenceFxLatest("USD", bond.settlementDate)]);
    bondFx = { acquisition, current, usd };
  }
  let fixedFx: Awaited<ReturnType<typeof fetchReferenceFxLatest>> | null = null;
  if (fixed) {
    const fixedDb = await requirePrisma();
    if (newAsset!.appliedOn! > toDateKey(calendarDay(new Date()))) throw new MonthEditError("The purchase date cannot be in the future.");
    fixedFx = await fetchReferenceFxLatest("USD", newAsset!.appliedOn!);
    await primeFixedIncomeRates(fixedDb, fixed.indexer, newAsset!.appliedOn!);
  }
  if (purchase && newAsset && datedMonth.referenceDate < currentReferenceMonth() && !newAsset.manualPriceBrl) newAsset.manualPriceBrl = purchase.cost.unitPriceBrl.toString();
  return withUndo(datedMonth.id, async (transaction, month) => {
    if (bondFx) await transaction.dailyQuote.createMany({ data: [{ symbol: "USD", quoteDate: new Date(bondFx.usd.day), instrumentType: "FIAT", baseCurrency: "USD", valueBrl: bondFx.usd.value, provider: "frankfurter-ecb", fetchedAt: new Date() }], skipDuplicates: true });
    if (fixedFx) await transaction.dailyQuote.createMany({ data: [{ symbol: "USD", quoteDate: new Date(fixedFx.day), instrumentType: "FIAT", baseCurrency: "USD", valueBrl: fixedFx.value, provider: "frankfurter-ecb", fetchedAt: new Date() }], skipDuplicates: true });
    const positions = await transaction.position.findMany({
      where: { portfolioMonthId: month.id },
      select: { id: true, accountId: true, assetId: true },
    });
    const quotes = await readMonthQuoteValues(transaction, month.referenceDate);
    const quoteBySymbol = new Map([...quotes].map(([symbol, quote]) => [symbol, quote.valueBrl]));


    if (bond && bondFx && !quoteBySymbol.has(bond.currency)) {
      await transaction.marketQuote.createMany({ data: [{ referenceDate: month.referenceDate, symbol: bond.currency, instrumentType: "FIAT", baseCurrency: bond.currency, valueBrl: bondFx.current.value, quoteDate: new Date(bondFx.current.day) }], skipDuplicates: true });
      const current = await readMonthQuoteValues(transaction, month.referenceDate, [bond.currency]);
      const value = current.get(bond.currency)?.valueBrl;
      if (value) quoteBySymbol.set(bond.currency, value);
    }

    const observedUsd = purchase?.usd ?? bondFx?.usd ?? fixedFx;
    if (observedUsd && !quoteBySymbol.has("USD")) {
      const fx = new Prisma.Decimal(observedUsd.value);
      await transaction.manualQuote.createMany({ data: [{ userId: SCOPED_USER, referenceDate: month.referenceDate, symbol: "USD", instrumentType: "FIAT", baseCurrency: "USD", valueBrl: fx }], skipDuplicates: true });
      quoteBySymbol.set("USD", fx);
    }
    if (purchase?.input.currency === "EUR" && !quoteBySymbol.has("EUR")) {
      const fx = new Prisma.Decimal(purchase.native.value);
      await transaction.manualQuote.createMany({ data: [{ userId: SCOPED_USER, referenceDate: month.referenceDate, symbol: "EUR", instrumentType: "FIAT", baseCurrency: "EUR", valueBrl: fx }], skipDuplicates: true });
      quoteBySymbol.set("EUR", fx);
    }
    const batch: AdditionBatch = {
      verificationMonthId: input.monthId,
      executionPrice: purchase?.cost.unitPriceBrl,
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

    if (!bond && (await transaction.asset.findUnique({ where: { id: asset.id }, select: { assetType: true } }))?.assetType === "international-bond") throw new MonthEditError("Use International Bonds to record a separate purchase lot.");
    const matches = positions.filter((position) => position.assetId === asset.id);
    const held = matches.find((position) => position.accountId === account.id) ?? (purchase && matches.length === 1 ? matches[0] : undefined);
    if (purchase && !held && matches.length > 1) throw new MonthEditError("This asset is held in multiple accounts. Record the transaction from the position you want to change.");
    if (held && !purchase) throw new MonthEditError("This asset already has a position in this reporting month.");
    if (purchase?.input.side === "SELL" && !held) throw new MonthEditError("You must own this asset in the selected account before selling it.");

    if (purchase) {
      // Preserve an already published USD observation so acquisition basis and gains use the same rate.
      const usdDate = new Date(`${purchase.usd.day}T00:00:00Z`);
      const existingUsd = await transaction.dailyQuote.findFirst({ where: { symbol: "USD", quoteDate: { lte: purchase.date, gte: usdDate } }, orderBy: { quoteDate: "desc" }, select: { valueBrl: true } });
      const usd = existingUsd?.valueBrl ?? new Prisma.Decimal(purchase.usd.value);
      const nativeFx = purchase.input.currency === "USD" ? usd : new Prisma.Decimal(purchase.native.value);
      purchase = { ...purchase, cost: purchaseCost(parseNonNegative(addition.value).toFixed(), purchase.input.price, purchase.input.commission, nativeFx.toString(), purchase.input.side, purchase.input.amountInvested), note: purchaseNote(purchase.input, addition.value, nativeFx.toString()) };
      await transaction.dailyQuote.createMany({ data: [{ symbol: "USD", quoteDate: usdDate, instrumentType: "FIAT", baseCurrency: "USD", valueBrl: usd, provider: "frankfurter-ecb", fetchedAt: new Date() }], skipDuplicates: true });
    }
    if (purchase && asset.quoteSymbol && !quoteBySymbol.has(asset.quoteSymbol)) {
      const recorded = await transaction.dailyQuote.findFirst({ where: { symbol: asset.quoteSymbol, quoteDate: { gte: month.referenceDate, lte: lastDayOf(month.referenceDate) } }, orderBy: { quoteDate: "desc" } });
      const price = recorded?.valueBrl ?? purchase.cost.unitPriceBrl;
      await transaction.manualQuote.createMany({ data: [{ userId: SCOPED_USER, referenceDate: month.referenceDate, symbol: asset.quoteSymbol, instrumentType: "TRADE", baseCurrency: purchase.input.currency, valueBrl: price }], skipDuplicates: true });
      quoteBySymbol.set(asset.quoteSymbol, price);
    }
    if (held && purchase) {
      const sale = purchase.input.side === "SELL";
      const ledger = await transaction.position.findUniqueOrThrow({
        where: { id: held.id },
        select: { openingQuantity: true, unitPriceBrl: true, transactions: {
          orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          select: { kind: true, quantity: true, occurredOn: true, amountBrl: true },
        } },
      });
      if (!ledger.unitPriceBrl) throw new MonthEditError("This position has no market quote.");
      // Validate the dated ledger, not only the final balance: no sale may precede ownership.
      let balance: Prisma.Decimal;
      try {
        balance = tradeBalance(ledger.openingQuantity, [
          ...ledger.transactions.map((entry) => ({ date: entry.occurredOn, quantity: entry.quantity, sale: entry.kind === "WITHDRAWAL" || entry.amountBrl.lt(0) })),
          { date: purchase.date, quantity: purchase.cost.quantity, sale },
        ]);
      } catch (error) {
        throw new MonthEditError(error instanceof Error ? error.message : "Could not validate the trade quantity.");
      }
      if (purchase.date < month.referenceDate || purchase.date > lastDayOf(month.referenceDate)) throw new MonthEditError("The transaction date must fall within its reporting month.");
      await transaction.positionTransaction.create({ data: { userId: SCOPED_USER, positionId: held.id, kind: sale ? PositionTransactionKind.WITHDRAWAL : PositionTransactionKind.CONTRIBUTION, occurredOn: purchase.date, quantity: purchase.cost.quantity, unitPriceBrl: purchase.cost.unitPriceBrl, amountBrl: purchase.cost.amountBrl, note: purchase.note } });
      await transaction.position.update({ where: { id: held.id }, data: { quantity: balance, totalBrl: balance.mul(ledger.unitPriceBrl).toDecimalPlaces(2) } });
      return { created: batch.created };
    }
    if (bond && bondFx) {
      const asOf = toDateKey(new Date(Math.min(Date.parse(today), lastDayOf(month.referenceDate).getTime())));
      const currentFx = quoteBySymbol.get(bond.currency) ?? new Prisma.Decimal(bondFx.current.value);
      const storedUsd = await transaction.dailyQuote.findFirst({ where: { symbol: "USD", quoteDate: { lte: new Date(bond.settlementDate), gte: new Date(bondFx.usd.day) } }, orderBy: { quoteDate: "desc" }, select: { valueBrl: true } });
      const acquisitionFx = bond.currency === "USD" && storedUsd ? storedUsd.valueBrl : new Prisma.Decimal(bondFx.acquisition.value);
      const valuation = bondValue(bond, asOf, currentFx.toString());
      const created = await transaction.position.create({ data: { userId: SCOPED_USER, portfolioMonthId: month.id, accountId: account.id, assetId: asset.id, quantity: bond.faceAmount, unitPriceBrl: valuation.unitPriceBrl, totalBrl: valuation.totalBrl, exchangeRateBrl: currentFx, strategy: normalizeStrategy(addition.strategy) } });
      await transaction.positionAllocation.createMany({ data: allocations.map((allocation) => ({ ...allocation, userId: SCOPED_USER, positionId: created.id })) });
      await transaction.positionTransaction.create({ data: { userId: SCOPED_USER, positionId: created.id, kind: PositionTransactionKind.CONTRIBUTION, occurredOn: new Date(bond.settlementDate), quantity: bond.faceAmount, amountBrl: new Prisma.Decimal(bond.totalPaid).mul(acquisitionFx).toDecimalPlaces(2), note: `Bond acquisition: ${bond.currency} ${bond.totalPaid} total paid including accrued interest and fees; FX ${acquisitionFx.toString()} BRL/${bond.currency}.` } });
      return { created: batch.created };
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

      const executed = purchase?.cost.unitPriceBrl ?? (
        unitPriceBrl
          ? addition.executedPriceBrl
            ? parsePositive(addition.executedPriceBrl, 8)
            : unitPriceBrl
          : null);
      await transaction.positionTransaction.create({
        data: {
          userId: SCOPED_USER,
          positionId: created.id,
          kind: PositionTransactionKind.CONTRIBUTION,
          occurredOn: purchase?.date ?? dates?.appliedOn ?? transactionDay(month.referenceDate),
          quantity,

          unitPriceBrl: executed,
          amountBrl: purchase?.cost.amountBrl ?? (executed ? quantity.mul(executed).toDecimalPlaces(2) : totalBrl),
          ...(purchase ? { note: purchase.note } : {}),
        },
      });


      if (income) {
        const start = dates?.appliedOn && dates.appliedOn < month.referenceDate ? dates.appliedOn : month.referenceDate;
        await transaction.position.update({ where: { id: created.id }, data: { calculationStartDate: start } });
        await valueCdiPositions(transaction, { where: { id: created.id } });
      }
    }

    return hasCreated(batch.created) ? { created: batch.created } : undefined;
  }, { carryForward: true });
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
        allocations: { select: { assetClass: true, subclass: true, duration: true, weight: true, ratePercent: true } },
      },
    });

    if (!position) {
      throw new MonthEditError("The position does not belong to this reporting month.");
    }


    if (!sameSavedClassifications(allocations, position.allocations)) {
      throw new MonthEditError("Classification is assigned automatically when adding an asset; manual allocation edits are not supported.");
    }

    // (spec 057).
    await transaction.position.update({
      where: { id: position.id },
      data: { strategy: normalizeStrategy(input.edit.strategy) },
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

    await applyAutoIncome(transaction, month, position, await assertIncomeRates(transaction, position.assetId, allocations, true));

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
      where: { positionId: position.id, OR: [{ note: MATURITY_EXIT_NOTE }, { note: { startsWith: LIQUIDATION_NOTE } }, { note: { startsWith: "Liquidação" } }] },
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
  preserveSavedRates = false,
) {
  const asset = await transaction.asset.findUniqueOrThrow({
    where: { id: assetId },
    select: { autoIncome: true, quoteSymbol: true, assetType: true, baseCurrency: true, name: true, cashAccount: true },
  });
  const supported = !asset.quoteSymbol && supportsAutoIncome(assetTypeOf(asset));

  if (preserveSavedRates && !supported) return false;

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
  const db=await requirePrisma();
  const owned=await db.position.findFirst({where:{id:input.positionId,portfolioMonthId:input.monthId},select:{assetId:true,asset:{select:{assetType:true}}}});
  if(owned?.asset.assetType === "savings")return (await import("./savings")).removeSavings(owned.assetId);
  return withUndo(input.monthId, async (transaction, month) => {
    const linkedMovement = await transaction.positionTransaction.findFirst({
      where: {
        positionId: input.positionId,
        position: { portfolioMonthId: month.id },
        transferId: { not: null },
      },
      select: { id: true },
    });
    if (linkedMovement) {
      throw new MonthEditError("This position has linked cash movements. Remove those transactions before deleting the position.");
    }

    const removed = await transaction.position.deleteMany({
      where: { id: input.positionId, portfolioMonthId: month.id },
    });

    if (removed.count === 0) {
      throw new MonthEditError("The position does not belong to this reporting month.");
    }
  });
}

type AdditionBatch = {
  verificationMonthId: string;
  executionPrice?: Prisma.Decimal;
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
    // New entries use one internal portfolio container; legacy account IDs remain
    // supported for edits, transactions and restored historical backups.
    let institution = await transaction.institution.findFirst({ where: { normalizedName: normalizeKey("Portfolio") }, orderBy: { id: "asc" }, select: { id: true } });
    if (!institution) {
      institution = await transaction.institution.create({ data: { userId: SCOPED_USER, name: "Portfolio", normalizedName: normalizeKey("Portfolio") }, select: { id: true } });
      batch.created.institutionIds.push(institution.id);
    }
    let account = await transaction.account.findFirst({ where: { institutionId: institution.id, name: "Main" }, orderBy: { id: "asc" }, select: { id: true } });
    if (!account) {
      account = await transaction.account.create({ data: { userId: SCOPED_USER, institutionId: institution.id, name: "Main" }, select: { id: true } });
      batch.created.accountIds.push(account.id);
    }
    return { id: account.id, institutionName: "Portfolio" };
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
      select: { id: true, quoteSymbol: true, assetType: true, maturityDate: true, fixedIncomeContract: true, name: true, baseCurrency: true, cashAccount: true },
    });

    if (!asset) {
      throw new MonthEditError("The selected asset does not exist.");
    }

    if (["brl-cash", "usd-balance", "eur-balance"].includes(assetTypeOf(asset))) throw new MonthEditError("Cash-only positions are no longer supported.");
    if (asset.maturityDate && toDateKey(asset.maturityDate) <= (addition.purchase?.occurredOn ?? toDateKey(calendarDay(new Date())))) throw new MonthEditError("This investment has matured. Register a new investment instead.");
    return asset;
  }

  const input = addition.newAsset;

  if (!input) {
    throw new MonthEditError("Choose the position asset.");
  }

  const definition = ASSET_KIND_DEFINITIONS[input.kind];
  const identity = isMarketKind(input.kind) ? await verifiedMarketIdentity(input, batch.verificationMonthId) : null;
  const officialTreasury = input.kind === "treasury" ? treasurySeriesOf(await readCurrentTreasuryBook(), { symbol: normalizeTicker("treasury", input.ticker ?? "") ?? "" }) : null;
  const name = requireName(identity ? identity.name.slice(0, MAX_ASSET_NAME_LENGTH) : officialTreasury ? officialTreasury.name.slice(0, MAX_ASSET_NAME_LENGTH) : input.name, MAX_ASSET_NAME_LENGTH, "the asset name");
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
      ticker: input.bondContract?.identifier ?? symbol,
      quoteSymbol: symbol,
      baseCurrency: input.bondContract?.currency ?? identity?.currency ?? baseCurrencyOf(input.kind, symbol),
      maturityDate,
      liquidity: input.kind === "fixed-income" ? "No vencimento" : automaticLiquidity(input.kind, identity?.exposure ?? null) ?? normalizeLiquidity(input.liquidity)?.slice(0, MAX_LIQUIDITY_LENGTH) ?? null,
      quoteProviderId,
      cashAccount: Boolean(input.cashAccount) && (input.kind === "brl-cash" || input.kind === "usd-balance" || input.kind === "eur-balance"),

      assetType: identity?.assetType ?? input.kind,
      ...(input.kind === "international-bond" && input.bondContract ? { fixedIncomeContract: input.bondContract } : {}),
      ...(input.kind === "fixed-income" && input.fixedIncomeContract ? { fixedIncomeContract: input.fixedIncomeContract } : {}),
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
  const identity = isMarketKind(input.kind) ? await verifiedMarketIdentity(input, batch.verificationMonthId) : null;
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
    userId: await currentUserId(), monthId: batch.verificationMonthId,
  }) : null;

  if (!verified || verified.symbol !== symbol || verified.kind !== input.kind) {
    throw new MonthEditError(`Ticker verification for ${symbol} has expired. Verify the ticker again and try saving.`);
  }

  const useFetched = verified.status === "found" && verified.priceBrl !== null && batch.isCurrentMonth;
  const official = useFetched ? new Prisma.Decimal(verified.priceBrl!).toDecimalPlaces(8) : null;
  const typed = input.manualPriceBrl ? parsePositive(input.manualPriceBrl, 8) : !official ? batch.executionPrice ?? null : null;

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
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${"portfolio-edits"}))`;
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

      if (entry.carried) {
        const known = new Set((entry.following ?? []).map((later) => later.monthId));
        const latest = await transaction.portfolioMonth.findMany({ where: { referenceDate: { gt: month.referenceDate } }, select: { id: true } });
        if (latest.some((later) => !known.has(later.id))) throw new MonthEditError("A new reporting month was created after this purchase. This change can no longer be undone safely.");
      }
      for (const later of entry.following ?? []) {
        const current = await readSnapshot(transaction, { id: later.monthId, referenceDate: later.referenceDate });
        if (fingerprint(current) !== later.fingerprint) throw new MonthEditError("A later reporting month changed. Undoing would overwrite another change.");
      }
      for (const later of entry.following ?? []) await restoreSnapshot(transaction, { id: later.monthId, referenceDate: later.referenceDate }, later.snapshot);
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
  options: { carryForward?: boolean; linkedMonths?: boolean } = {},
) {
  const prisma = await requirePrisma();
  const userId = await currentUserId();

  try {
    return await prisma.$transaction(
      async (transaction) => {
        // Serialize edits so simultaneous trades cannot spend the same units twice.
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${"portfolio-edits"}))`;
        const month = await assertEditable(transaction, monthId);
        const before = await readSnapshot(transaction, month);
        const later = (options.carryForward || options.linkedMonths) ? await transaction.portfolioMonth.findMany({ where: { referenceDate: { gt: month.referenceDate } }, orderBy: { referenceDate: "asc" }, select: { id: true, referenceDate: true } }) : [];
        const previous = await Promise.all(later.map((m) => readSnapshot(transaction, m)));
        const extras = await mutate(transaction, month);
        const after = await readSnapshot(transaction, month);
        if (options.carryForward) {
          try { await carryDatedPositions(transaction, month, before.positions, after.positions); }
          catch (error) { throw new MonthEditError(error instanceof Error ? error.message : "Could not update later reporting months."); }
        }
        const following = await Promise.all(later.map(async (m, i) => ({ monthId: m.id, referenceDate: m.referenceDate, snapshot: previous[i], fingerprint: fingerprint(await readSnapshot(transaction, m)) })));
        const undoToken = storeUndo(userId, {
          kind: "restore",
          monthId: month.id,
          snapshot: before,
          fingerprint: fingerprint(after),
          expiresAt: Date.now() + UNDO_TTL_MS,
          created: extras?.created,
          assets: extras?.assets,
          following,
          carried: options.carryForward || options.linkedMonths,
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
