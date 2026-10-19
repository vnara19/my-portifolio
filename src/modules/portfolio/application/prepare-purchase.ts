import { fetchReferenceFxLatest } from "@/modules/quotes/infrastructure/frankfurter";
import { purchaseCost, purchaseNote, type PurchaseInput } from "@/modules/portfolio/domain/purchase-cost";

/** Resolve execution-date FX before opening the position-write transaction. */
export async function preparePurchase(input: PurchaseInput, quantity: string, currency: string, latestDay: string) {
  if (input.currency !== currency) throw new Error("The trade currency must match the verified trading currency.");
  const date = new Date(`${input.occurredOn}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.occurredOn || input.occurredOn > latestDay) throw new Error("Choose a trade date on or before the reporting date.");
  purchaseCost(quantity, input.price, input.commission, 1, input.side);
  const usdRequest = fetchReferenceFxLatest("USD", input.occurredOn);
  const [native, usd] = await Promise.all([
    currency === "BRL" ? Promise.resolve({ day: input.occurredOn, value: 1 }) : currency === "USD" ? usdRequest : fetchReferenceFxLatest("EUR", input.occurredOn),
    usdRequest,
  ]);
  if ([native, usd].some((point) => date.getTime() - new Date(`${point.day}T00:00:00Z`).getTime() > 7 * 86400000)) throw new Error("No recent exchange-rate observation is available for this trade date.");
  return { input, date, native, usd, cost: purchaseCost(quantity, input.price, input.commission, native.value, input.side), note: purchaseNote(input, quantity, String(native.value)) };
}
