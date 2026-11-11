import { historicalClosingValues } from "./historical-closing-values";
import { recordedBondAcquisition, recordedTradeAmounts, recordedTradeFeeBrl } from "../domain/purchase-cost";
import { reportingFxSeries, tradeReportingFx } from "../domain/trade-reporting-fx";
import type { GainComposition, GainIssue, GainMovement, GainSnapshot } from "../domain/portfolio-gains";
import { Prisma } from "@/generated/prisma/client";
import { readInternationalBond } from "../domain/international-bond";
import { readFixedIncomeContract } from "@/modules/portfolio/domain/brazilian-fixed-income";
import { getUserDb } from "@/lib/user-db";
import { portfolioGains, unavailableGains } from "@/modules/portfolio/domain/portfolio-gains";
import type { MonthPosition } from "./get-month-positions";

type PositionScope = { assetId: string; accountId?: string; valuations: MonthPosition[] };

/** Read only the selected user's ledger, including closed holdings, through the selected month. */
export async function getPortfolioGains(referenceDate: Date, currentUsdRate: number | null, currency: "USD" | "EUR" = "USD", scope?: PositionScope) {
  const db = await getUserDb();
  if (!db) return { ...unavailableGains(), composition: null, byHolding: new Map<string, ReturnType<typeof portfolioGains>>(), byAsset: [], realizedHistory: [] as {day:string;value:number}[] };
  const filter = scope ? { assetId: scope.assetId } : {};
  const end = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1));
  const [transactions, positions, rates, bondAssets] = await Promise.all([
    db.positionTransaction.findMany({
      where: { occurredOn: { lt: end }, position: { ...filter, portfolioMonth: { referenceDate: { lte: referenceDate } } } },
      orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { kind: true, createdAt: true, occurredOn: true, quantity: true, unitPriceBrl: true, amountBrl: true, transferId: true, note: true, position: { select: { accountId: true, assetId: true } } },
    }),
    db.position.findMany({ where: { ...filter, portfolioMonth: { referenceDate }, quantity: { gt: 0 } }, select: { accountId: true, assetId: true, quantity: true, totalBrl: true, asset: { select: { fixedIncomeContract: true, quoteSymbol: true } } } }),
    db.dailyQuote.findMany({ where: { symbol: { in: ["USD", "EUR"] }, quoteDate: { lt: end } }, orderBy: { quoteDate: "asc" }, select: { symbol: true, quoteDate: true, valueBrl: true, provider: true, fetchedAt: true } }),
    db.asset.findMany({ where: scope ? { id: scope.assetId } : {}, select: { id: true, name:true, ticker:true, assetType:true, quoteSymbol:true, fixedIncomeContract: true } }),
  ]);
  const closingValues = await historicalClosingValues(referenceDate, positions.flatMap(p=>p.asset.quoteSymbol?[p.asset.quoteSymbol]:[]));
  for (const position of positions) {
    const close = position.asset.quoteSymbol ? closingValues.get(position.asset.quoteSymbol) : undefined;
    if (close !== undefined) position.totalBrl = position.quantity.mul(close);
  }
  const dailyRates = reportingFxSeries(rates);
  const holding = (row: { accountId: string; assetId: string }) => `${row.accountId}:${row.assetId}`;
  const bonds = new Map(bondAssets.map((asset) => [asset.id, readInternationalBond(asset.fixedIncomeContract)]));
  const interest = new Map<string, { remaining: Prisma.Decimal; usdPerNative: Prisma.Decimal; units: Prisma.Decimal }>();
  // A savings payout is available before same-day withdrawal instructions.
  transactions.sort((a,b) => +a.occurredOn - +b.occurredOn || Number(b.note === "Savings automatic return") - Number(a.note === "Savings automatic return") || +a.createdAt - +b.createdAt);
  const movements = transactions.map((row): GainMovement => {
    const key = holding(row.position);
    const exact = recordedTradeAmounts(row);
    const bond = bonds.get(row.position.assetId);
    const acquisition = bond ? recordedBondAcquisition(row) : null;
    const fx = tradeReportingFx(row.occurredOn.toISOString().slice(0,10), row.note, currency, dailyRates);
    const usdRate = fx?.divisor ?? null;
    const movement: GainMovement = { holding: key, kind: row.kind, quantity: row.quantity, amountBrl: /^Net withdrawal: BRL (\d+(?:\.\d+)?);/.exec(row.note ?? "")?.[1] ?? exact?.amountBrl ?? acquisition?.amountBrl ?? row.amountBrl, usdRate, transferId: row.transferId, assetId: row.position.assetId, day: row.occurredOn.toISOString().slice(0, 10), feeBrl: exact?.feeBrl ?? recordedTradeFeeBrl(row.note), costRecoveryUsd: 0 };
    if (scope && fx?.nativeRate && row.kind === "CONTRIBUTION") {
      const nativePurchase = exact ? { currency: exact.currency, price: exact.price }
        : acquisition;
      if (nativePurchase) movement.nativePurchase = {
        ...nativePurchase, usdPerUnit: fx.nativeRate,
        reference: fx.reference ? { day: fx.reference.day, provider: fx.reference.provider } : undefined,
      };
    }
    if (!bond || !usdRate) return movement;
    let state = interest.get(key);
    if (!state && (row.kind === "CONTRIBUTION" || row.kind === "OPENING")) {
      state = { remaining: new Prisma.Decimal(bond.accruedInterestPaid), usdPerNative: (acquisition?.amountBrl ?? row.amountBrl).div(usdRate).div(bond.totalPaid), units: new Prisma.Decimal(0) };
      interest.set(key, state);
    }
    if (!state) return movement;
    if (row.kind === "CONTRIBUTION" || row.kind === "OPENING") state.units = state.units.plus(row.quantity);
    if (row.kind === "WITHDRAWAL" && state.units.gt(0)) {
      state.remaining = state.remaining.mul(Prisma.Decimal.max(0, new Prisma.Decimal(1).minus(row.quantity.div(state.units))));
      state.units = state.units.minus(row.quantity);
    }
    const coupon = /^Bond coupon: (USD|EUR) (\d+(?:\.\d+)?);/.exec(row.note ?? "");
    if (row.kind === "INCOME" && row.quantity.eq(0) && coupon && coupon[1] === bond.currency && state.remaining.gt(0)) {
      const recovered = Prisma.Decimal.min(state.remaining, new Prisma.Decimal(coupon[2]));
      movement.costRecoveryUsd = recovered.mul(state.usdPerNative).toNumber();
      state.remaining = state.remaining.minus(recovered);
    }
    return movement;
  });
  let issue:GainIssue|undefined;
  const valuations = new Map(scope?.valuations.map(row => [holding(row), row]));
  const snapshots = positions.map((row): GainSnapshot => {
    const valuation = valuations.get(holding(row));
    const rate = currentUsdRate ? new Prisma.Decimal(currentUsdRate) : null;
    return {
      holding: holding(row),
      quantity: readFixedIncomeContract(row.asset?.fixedIncomeContract) && !row.asset.quoteSymbol
        ? transactions.filter(entry => holding(entry.position) === holding(row))
            .reduce((units, entry) => units.plus(entry.kind === "WITHDRAWAL" ? entry.quantity.neg() : entry.quantity), new Prisma.Decimal(0))
        : row.quantity,
      valueUsd: rate?.gt(0) ? row.totalBrl.div(rate) : null,
      native: valuation?.nativeValue != null ? { currency: valuation.valueCurrency, total: valuation.nativeValue } : undefined,
    };
  });
  const breakdown: { composition: GainComposition | null } = { composition: null };
  const realizedHistory: {day:string;value:number}[]=[];
  const gains=portfolioGains(movements, snapshots,reason=>{issue=reason;},(index,value)=>realizedHistory.push({day:transactions[index].occurredOn.toISOString().slice(0,10),value}), scope ? result => { breakdown.composition = result; } : undefined, scope?.accountId ? holding({ accountId: scope.accountId, assetId: scope.assetId }) : undefined);
  const byAsset=[...new Set([...positions.map(p=>p.assetId),...transactions.map(t=>t.position.assetId)])].map(assetId=>{
    const keys=new Set([...positions.filter(p=>p.assetId===assetId).map(holding),...transactions.filter(t=>t.position.assetId===assetId).map(t=>holding(t.position))]);
    const entries=movements.filter(m=>keys.has(m.holding));
    const principal=entries.filter(m=>m.kind==="CONTRIBUTION"||m.kind==="OPENING").reduce((sum,m)=>sum+(m.usdRate?new Prisma.Decimal(m.amountBrl).div(m.usdRate).toNumber():0),0);
    const identity=bondAssets.find(a=>a.id===assetId);
    return {assetId,name:identity?.name??"",ticker:identity?.ticker??null,assetType:identity?.assetType??null,quoteSymbol:identity?.quoteSymbol??null, sold:!positions.some(p=>p.assetId===assetId), principal, ...portfolioGains(movements.filter(m=>keys.has(m.holding)),snapshots.filter(p=>keys.has(p.holding)))};
  });
  const byHolding = new Map<string, ReturnType<typeof portfolioGains>>();
  if (!scope && currency === "USD") {
    const entriesByHolding = new Map<string, GainMovement[]>();
    for (const movement of movements) {
      const entries = entriesByHolding.get(movement.holding) ?? [];
      entries.push(movement);
      entriesByHolding.set(movement.holding, entries);
    }
    const valuationByHolding = new Map(snapshots.map(snapshot => [snapshot.holding, snapshot]));
    for (const key of new Set([...entriesByHolding.keys(), ...valuationByHolding.keys()])) {
      const snapshot = valuationByHolding.get(key);
      const entries = entriesByHolding.get(key) ?? [];
      if (entries.some(entry => entry.transferId)) {
        const assetId = entries[0].assetId;
        byHolding.set(key, portfolioGains(
          movements.filter(entry => entry.assetId === assetId),
          snapshots.filter(row => row.holding.endsWith(`:${assetId}`)),
          undefined, undefined, undefined, key,
        ));
      } else {
        byHolding.set(key, portfolioGains(entries, snapshot ? [snapshot] : []));
      }
    }
  }
  return {...gains, ...breakdown, byHolding,...(issue?{issue}: {}),byAsset,realizedHistory:issue?[]:realizedHistory};
}
