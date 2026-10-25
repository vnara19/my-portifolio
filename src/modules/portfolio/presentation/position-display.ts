import type { AssetType } from "../domain/classification";

/** Listing/contract currency is distinct from crypto units (BTC, Altcoins). */
export function valuationCurrency(assetType: AssetType, baseCurrency: string): "BRL" | "USD" | "EUR" {
  if (assetType === "crypto") return "USD";
  return baseCurrency === "USD" || baseCurrency === "EUR" ? baseCurrency : "BRL";
}

export function nativePositionValue(input: { assetType: AssetType; baseCurrency: string; totalBrl: number; quantity: number; usdRate: number | null; eurRate: number | null; bondCost?: number }) {
  const currency = valuationCurrency(input.assetType, input.baseCurrency);
  if (input.assetType === "usd-balance" || input.assetType === "eur-balance") return input.quantity;
  if (input.bondCost !== undefined) return input.bondCost;
  if (currency === "BRL") return input.totalBrl;
  const rate = currency === "EUR" ? input.eurRate : input.usdRate;
  return rate !== null && Number.isFinite(rate) && rate > 0 ? input.totalBrl / rate : null;
}

/** Cash and balance-only holdings have no security count; never repeat cash as Quantity. */
export function hasSecurityQuantity(assetType: AssetType, quoteSymbol: string | null) {
  return !["brl-cash", "usd-balance", "eur-balance"].includes(assetType) && Boolean(quoteSymbol);
}

/** Convert the stored valuation unit price using the same reporting-month FX as the row. */
export function nativeUnitPrice(priceBrl: number | null, currency: "BRL" | "USD" | "EUR", usdRate: number | null, eurRate: number | null) {
  if (priceBrl === null || !Number.isFinite(priceBrl) || priceBrl < 0) return null;
  if (currency === "BRL") return priceBrl;
  const rate = currency === "EUR" ? eurRate : usdRate;
  return rate !== null && Number.isFinite(rate) && rate > 0 ? priceBrl / rate : null;
}
