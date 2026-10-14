
/** Asset kinds determine ticker verification, base currency, maturity support and default allocation. Provider chains match the quote job. */




//


export const ASSET_KINDS = [
  "us-etf",
  "us-stock",
  "br-etf",
  "br-stock",
  "crypto",
  "treasury",
  "fixed-income",
  "brl-cash",
  "usd-balance",
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

export type QuoteProvider = "finnhub" | "alpha-vantage" | "yahoo" | "coingecko" | "awesome-api" | "tesouro";

export type AllocationSeed = { assetClass: string; subclass: string; duration: string };

export type AssetKindDefinition = {
  kind: AssetKind;
  label: string;

  hint: string;


  ticker: "market" | "usd" | null;
  provider: QuoteProvider | null;
  instrumentType: string | null;

  allowsMaturity: boolean;
};

export const ASSET_KIND_DEFINITIONS: Record<AssetKind, AssetKindDefinition> = {
  "us-etf": {
    kind: "us-etf",
    label: "US ETF",
    hint: "Finnhub · USD",
    ticker: "market",
    provider: "finnhub",
    instrumentType: "ETF",
    allowsMaturity: false,
  },
  "us-stock": {
    kind: "us-stock",
    label: "US stock",
    hint: "Finnhub · USD",
    ticker: "market",
    provider: "finnhub",
    instrumentType: "ACAO",
    allowsMaturity: false,
  },
  "br-etf": {
    kind: "br-etf",
    label: "Brazilian ETF",
    hint: "Yahoo Finance · BRL",
    ticker: "market",
    provider: "yahoo",
    instrumentType: "ETF",
    allowsMaturity: false,
  },
  "br-stock": {
    kind: "br-stock",
    label: "Brazilian stock or REIT",
    hint: "Yahoo Finance · BRL",
    ticker: "market",
    provider: "yahoo",
    instrumentType: "ACAO",
    allowsMaturity: false,
  },
  crypto: {
    kind: "crypto",
    label: "Cripto",
    hint: "CoinGecko",
    ticker: "market",
    provider: "coingecko",
    instrumentType: "CRIPTO",
    allowsMaturity: false,
  },
  "fixed-income": {
    kind: "fixed-income",
    label: "Fixed income",
    hint: "BRL balance",
    ticker: null,
    provider: null,
    instrumentType: null,
    allowsMaturity: true,
  },
  treasury: {
    kind: "treasury",
    label: "Tesouro Direto",
    hint: "Official quote · BRL",
    ticker: "market",
    provider: "tesouro",
    instrumentType: "TESOURO",
    allowsMaturity: true,
  },
  "brl-cash": {
    kind: "brl-cash",
    label: "BRL cash",
    hint: "BRL balance",
    ticker: null,
    provider: null,
    instrumentType: null,
    allowsMaturity: true,
  },
  "usd-balance": {
    kind: "usd-balance",
    label: "USD cash",
    hint: "Valued using USD",
    ticker: "usd",
    provider: null,
    instrumentType: "FIAT",
    allowsMaturity: true,
  },
};

export const USD_SYMBOL = "USD";

export const ALTCOINS = "Altcoins";
const RESERVED_SYMBOLS = new Set(["USD", "BRL"]);
const B3_SUFFIX = ".SAO";


export function normalizeTicker(kind: AssetKind, raw: string): string | null {
  const definition = ASSET_KIND_DEFINITIONS[kind];

  if (definition.ticker === "usd") {
    return USD_SYMBOL;
  }

  if (definition.ticker !== "market") {
    return null;
  }

  const text = raw.trim().toUpperCase();

  if (definition.provider === "tesouro") {
    const match = /^TD:[A-Z0-9-]+:(\d{4}-\d{2}-\d{2})$/.exec(text);
    return match && Number.isFinite(Date.parse(`${match[1]}T00:00:00Z`)) && new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) === match[1] ? text : null;
  }

  if (definition.provider === "yahoo") {
    const base = text.replace(/\.(SAO|SA)$/, "");
    return /^[A-Z0-9]{4}\d{1,2}$/.test(base) ? `${base}${B3_SUFFIX}` : null;
  }

  if (RESERVED_SYMBOLS.has(text)) {
    return null;
  }

  if (definition.provider === "coingecko") {
    return /^[A-Z0-9]{2,10}$/.test(text) ? text : null;
  }

  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(text) ? text : null;
}

export function tickerHint(kind: AssetKind) {
  switch (ASSET_KIND_DEFINITIONS[kind].provider) {
    case "yahoo":
      return "For example, GPCA11 or PETR4.";
    case "coingecko":
      return "For example, ETH or ADA.";
    case "finnhub":
      return "For example, VOO or AAPL.";
    default:
      return "";
  }
}


export function baseCurrencyOf(kind: AssetKind, symbol: string | null) {
  switch (kind) {
    case "us-etf":
    case "us-stock":
    case "usd-balance":
      return "USD";
    case "crypto":

      return symbol === "BTC" ? "BTC" : ALTCOINS;
    default:
      return "BRL";
  }
}


export function defaultAllocation(kind: AssetKind, symbol: string | null): AllocationSeed {
  switch (kind) {
    case "us-etf":
    case "us-stock":
      return { assetClass: "Renda Variável", subclass: "Ações EUA", duration: "-" };
    case "br-etf":
    case "br-stock":
      return { assetClass: "Renda Variável", subclass: "Ações BR", duration: "-" };
    case "crypto":
      return {
        assetClass: "Cripto",
        subclass: symbol === "BTC" ? "BTC" : symbol && STABLECOINS.has(symbol) ? "Stablecoin" : "Altcoin",
        duration: "-",
      };
    case "fixed-income":

      return { assetClass: "Renda Fixa", subclass: "", duration: "" };
    case "treasury":


      return { assetClass: "Renda Fixa", subclass: treasurySubclass(symbol), duration: "" };
    case "brl-cash":
    case "usd-balance":
      return { assetClass: "Caixa", subclass: "Pós-fixado", duration: "Curto" };
  }
}

const STABLECOINS = new Set(["USDT", "USDC", "DAI", "BUSD", "FDUSD", "TUSD", "USDE", "PYUSD"]);


function treasurySubclass(symbol: string | null) {
  const type = symbol?.split(":")[1] ?? "";

  if (type.includes("SELIC")) return "Pós-fixado";
  if (type.includes("IPCA") || type.includes("RENDA") || type.includes("EDUCA")) return "IPCA";
  return "";
}


export function describeAsset(asset: { quoteSymbol: string | null; baseCurrency: string }) {
  if (!asset.quoteSymbol) {
    return "BRL balance";
  }

  if (asset.quoteSymbol === USD_SYMBOL) {
    return "USD cash";
  }

  if (asset.quoteSymbol.startsWith("TD:")) return "Tesouro Direto";

  if (asset.baseCurrency === "BTC" || asset.baseCurrency === ALTCOINS) {
    return "Cripto";
  }

  return asset.quoteSymbol.endsWith(B3_SUFFIX) ? "Brazilian asset" : "US asset";
}


export function providerForQuote(instrumentType: string, baseCurrency: string): QuoteProvider {
  if (instrumentType === "TESOURO") return "tesouro";
  if (instrumentType === "FIAT") {
    return "awesome-api";
  }

  if (instrumentType === "CRIPTO") {
    return "coingecko";
  }

  return baseCurrency === "USD" ? "finnhub" : "yahoo";
}


export function normalizeKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("en-GB")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}


export function buildAssetKey({
  name,
  ticker,
  institutionName,
  maturityDate,
}: {
  name: string;
  ticker: string | null;
  institutionName: string;
  maturityDate: string | null;
}) {
  const normalizedName = normalizeKey(name);
  const base = ticker
    ? `market:${normalizedName}:${ticker.toUpperCase()}`
    : `private:${normalizeKey(institutionName)}:${normalizedName}`;

  return maturityDate ? `${base}:${maturityDate}` : base;
}


export function duplicateAssetMessage({
  name,
  kind,
  symbol,
  maturityDate,
  pending = false,
}: {
  name: string;
  kind: AssetKind;
  symbol: string | null;
  maturityDate: string | null;

  pending?: boolean;
}) {
  const definition = ASSET_KIND_DEFINITIONS[kind];
  const quotedBy =
    definition.ticker === "market" ? ` with ticker ${symbol}` : definition.ticker === "usd" ? " valued using USD" : "";

  const scope = `${definition.ticker === null ? " at this institution" : ""}${maturityDate ? " with this maturity date" : ""}`;
  const alternative = definition.allowsMaturity && !maturityDate ? " or enter a maturity date" : "";
  const subject = pending
    ? `"${name}"${quotedBy} is already the new asset for another position${scope}`
    : `The asset "${name}"${quotedBy} already exists${scope}`;

  return `${subject}. Select it from the list${alternative}.`;
}


export function cleanName(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}
