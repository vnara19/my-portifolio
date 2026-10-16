import { Prisma } from "@/generated/prisma/client";

export type PurchaseInput = { price: string; commission: string; currency: "USD" | "EUR" | "BRL"; occurredOn: string };

/** Exact decimal purchase cost; commission increases basis, never the position's market value. */
export function purchaseCost(quantity: string, price: string, commission: string, fxBrl: string | number) {
  const decimal = (raw: string, positive: boolean, scale: number) => {
    if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error("Enter a valid purchase amount.");
    const value = new Prisma.Decimal(raw);
    if (!value.isFinite() || (positive ? value.lte(0) : value.lt(0)) || value.decimalPlaces() > scale || value.precision() > 24) throw new Error("Review the purchase price, quantity and commission.");
    return value;
  };
  const units = decimal(quantity, true, 12);
  const unit = decimal(price, true, 8);
  const fee = decimal(commission, false, 8);
  const fx = new Prisma.Decimal(fxBrl);
  if (!fx.isFinite() || fx.lte(0)) throw new Error("The purchase exchange rate is unavailable.");
  const nativeCost = units.mul(unit).plus(fee);
  if (units.gte("1e18") || unit.mul(fx).gte("1e16") || nativeCost.mul(fx).gte("1e22")) throw new Error("The purchase exceeds the supported amount limit.");
  return { quantity: units, nativeCost, unitPriceBrl: unit.mul(fx).toDecimalPlaces(8), amountBrl: nativeCost.mul(fx).toDecimalPlaces(2), feeBrl: fee.mul(fx).toDecimalPlaces(8) };
}

/** Existing transaction notes retain the native breakdown through backup, restore and undo. Math uses amountBrl. */
export function purchaseNote(input: PurchaseInput, quantity: string, fxBrl: string) {
  return `Purchase: ${quantity} × ${input.currency} ${input.price}; commission ${input.currency} ${input.commission}; FX ${fxBrl} BRL/${input.currency}.`;
}
