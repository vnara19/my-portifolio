import { Prisma } from "@/generated/prisma/client";

export type GainIssue = "historical-fx" | "transfer-cost" | "purchase-history" | "ledger-mismatch";
export type PortfolioGains = {
  issue?: GainIssue;
  unrealizedUsd: number | null;
  unrealizedPercent: number | null;
  realizedUsd: number | null;
  totalUsd: number | null;
};
export type GainMovement = {
  holding: string;
  kind: "OPENING" | "CONTRIBUTION" | "WITHDRAWAL" | "INCOME";
  quantity: number;
  amountBrl: number;
  usdRate: number | null;
  transferId: string | null;
  costRecoveryUsd?: number;
};
export type GainSnapshot = { holding: string; quantity: number; valueUsd: number | null };
export const unavailableGains = (): PortfolioGains => ({ unrealizedUsd: null, unrealizedPercent: null, realizedUsd: null, totalUsd: null });

/** USD average cost uses FX at acquisition, not today's FX. Incomplete ledgers are not estimates. */
export function portfolioGains(movements: GainMovement[], snapshots: GainSnapshot[], onIssue?: (issue: GainIssue) => void): PortfolioGains {
  const missing=(issue:GainIssue)=>{onIssue?.(issue);return unavailableGains();};
  const costs = new Map<string, { units: Prisma.Decimal; cost: Prisma.Decimal }>();
  let realized = new Prisma.Decimal(0);
  for (const movement of movements) {
    // Transfers need carried acquisition cost across accounts; do not treat them as sales.
    const capitalized = movement.kind === "INCOME" && movement.quantity > 0;
    if (movement.transferId) return missing("transfer-cost");
    if (!capitalized && (movement.usdRate === null || !Number.isFinite(movement.usdRate) || movement.usdRate <= 0)) return missing("historical-fx");
    const state = costs.get(movement.holding) ?? { units: new Prisma.Decimal(0), cost: new Prisma.Decimal(0) };
    const units = new Prisma.Decimal(movement.quantity);
    const amount = new Prisma.Decimal(movement.amountBrl).div(capitalized ? 1 : movement.usdRate!);
    if (movement.kind === "OPENING" || movement.kind === "CONTRIBUTION") {
      if (units.lte(0) || amount.lt(0)) return missing("purchase-history");
      state.units = state.units.plus(units);
      state.cost = state.cost.plus(amount);
    } else if (movement.kind === "WITHDRAWAL") {
      if (units.lte(0) || units.minus(state.units).gt("0.00000001") || state.units.lte(0)) return missing("purchase-history");
      const removed = state.cost.mul(Prisma.Decimal.min(units.div(state.units), 1));
      state.cost = state.cost.minus(removed);
      state.units = state.units.minus(units);
      realized = realized.plus(amount.minus(removed));
    } else if (units.eq(0)) {
      // Paid income is realized, but generic income is not necessarily a dividend.
      const recovery = new Prisma.Decimal(movement.costRecoveryUsd ?? 0);
      if (!recovery.isFinite() || recovery.lt(0) || recovery.gt(state.cost)) return missing("purchase-history");
      state.cost = state.cost.minus(recovery);
      realized = realized.plus(amount.minus(recovery));
    } else {
      state.units = amount.lt(0) ? state.units.minus(units) : state.units.plus(units);
      if (state.units.lt(0)) return missing("purchase-history");
      if (state.units.eq(0) && amount.lt(0)) { realized = realized.minus(state.cost); state.cost = new Prisma.Decimal(0); }
    }
    costs.set(movement.holding, state);
  }
  let value = new Prisma.Decimal(0);
  let invested = new Prisma.Decimal(0);
  const seen = new Set<string>();
  for (const snapshot of snapshots) {
    const state = costs.get(snapshot.holding);
    if (!state || snapshot.valueUsd === null) return missing("purchase-history");
    if(state.units.minus(snapshot.quantity).abs().gt("0.00000001")) return missing("ledger-mismatch");
    seen.add(snapshot.holding);
    value = value.plus(snapshot.valueUsd);
    invested = invested.plus(state.cost);
  }
  // Include fully sold holdings in realized gains, and reject missing open positions.
  for (const [key, state] of costs) if (!seen.has(key) && state.units.abs().gt("0.00000001")) return missing("ledger-mismatch");
  const unrealized = value.minus(invested);
  return {
    unrealizedUsd: unrealized.toDecimalPlaces(2).toNumber(),
    unrealizedPercent: invested.gt(0) ? unrealized.div(invested).mul(100).toNumber() : null,
    realizedUsd: realized.toDecimalPlaces(2).toNumber(),
    totalUsd: unrealized.plus(realized).toDecimalPlaces(2).toNumber(),
  };
}
