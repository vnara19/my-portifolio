import type { AssetType } from "../domain/classification";

/** Product and listing market are independent from portfolio exposure and currency. */
export function productType(type: AssetType, instrument = "", product?: string | null, bondFamily?: string | null) {
  if (type.endsWith("-cash") || type.endsWith("-balance")) return "Cash";
  if (type === "crypto") return "Cryptocurrency";
  if (type === "pension") return "Pension";
  if (type === "treasury") return "Government Bond";
  if (type === "fixed-income") return product || "Fixed Income";
  if (type === "international-bond") return ({ Sovereign: "Government Bond", Corporate: "Corporate Bond", Agency: "Agency Bond", Municipal: "Municipal Bond", Supranational: "Supranational Bond", CD: "Negotiable CD", Covered: "Covered Bond", Securitized: "Securitized Bond", Other: "Debt Security" } as Record<string, string>)[bondFamily ?? ""] || "Bond";
  if (instrument === "FII") return "Real Estate Fund";
  if (type.endsWith("-etf") || /ETF/.test(instrument)) return "ETF";
  if (/ETC/.test(instrument)) return "ETC";
  if (/ETN/.test(instrument)) return "ETN";
  if (type.endsWith("-stock") || /^(EU_STOCK|ACAO|EQUITY|STOCK)$/.test(instrument)) return "Stock";
  if (/FUND/.test(instrument)) return "Fund";
  return "Unclassified Product";
}

export function listingMarket(type: AssetType) {
  if (type.startsWith("us-")) return "United States";
  if (type.startsWith("br-") && type !== "brl-cash") return "Brazil";
  if (type === "eu-market") return "Europe";
  if (type === "treasury" || type === "fixed-income") return "Brazil";
  // Currency and issuer country do not identify a bond's trading venue.
  return "Not Applicable / Not Specified";
}
