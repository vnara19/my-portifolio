



import { NO_REDEMPTION } from "@/modules/portfolio/domain/redemption";

export const ASSET_CLASSES = ["Caixa", "Cripto", "Renda Fixa", "Renda Variável", "Reserva"] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number];


export const SUBCLASSES_BY_CLASS: Record<AssetClass, readonly string[]> = {
  Caixa: ["Pós-fixado", "Prefixado", "Stablecoin"],
  Cripto: ["BTC", "Altcoin", "Stablecoin"],
  "Renda Fixa": ["Pós-fixado", "Prefixado", "IPCA", "Bond ETF", "International Bonds", "Inflation Linked", "Savings"],
  "Renda Variável": ["Ações EUA", "Ações - Ex: USA", "Ações BR", "Imobiliário BR", "Commoditie"],
  Reserva: ["Commoditie"],
};


export const REDEMPTIONS_BY_CLASS: Record<AssetClass, readonly string[]> = {
  Caixa: ["Curto"],
  Cripto: [NO_REDEMPTION],
  "Renda Fixa": ["Curto", "Médio", "Longo", NO_REDEMPTION],
  "Renda Variável": [NO_REDEMPTION],
  Reserva: [NO_REDEMPTION],
};

export function isAssetClass(value: string): value is AssetClass {
  return (ASSET_CLASSES as readonly string[]).includes(value);
}

export function subclassesOf(assetClass: string): readonly string[] {
  return isAssetClass(assetClass) ? SUBCLASSES_BY_CLASS[assetClass] : [];
}

export function redemptionsOf(assetClass: string): readonly string[] {
  return isAssetClass(assetClass) ? REDEMPTIONS_BY_CLASS[assetClass] : [];
}


export function fitClassification(row: { assetClass: string; subclass: string; duration: string }) {
  const subclasses = subclassesOf(row.assetClass);
  const redemptions = redemptionsOf(row.assetClass);

  return {
    assetClass: row.assetClass,
    subclass: subclasses.includes(row.subclass) ? row.subclass : subclasses.length === 1 ? subclasses[0] : "",
    duration: redemptions.includes(row.duration) ? row.duration : redemptions.length === 1 ? redemptions[0] : "",
  };
}


export function classificationIssue(row: { assetClass: string; subclass: string; duration: string }) {
  if (!isAssetClass(row.assetClass)) {
    return `The class "${row.assetClass}" is not in the list.`;
  }

  if (!SUBCLASSES_BY_CLASS[row.assetClass].includes(row.subclass)) {
    return `The subclass "${row.subclass}" does not belong to ${row.assetClass}.`;
  }

  if (!REDEMPTIONS_BY_CLASS[row.assetClass].includes(row.duration)) {
    return `The redemption term "${row.duration}" is not valid for ${row.assetClass}.`;
  }

  return null;
}


export const ASSET_TYPES = [
  "us-market", "br-market", "eu-market",
  "us-etf",
  "us-stock",
  "br-etf",
  "br-stock",
  "crypto",
  "treasury",
  "fixed-income", "international-bond", "savings",
  "pension",
  "brl-cash",
  "usd-balance",
  "eur-balance",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  savings: "Savings",
  "us-market": "US Market", "br-market": "Brazilian Market", "eu-market": "European Market",
  "us-etf": "US ETF",
  "us-stock": "US stock",
  "br-etf": "Brazilian ETF",
  "br-stock": "Brazilian stock or REIT",
  crypto: "Cryptocurrency",
  treasury: "Tesouro Direto",
  "fixed-income": "Fixed income",
  "international-bond": "International Bonds",
  pension: "Pension",
  "brl-cash": "BRL Cash",
  "usd-balance": "USD Cash",
  "eur-balance": "EUR Cash",
};

export function isAssetType(value: string | null | undefined): value is AssetType {
  return value !== null && value !== undefined && (ASSET_TYPES as readonly string[]).includes(value);
}


export function assetTypeOf(asset: {
  assetType: string | null;
  quoteSymbol: string | null;
  baseCurrency: string;
  name: string;
  cashAccount?: boolean;
}): AssetType {
  if (isAssetType(asset.assetType)) {
    return asset.assetType;
  }

  const name = asset.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const symbol = asset.quoteSymbol;

  if (symbol === null) {
    if (/tesouro/.test(name)) return "treasury";
    if (/previd/.test(name)) return "pension";
    if (asset.cashAccount || /\b(conta|porquinho|cofrinho|confrinho|carteira)\b/.test(name)) return "brl-cash";
    return "fixed-income";
  }

  if (symbol === "EUR") return "eur-balance";
  if (symbol === "USD") return "usd-balance";
  if (symbol.startsWith("TD:")) return "treasury";
  if (asset.baseCurrency === "BTC" || asset.baseCurrency === "Altcoins") return "crypto";
  if (symbol.endsWith(".SAO")) return /\betf\b/.test(name) ? "br-etf" : "br-stock";
  return /\betf\b/.test(name) ? "us-etf" : "us-stock";
}
