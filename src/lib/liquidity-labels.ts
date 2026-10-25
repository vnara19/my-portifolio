/** Display aliases only; stored contractual terms and backup values stay unchanged. */
export const LIQUIDITY_NOT_SPECIFIED = "Liquidity Not Specified";

export function liquidityLabel(value: string | null | undefined): string {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
  const key = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!key || ["liquidity not specified", "not specified", "nao especificada", "nao especificado", "sem liquidez informada"].includes(key)) return LIQUIDITY_NOT_SPECIFIED;
  if (["imediata", "imediato", "immediate", "instant", "same day", "same-day"].includes(key)) return "Same Day";
  if (["no vencimento", "vencimento", "at maturity"].includes(key)) return "At Maturity";
  const days = key.match(/^d\s*\+\s*(\d+)$/);
  if (days) return Number(days[1]) === 0 ? "Same Day" : `D+${Number(days[1])}`;
  return text;
}

export function compareLiquidityLabels(left: string, right: string) {
  const rank = (label: string) => label === "Same Day" ? 0 : /^D\+\d+$/.test(label) ? 1 : label === "At Maturity" ? 2 : label === LIQUIDITY_NOT_SPECIFIED ? 4 : 3;
  const difference = rank(left) - rank(right);
  if (difference) return difference;
  if (rank(left) === 1) return Number(left.slice(2)) - Number(right.slice(2));
  return left.localeCompare(right, "en-GB");
}
