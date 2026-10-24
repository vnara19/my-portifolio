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
