import type { AutoIncomeIndexer } from "@/modules/portfolio/domain/fixed-income-policy";

const PERCENT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 4 });


export function rateLabel(part: { indexer: AutoIncomeIndexer; percent: number }) {
  if (part.indexer === "IPCA") return `IPCA + ${PERCENT.format(part.percent)}% per year (published IPCA)`;
  return `${PERCENT.format(part.percent)}% ${part.indexer === "PRE" ? "per year" : "of CDI"}`;
}


export function ratesLabel(parts: readonly { indexer: AutoIncomeIndexer; percent: number }[]) {
  return parts.map(rateLabel).join(" · ");
}
