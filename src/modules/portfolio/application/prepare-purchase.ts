import { Prisma } from "@/generated/prisma/client";
import { usdReferenceNote } from "../domain/trade-reporting-fx";
import { fetchReferenceFxLatest } from "@/modules/quotes/infrastructure/frankfurter";
import { purchaseCost, purchaseNote, type PurchaseInput } from "@/modules/portfolio/domain/purchase-cost";

/** Resolve execution-date FX before opening the position-write transaction. */
export async function preparePurchase(input: PurchaseInput, quantity: string, currency: string, latestDay: string) {
  if (input.currency !== currency) throw new Error("The trade currency must match the verified trading currency.");
  const date = new Date(`${input.occurredOn}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.occurredOn || input.occurredOn > latestDay) throw new Error("Choose a trade date on or before the reporting date.");
  purchaseCost(quantity, input.price, input.commission, 1, input.side, input.amountInvested);
  const usdRequest = fetchReferenceFxLatest("USD", input.occurredOn);
  let [native, usd] = await Promise.all([
    currency === "BRL" ? Promise.resolve({ day: input.occurredOn, value: 1 }) : currency === "USD" ? usdRequest : fetchReferenceFxLatest("EUR", input.occurredOn),
    usdRequest,
  ]);
  if (currency === "EUR" && native.day !== usd.day) {
    const commonDay = native.day < usd.day ? native.day : usd.day;
    [native, usd] = await Promise.all([fetchReferenceFxLatest("EUR", commonDay), fetchReferenceFxLatest("USD", commonDay)]);
    if (native.day !== usd.day) throw new Error("The reference exchange rates do not share an observation date.");
  }
  if ([native, usd].some((point) => date.getTime() - new Date(`${point.day}T00:00:00Z`).getTime() > 7 * 86400000)) throw new Error("No recent exchange-rate observation is available for this trade date.");
  const reportingNote = input.currency === "USD" ? "" : usdReferenceNote({
    tradeDay: input.occurredOn, day: usd.day, currency: input.currency,
    usdPerUnit: new Prisma.Decimal(native.value).div(usd.value).toFixed(),
    fetchedAt: new Date().toISOString(),
  });
  return { input, date, native, usd, reportingNote, cost: purchaseCost(quantity, input.price, input.commission, native.value, input.side, input.amountInvested), note: purchaseNote(input, quantity, String(native.value)) + reportingNote };
}
