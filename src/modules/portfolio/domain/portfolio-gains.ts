import { custodyTransferPair } from "./custody-transfer";
import { Prisma } from "@/generated/prisma/client";

export type GainIssue = "historical-fx" | "transfer-cost" | "purchase-history" | "ledger-mismatch";
export type PortfolioGains = {
  issue?: GainIssue;
  unrealizedUsd: number | null;
  unrealizedPercent: number | null;
  realizedUsd: number | null;
  realizedPercent: number | null;
  totalUsd: number | null;
};
type Currency = "USD" | "EUR" | "BRL";
type DecimalInput = string | number | Prisma.Decimal;
export type GainComposition = {
  totalUsd: number;
  costUsd: number;
  percent: number | null;
  priceUsd: number;
  fxUsd: number;
  adjustmentUsd: number;
  historicalReferences: { day: string; provider: string }[];
};
type NativePurchase = {
  currency: Currency;
  price: DecimalInput;
  usdPerUnit: DecimalInput;
  reference?: { day: string; provider: string };
};
type OpenLot = NativePurchase & { quantity: Prisma.Decimal };
export type GainMovement = {
  holding: string;
  kind: "OPENING" | "CONTRIBUTION" | "WITHDRAWAL" | "INCOME";
  quantity: DecimalInput;
  amountBrl: DecimalInput;
  usdRate: DecimalInput | null;
  transferId: string | null;
  assetId?: string;
  day?: string;
  costRecoveryUsd?: DecimalInput;
  feeBrl?: DecimalInput;
  nativePurchase?: NativePurchase;
};
export type GainSnapshot = {
  holding: string;
  quantity: DecimalInput;
  valueUsd: DecimalInput | null;
  native?: { currency: Currency; total: DecimalInput };
};
export const unavailableGains = (): PortfolioGains => ({ unrealizedUsd: null, unrealizedPercent: null, realizedUsd: null, realizedPercent: null, totalUsd: null });

/** USD average cost uses FX at acquisition, not today's FX. Incomplete ledgers are not estimates. */
export function portfolioGains(movements: GainMovement[], snapshots: GainSnapshot[], onIssue?: (issue: GainIssue) => void, onStep?: (index: number, realized: number) => void, onComposition?: (result: GainComposition) => void, selectedHolding?: string): PortfolioGains {
  const missing=(issue:GainIssue)=>{onIssue?.(issue);return unavailableGains();};
  const costs = new Map<string, { units: Prisma.Decimal; cost: Prisma.Decimal; lots: OpenLot[] }>();
  let realized = new Prisma.Decimal(0);
  let funded = new Prisma.Decimal(0);
  const transfers = new Map<string, GainMovement[]>();
  for (const movement of movements) {
    if (!movement.transferId) continue;
    const legs = transfers.get(movement.transferId) ?? [];
    legs.push(movement);
    transfers.set(movement.transferId, legs);
  }
  const postedTransfers = new Set<string>();
  for (const [index, movement] of movements.entries()) {
    if (movement.transferId) {
      if (!postedTransfers.has(movement.transferId)) {
        const pair = custodyTransferPair(transfers.get(movement.transferId)!.map(leg => ({ ...leg, account: leg.holding })));
        if (!pair) return missing("transfer-cost");
        const { debit, credit, units } = pair;
        const source = costs.get(debit.holding);
        if (!source || !units.gt(0) || units.gt(source.units)) return missing("transfer-cost");
        const destination = costs.get(credit.holding) ?? {
          units: new Prisma.Decimal(0), cost: new Prisma.Decimal(0), lots: [],
        };
        const fraction = units.div(source.units);
        const cost = source.cost.mul(fraction);
        source.units = source.units.minus(units);
        source.cost = source.cost.minus(cost);
        destination.units = destination.units.plus(units);
        destination.cost = destination.cost.plus(cost);
        if (onComposition) {
          destination.lots.push(...source.lots.map(lot => ({ ...lot, quantity: lot.quantity.mul(fraction) })));
          source.lots = fraction.eq(1) ? [] : source.lots.map(lot => ({
            ...lot, quantity: lot.quantity.mul(new Prisma.Decimal(1).minus(fraction)),
          }));
        }
        costs.set(credit.holding, destination);
        postedTransfers.add(movement.transferId);
      }
      onStep?.(index, realized.toNumber());
      continue;
    }
    const included = selectedHolding === undefined || movement.holding === selectedHolding;
    const units = new Prisma.Decimal(movement.quantity);
    const capitalized = movement.kind === "INCOME" && units.gt(0);
    const rate = movement.usdRate === null ? null : new Prisma.Decimal(movement.usdRate);
    if (!capitalized && (!rate?.isFinite() || rate.lte(0))) return missing("historical-fx");
    const state = costs.get(movement.holding) ?? { units: new Prisma.Decimal(0), cost: new Prisma.Decimal(0), lots: [] };
    const amount = new Prisma.Decimal(movement.amountBrl).div(capitalized ? 1 : movement.usdRate!);
    const fee = new Prisma.Decimal(movement.feeBrl ?? 0).div(movement.usdRate ?? 1);
    if (!units.isFinite() || !amount.isFinite() || !fee.isFinite() || fee.lt(0)) return missing("purchase-history");
    if (movement.kind === "OPENING" || movement.kind === "CONTRIBUTION") {
      if (units.lte(0) || amount.lt(0)) return missing("purchase-history");
      state.units = state.units.plus(units);
      if (fee.gt(amount)) return missing("purchase-history");
      state.cost = state.cost.plus(amount);
      if (onComposition && movement.nativePurchase) state.lots.push({ ...movement.nativePurchase, quantity: units });
      if (included) funded = funded.plus(amount);
    } else if (movement.kind === "WITHDRAWAL") {
      if (units.lte(0) || units.minus(state.units).gt("0.00000001") || state.units.lte(0)) return missing("purchase-history");
      const fraction = Prisma.Decimal.min(units.div(state.units), 1);
      const removed = state.cost.mul(fraction);
      if (onComposition) {
        state.lots = fraction.eq(1) ? [] : state.lots.map(lot => ({ ...lot, quantity: lot.quantity.mul(new Prisma.Decimal(1).minus(fraction)) }));
      }
      state.cost = state.cost.minus(removed);
      state.units = state.units.minus(units);
      if (included) realized = realized.plus(amount.minus(removed));
    } else if (units.eq(0)) {
      // Paid income is realized, but generic income is not necessarily a dividend.
      const recovery = new Prisma.Decimal(movement.costRecoveryUsd ?? 0);
      if (!recovery.isFinite() || recovery.lt(0) || recovery.gt(state.cost)) return missing("purchase-history");
      state.cost = state.cost.minus(recovery);
      if (included) realized = realized.plus(amount.minus(recovery));
    } else {
      // Quantity-changing events need a native basis before they can be attributed.
      if (onComposition) state.lots = [];
      state.units = amount.lt(0) ? state.units.minus(units) : state.units.plus(units);
      if (state.units.lt(0)) return missing("purchase-history");
      if (state.units.eq(0) && amount.lt(0)) {
        if (included) realized = realized.minus(state.cost);
        state.cost = new Prisma.Decimal(0);
      }
    }
    costs.set(movement.holding, state);
    onStep?.(index, realized.toNumber());
  }
  let value = new Prisma.Decimal(0);
  let invested = new Prisma.Decimal(0);
  const seen = new Set<string>();
  let compositionAvailable = snapshots.some(snapshot => selectedHolding === undefined || snapshot.holding === selectedHolding);
  let priceEffect = new Prisma.Decimal(0);
  let currencyEffect = new Prisma.Decimal(0);
  const references = new Map<string, { day: string; provider: string }>();
  for (const snapshot of snapshots) {
    const state = costs.get(snapshot.holding);
    if (!state || snapshot.valueUsd === null) return missing("purchase-history");
    if(state.units.minus(snapshot.quantity).abs().gt("0.00000001")) return missing("ledger-mismatch");
    seen.add(snapshot.holding);
    if (selectedHolding !== undefined && snapshot.holding !== selectedHolding) continue;
    value = value.plus(snapshot.valueUsd);
    invested = invested.plus(state.cost);
    if (onComposition) {
      const native = snapshot.native;
      const covered = state.lots.reduce((total, lot) => total.plus(lot.quantity), new Prisma.Decimal(0));
      if (!native || !state.units.gt(0) || covered.minus(state.units).abs().gt("0.00000001") || state.lots.some(lot => lot.currency !== native.currency)) {
        compositionAvailable = false;
        continue;
      }
      const nativeUnit = new Prisma.Decimal(native.currency === "USD" ? snapshot.valueUsd : native.total).div(state.units);
      const dollarUnit = new Prisma.Decimal(snapshot.valueUsd).div(state.units);
      for (const lot of state.lots) {
        priceEffect = priceEffect.plus(lot.quantity.mul(nativeUnit.minus(lot.price)).mul(lot.usdPerUnit));
        currencyEffect = currencyEffect.plus(lot.quantity.mul(dollarUnit.minus(nativeUnit.mul(lot.usdPerUnit))));
        if (lot.reference) references.set(`${lot.reference.provider}:${lot.reference.day}`, lot.reference);
      }
    }
  }
  // Include fully sold holdings in realized gains, and reject missing open positions.
  for (const [key, state] of costs) if (!seen.has(key) && state.units.abs().gt("0.00000001")) return missing("ledger-mismatch");
  const unrealized = value.minus(invested);
  if (onComposition && compositionAvailable) {
    const total = unrealized.toDecimalPlaces(2);
    const price = priceEffect.toDecimalPlaces(2);
    const fx = currencyEffect.toDecimalPlaces(2);
    onComposition({
      totalUsd: total.toNumber(), costUsd: invested.toNumber(),
      percent: invested.gt(0) ? unrealized.div(invested).mul(100).toNumber() : null,
      priceUsd: price.toNumber(), fxUsd: fx.toNumber(),
      adjustmentUsd: total.minus(price).minus(fx).toNumber(),
      historicalReferences: [...references.values()].sort((a, b) => a.day.localeCompare(b.day)),
    });
  }
  return {
    unrealizedUsd: unrealized.toDecimalPlaces(2).toNumber(),
    unrealizedPercent: invested.gt(0) ? unrealized.div(invested).mul(100).toNumber() : null,
    realizedUsd: realized.toDecimalPlaces(2).toNumber(),
    // A contribution-based ratio, explicitly distinct from time-weighted total return.
    realizedPercent: funded.gt(0) ? realized.div(funded).mul(100).toNumber() : null,
    totalUsd: unrealized.plus(realized).toDecimalPlaces(2).toNumber(),
  };
}
