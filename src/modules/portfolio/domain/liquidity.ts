// Asset liquidity period: how long until the funds become available (spec 039).


export const LIQUIDITY_SUGGESTIONS = ["Imediata", "D+0", "D+1", "D+2", "D+30", "D+90", "No vencimento"];

export const NO_LIQUIDITY = "Liquidity not specified";

export const MAX_LIQUIDITY_LENGTH = 30;

/** Normalize text: "d+1" becomes "D+1"; empty input becomes null. */
export function normalizeLiquidity(value: string | null | undefined) {
  const text = (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();

  if (!text) {
    return null;
  }

  return /^d\s*\+\s*\d+$/i.test(text) ? `D+${text.replace(/\D/g, "")}` : text;
}
