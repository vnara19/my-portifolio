export type FundClassification = { exposure: "equity" | "bond" | "commodity" | "cash"; basis: string };

/** Conservative description rules: an ETF wrapper alone never determines exposure. */
export function classifyFundName(raw: string): FundClassification | null {
  const name = raw.normalize("NFKD").toUpperCase().replace(/[–—-]/g, " ").replace(/\s+/g, " ");
  // Mixed portfolios and synthetic yield/option products need their own reviewed policy.
  if (/\b(MULTI ASSET|MULTIASSET|BALANCED|LIFESTRATEGY|ALLOCATION|TARGET DATE|CONVERTIBLE|COVERED CALL|OPTION|BUFFER|DEFINED OUTCOME|EQUITY PREMIUM|60\s*\/\s*40)\b/.test(name)) return null;
  if (/\b(MONEY MARKET|OVERNIGHT|CASH)\b/.test(name)) return { exposure: "cash", basis: "explicit money-market or overnight mandate" };
  if (/\b(BOND|BONDS|TREASURY|TREASURIES|GOVERNMENT DEBT|FIXED INCOME|IBOXX|AGGREGATE BOND)\b/.test(name)) return { exposure: "bond", basis: "explicit fixed-income mandate" };
  if (/\bPHYSICAL (GOLD|SILVER|PLATINUM|PALLADIUM)\b/.test(name) || /\b(COMMODITIES|COMMODITY)\b/.test(name)) return { exposure: "commodity", basis: "explicit physical-metal or commodity mandate" };
  if (/\b(EQUITY|EQUITIES)\b/.test(name)) return { exposure: "equity", basis: "explicit equity mandate" };
  // Recognized equity benchmarks; evaluated after bond and mixed-asset exclusions.
  if (/\bMSCI (WORLD|EUROPE|ACWI|EAFE|USA|EMERGING MARKETS)\b/.test(name) ||
      /\bFTSE (ALL WORLD|DEVELOPED|100|250)\b/.test(name) ||
      /\bS\s*&\s*P\s*500\b/.test(name) || /\bNASDAQ\s*100\b/.test(name) ||
      /\b(EURO STOXX 50|STOXX EUROPE 600|DAX|CAC 40)\b/.test(name)) {
    return { exposure: "equity", basis: "recognized equity benchmark" };
  }
  return null;
}
