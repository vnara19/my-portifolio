import { BRAZILIAN_DEBT_PRODUCTS } from "../domain/brazilian-fixed-income";
import type { AssetType } from "../domain/classification";

/** User-facing products mirror the supported Add position flows, not bond details. */
export const PRODUCT_TYPES = ["Stock", "REIT/FII", "ETF", "Savings", ...BRAZILIAN_DEBT_PRODUCTS, "Bonds", "Tesouro Direto", "Cash Account", "Pension Plan", "Cryptocurrency"] as const;
export const LEGACY_DEBT_PRODUCTS = BRAZILIAN_DEBT_PRODUCTS;
export function reviewedDebtProduct(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("displayProduct" in value)) return null;
  const product = value.displayProduct;
  return typeof product === "string" && (LEGACY_DEBT_PRODUCTS as readonly string[]).includes(product) ? product : null;
}

/** Product and listing market are independent from portfolio exposure and currency. */
export function productType(type: AssetType, instrument = "", product?: string | null, bondFamily?: string | null, cryptoSubclass?: string | null) {
  if ((type === "crypto" || type.endsWith("-cash") || type.endsWith("-balance")) && cryptoSubclass === "Stablecoin") return "Cryptocurrency";
  if (type.endsWith("-cash") || type.endsWith("-balance")) return "Cash Account";
  if (type === "crypto") return "Cryptocurrency";
  if (type === "savings") return "Savings";
  if (type === "pension") return "Pension Plan";
  if (type === "treasury") return "Tesouro Direto";
  if (type === "fixed-income") return product && (BRAZILIAN_DEBT_PRODUCTS as readonly string[]).includes(product) ? product : "";
  if (type === "international-bond") return "Bonds";
  if (instrument === "EU_ETC" || instrument === "ETC") return "ETF";
  if (["REIT", "EU_REIT", "FII"].includes(instrument)) return "REIT/FII";
  if (type.endsWith("-etf") || /ETF/.test(instrument)) return "ETF";
  if (type.endsWith("-stock") || /^(EU_STOCK|ACAO|EQUITY|STOCK)$/.test(instrument)) return "Stock";
  return "";
}

export function listingMarket(type: AssetType, currency?: string, issuerCountry?: string | null) {
  if (type === "crypto") return "Global";
  if (type === "savings") return issuerCountry || (currency === "BRL" ? "Brazil" : "Europe");
  if (type === "international-bond" && issuerCountry) return ({ US: "United States", USA: "United States", "United States of America": "United States", BR: "Brazil", Brasil: "Brazil", IE: "Ireland" } as Record<string, string>)[issuerCountry] ?? issuerCountry;
  if (type.endsWith("-cash") || type.endsWith("-balance") || type === "pension") return currency === "EUR" || type === "eur-balance" ? "Europe" : currency === "USD" || type === "usd-balance" ? "United States" : "Brazil";
  if (type.startsWith("us-")) return "United States";
  if (type.startsWith("br-") && type !== "brl-cash") return "Brazil";
  if (type === "eu-market") return "Europe";
  if (type === "treasury" || type === "fixed-income") return "Brazil";
  // Account currency and bond issuer geography follow the user's chosen reporting convention.
  return "Other Markets";
}
