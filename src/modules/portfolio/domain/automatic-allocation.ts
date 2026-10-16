import { defaultAllocation, type AssetKind, type AllocationSeed } from "./asset-kinds";

/** An ETF wrapper alone does not reveal its investment exposure. */
export function automaticAllocation(kind: AssetKind, symbol: string | null): AllocationSeed[] {
  if (kind === "us-market" || kind === "br-market" || kind === "eu-market") return [];
  if (kind === "us-etf" || kind === "br-etf" || kind === "fixed-income" || kind === "treasury") return [];
  return [defaultAllocation(kind, symbol)];
}
