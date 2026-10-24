import type { AssetType } from "../domain/classification";

/** Product and listing market are independent from portfolio exposure and currency. */
export function productType(type: AssetType, instrument = "", product?: string | null, bondFamily?: string | null, cryptoSubclass?: string | null) {
  if (type.endsWith("-cash") || type.endsWith("-balance")) return "Cash Account";
  if (type === "crypto") return cryptoSubclass === "BTC" ? "Bitcoin" : cryptoSubclass === "Stablecoin" ? "Stablecoin" : cryptoSubclass === "Altcoin" ? "Altcoin" : "Digital Asset";
  if (type === "pension") return "Pension Plan";
  if (type === "treasury") return "Tesouro Direto";
  if (type === "fixed-income") return product || "Unspecified Debt Security";
  if (type === "international-bond") return ({ Sovereign: "Government Bond", Corporate: "Corporate Bond", Agency: "Agency Bond", Municipal: "Municipal Bond", Supranational: "Supranational Bond", CD: "Negotiable CD", Covered: "Covered Bond", Securitized: "Securitized Bond", Other: "Debt Security" } as Record<string, string>)[bondFamily ?? ""] || "Bond";
  if (instrument === "REIT" || instrument === "EU_REIT") return "REIT";
  if (instrument === "FII") return "REIT / FII";
  if (type.endsWith("-etf") || /ETF/.test(instrument)) return "ETF";
  if (/ETC/.test(instrument)) return "ETC";
  if (/ETN/.test(instrument)) return "ETN";
  if (type.endsWith("-stock") || /^(EU_STOCK|ACAO|EQUITY|STOCK)$/.test(instrument)) return "Stock";
  if (/FUND/.test(instrument)) return "Fund";
  return "Unclassified Product";
}

export function listingMarket(type: AssetType, currency?: string, issuerCountry?: string | null) {
  if (type === "crypto") return "Global";
  if (type === "international-bond" && issuerCountry) return ({ US: "United States", USA: "United States", "United States of America": "United States", BR: "Brazil", Brasil: "Brazil", IE: "Ireland" } as Record<string, string>)[issuerCountry] ?? issuerCountry;
  if (type.endsWith("-cash") || type.endsWith("-balance") || type === "pension") return currency === "EUR" || type === "eur-balance" ? "Europe" : currency === "USD" || type === "usd-balance" ? "United States" : "Brazil";
  if (type.startsWith("us-")) return "United States";
  if (type.startsWith("br-") && type !== "brl-cash") return "Brazil";
  if (type === "eu-market") return "Europe";
  if (type === "treasury" || type === "fixed-income") return "Brazil";
  // Account currency and bond issuer geography follow the user's chosen reporting convention.
  return "Other Markets";
}
