import { Prisma } from "@/generated/prisma/client";

export type PurchaseInput = { price: string; commission: string; currency: "USD" | "EUR" | "BRL"; occurredOn: string; side?: "BUY" | "SELL"; amountInvested?: string; contractedRate?: string; contractedIndexer?: "IPCA" | "IGPM" | "Selic" | "Fixed" };

/** Exact trade amounts: commission increases acquisition basis or reduces sale proceeds. */
export function purchaseCost(quantity: string, price: string, commission: string, fxBrl: string | number, side: "BUY" | "SELL" = "BUY", amountInvested?: string) {
  const decimal = (raw: string, positive: boolean, scale: number) => {
    if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error("Enter a valid trade amount.");
    const value = new Prisma.Decimal(raw);
    if (!value.isFinite() || (positive ? value.lte(0) : value.lt(0)) || value.decimalPlaces() > scale || value.precision() > 24) throw new Error("Review the execution price, quantity and commission.");
    return value;
  };
  const units = decimal(quantity, true, 12);
  const unit = decimal(price, true, 8);
  const fee = decimal(commission, false, 8);
  const fx = new Prisma.Decimal(fxBrl);
  if (!fx.isFinite() || fx.lte(0)) throw new Error("The trade exchange rate is unavailable.");
  const principal = amountInvested ? decimal(amountInvested, true, 2) : units.mul(unit);
  if (amountInvested && (side !== "BUY" || principal.minus(units.mul(unit)).abs().gt(units.mul("0.005").plus("0.01")))) throw new Error("The invested amount does not match the quantity and purchase price, allowing for displayed-price rounding.");
  const nativeCost = side === "SELL" ? principal.minus(fee) : principal.plus(fee);
  if (nativeCost.lte(0)) throw new Error("Commission must be less than the sale proceeds.");
  if (units.gte("1e18") || unit.mul(fx).gte("1e16") || nativeCost.mul(fx).gte("1e22")) throw new Error("The trade exceeds the supported amount limit.");
  return { quantity: units, nativeCost, unitPriceBrl: unit.mul(fx).toDecimalPlaces(8), amountBrl: nativeCost.mul(fx).toDecimalPlaces(2), feeBrl: fee.mul(fx).toDecimalPlaces(8) };
}

/** Existing transaction notes retain the native breakdown through backup, restore and undo. Math uses amountBrl. */
export function purchaseNote(input: PurchaseInput, quantity: string, fxBrl: string) {
  return `${input.side === "SELL" ? "Sale" : "Purchase"}: ${quantity} × ${input.currency} ${input.price}; commission ${input.currency} ${input.commission}; FX ${fxBrl} BRL/${input.currency}.${input.amountInvested ? ` Invested ${input.currency} ${input.amountInvested}.` : ""}${input.contractedRate !== undefined ? ` Treasury ${input.contractedIndexer ?? "Fixed"} ${input.contractedRate}% p.a.` : ""}`;
}

/** Fees already belong to total paid/proceeds. This breakdown only changes P&L presentation. */
export function recordedTradeFeeBrl(note: string | null): number {
  const fee = /commission (USD|EUR|BRL) (\d+(?:\.\d+)?); FX (\d+(?:\.\d+)?) BRL\/\1\./.exec(note ?? "");
  return fee ? new Prisma.Decimal(fee[2]).mul(fee[3]).toNumber() : 0;
}

/** Recover source precision only when the canonical note still reconciles with the ledger. */
export function recordedTradeAmounts(input: {
  kind: string; quantity: Prisma.Decimal; unitPriceBrl: Prisma.Decimal | null;
  amountBrl: Prisma.Decimal; note: string | null;
}): { amountBrl: Prisma.Decimal; feeBrl: Prisma.Decimal } | null {
  const match = /^(Purchase|Sale): (\d+(?:\.\d+)?) × (USD|EUR|BRL) (\d+(?:\.\d+)?); commission (USD|EUR|BRL) (\d+(?:\.\d+)?); FX (\d+(?:\.\d+)?) BRL\/(USD|EUR|BRL)\./.exec(input.note ?? "");
  if (!match || match[3] !== match[5] || match[3] !== match[8] ||
    input.kind !== (match[1] === "Sale" ? "WITHDRAWAL" : "CONTRIBUTION") ||
    !input.quantity.eq(match[2]) || !input.unitPriceBrl) return null;
  const price = new Prisma.Decimal(match[4]);
  const fee = new Prisma.Decimal(match[6]);
  const fx = new Prisma.Decimal(match[7]);
  if (fx.lte(0)) return null;
  const invested = new RegExp(` Invested ${match[3]} (\\d+(?:\\.\\d+)?)\\.`).exec(input.note ?? "");
  const principal = invested ? new Prisma.Decimal(invested[1]) : input.quantity.mul(price);
  const amount = (match[1] === "Sale" ? principal.minus(fee) : principal.plus(fee)).mul(fx);
  if (!price.mul(fx).toDecimalPlaces(8).eq(input.unitPriceBrl) || !amount.toDecimalPlaces(2).eq(input.amountBrl)) return null;
  return { amountBrl: amount, feeBrl: fee.mul(fx) };
}
