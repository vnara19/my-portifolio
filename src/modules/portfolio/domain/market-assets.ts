import { z } from "zod";
import type { AllocationSeed, AssetKind } from "./asset-kinds";

export const MARKET_KINDS = ["us-market", "br-market", "eu-market"] as const;
export function isMarketKind(kind: AssetKind): kind is typeof MARKET_KINDS[number] {
  return (MARKET_KINDS as readonly string[]).includes(kind);
}
export const marketIdentitySchema = z.object({
  name: z.string().min(1).max(200),
  currency: z.enum(["USD", "EUR", "BRL"]),
  instrumentType: z.string().min(1).max(30),
  assetType: z.enum(["us-etf", "us-stock", "br-etf", "br-stock", "eu-market", "us-market", "br-market"]),
  exposure: z.enum(["equity", "bond", "commodity", "cash", "real-estate"]).nullable(),
  exchange: z.string().max(100),
  isin: z.string().max(12).nullable(),
  source: z.string().max(500),
});
export type MarketIdentity = z.infer<typeof marketIdentitySchema>;

/** Public listing references, not user holdings. Explicit exchange selection is required. */
export const EUROPEAN_LISTINGS = [
  { symbol: "UETW.DE", name: "UBS Core MSCI World", exchange: "Xetra", currency: "EUR", isin: "IE00BD4TXV59", exposure: "equity", source: "https://www.ubs.com/de/en/assetmanagement/funds/etf.html/ie00bd4txv59-ubs-core-msci-world-ucits-etf-usd-acc-pd001" },
  { symbol: "XDWT.DE", name: "Xtrackers MSCI World Information Technology", exchange: "Xetra", currency: "EUR", isin: "IE00BM67HT60", exposure: "equity", source: "https://etf.dws.com/en-gb/IE00BM67HT60-msci-world-information-technology-ucits-etf-1c/" },
  { symbol: "EGLN.L", name: "iShares Physical Gold ETC", exchange: "London", currency: "EUR", isin: "IE00B4ND3602", exposure: "commodity", source: "https://www.ishares.com/uk/individual/en/products/258441/ishares-physical-gold-etc-fund" },
  { symbol: "PPFD.SG", name: "iShares Physical Silver ETC", exchange: "Stuttgart", currency: "EUR", isin: "IE00B4NCWG09", exposure: "commodity", source: "https://www.ishares.com/uk/professionals/en/products/258443/ishares-physical-silver-etc-fund" },
  { symbol: "CSH2.PA", name: "Amundi Smart Overnight Return UCITS ETF Acc", exchange: "Paris", currency: "EUR", isin: "LU1190417599", exposure: "cash", source: "https://www.amundietf.com/pdfDocuments/kiid/LU1190417599/ENG/GBR/20260211" },
] as const;

export function marketIdentity(kind: typeof MARKET_KINDS[number], symbol: string, meta: { name: string | null; currency: string | null; instrumentType: string | null; exchange: string | null }): MarketIdentity {
  if (meta.currency !== "EUR" && meta.currency !== "USD" && meta.currency !== "BRL") throw new Error("This listing's trading currency is not supported. Choose a EUR, USD or BRL listing.");
  const references: readonly { symbol: string; exposure: MarketIdentity["exposure"]; source: string; currency: string; name?: string; isin?: string }[] = [
    ...EUROPEAN_LISTINGS,
    { symbol: "BND", currency: "USD", exposure: "bond", source: "https://advisors.vanguard.com/investments/products/bnd/vanguard-total-bond-market-etf" },
    { symbol: "VOO", currency: "USD", exposure: "equity", source: "https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/fact-sheet/F0968.pdf" },
    { symbol: "IMAB11.SAO", currency: "BRL", exposure: "bond", source: "https://www.itnow.com.br/imab11/" },
    { symbol: "EUNA.DE", currency: "EUR", exposure: "bond", isin: "IE00BDBRDM35", source: "https://www.ishares.com/it/investitore-privato/it/prodotti/291770/ishares-core-global-aggregate-bond-ucits-etf-eur-hedged-acc-fund" },
  ];
  const reference = references.find((listing) => listing.symbol === symbol);
  if (reference && reference.currency !== meta.currency) throw new Error("The listing currency differs from the issuer reference. Please verify the listing.");
  if ((kind === "us-market" && meta.currency !== "USD") || (kind === "br-market" && meta.currency !== "BRL")) throw new Error("The ticker belongs to a different market or trading currency.");
  const etf = meta.instrumentType === "ETF";
  const stock = meta.instrumentType === "EQUITY" && !/\b(ETF|ETC|ETN|UCITS)\b/i.test(meta.name ?? "");
  // The full legal product name identifies a Brazilian FII; a ticker ending in 11 does not.
  const fii = kind === "br-market" && /fundo de investimento imobili[aá]rio/i.test(meta.name ?? "");
  const exposure = reference?.exposure ?? (fii ? "real-estate" : stock ? "equity" : null);
  return {
    name: meta.name ?? reference?.name ?? symbol,
    currency: meta.currency,
    instrumentType: kind === "eu-market" ? `EU_${reference?.exposure === "commodity" ? "ETC" : etf ? "ETF" : stock ? "STOCK" : "FUND"}` : etf ? "ETF" : "ACAO",
    assetType: kind === "eu-market" ? "eu-market" : kind === "us-market" ? etf ? "us-etf" : stock ? "us-stock" : "us-market" : etf ? "br-etf" : stock ? "br-stock" : "br-market",
    exposure, exchange: meta.exchange ?? "", isin: reference?.isin ?? null,
    source: reference?.source ?? "Yahoo Finance instrument metadata",
  };
}

export function marketAllocation(identity: MarketIdentity): AllocationSeed[] {
  switch (identity.exposure) {
    case "equity": return [{ assetClass: "Renda Variável", subclass: identity.assetType.startsWith("us-") ? "Ações EUA" : identity.assetType.startsWith("br-") ? "Ações BR" : "Ações - Ex: USA", duration: "-" }];
    case "real-estate": return [{ assetClass: "Renda Variável", subclass: "Imobiliário BR", duration: "-" }];
    case "bond": return [{ assetClass: "Renda Fixa", subclass: "Bond ETF", duration: "-" }];
    case "commodity": return [{ assetClass: "Reserva", subclass: "Commoditie", duration: "-" }];
    case "cash": return [{ assetClass: "Caixa", subclass: "Pós-fixado", duration: "Curto" }];
    default: return [];
  }
}
