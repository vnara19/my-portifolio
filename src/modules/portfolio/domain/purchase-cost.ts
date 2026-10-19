import { Prisma } from "@/generated/prisma/client";

export type PurchaseInput = { price: string; commission: string; currency: "USD" | "EUR" | "BRL"; occurredOn: string; side?: "BUY" | "SELL" };

/** Exact trade amounts: commission increases acquisition basis or reduces sale proceeds. */
export function purchaseCost(quantity: string, price: string, commission: string, fxBrl: string | number, side: "BUY" | "SELL" = "BUY") {
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
  const nativeCost = side === "SELL" ? units.mul(unit).minus(fee) : units.mul(unit).plus(fee);
  if (nativeCost.lte(0)) throw new Error("Commission must be less than the sale proceeds.");
  if (units.gte("1e18") || unit.mul(fx).gte("1e16") || nativeCost.mul(fx).gte("1e22")) throw new Error("The trade exceeds the supported amount limit.");
  return { quantity: units, nativeCost, unitPriceBrl: unit.mul(fx).toDecimalPlaces(8), amountBrl: nativeCost.mul(fx).toDecimalPlaces(2), feeBrl: fee.mul(fx).toDecimalPlaces(8) };
}

/** Existing transaction notes retain the native breakdown through backup, restore and undo. Math uses amountBrl. */
export function purchaseNote(input: PurchaseInput, quantity: string, fxBrl: string) {
  return `${input.side === "SELL" ? "Sale" : "Purchase"}: ${quantity} × ${input.currency} ${input.price}; commission ${input.currency} ${input.commission}; FX ${fxBrl} BRL/${input.currency}.`;
}
