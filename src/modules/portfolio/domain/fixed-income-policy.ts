
/** Automatic accrual applies only to eligible fixed-income and BRL cash allocations; market-quoted assets are excluded. */


export type AutoIncomeIndexer = "CDI" | "PRE" | "IPCA";


export const AUTO_INCOME_TYPES = ["fixed-income", "brl-cash"] as const;


export const AUTO_INCOME_SUBCLASSES: Record<string, AutoIncomeIndexer> = {
  "Pós-fixado": "CDI",
  Prefixado: "PRE",
  IPCA: "IPCA",
};

export function supportsAutoIncome(assetType: string | null | undefined) {
  return (AUTO_INCOME_TYPES as readonly string[]).includes(assetType ?? "");
}


export function indexerOfSubclass(subclass: string | null | undefined): AutoIncomeIndexer | null {
  return subclass ? (AUTO_INCOME_SUBCLASSES[subclass] ?? null) : null;
}


export type IncomePart = { indexer: AutoIncomeIndexer; weight: string; ratePercent: string };

type AllocationRate = { subclass: string; weight: unknown; ratePercent: unknown };


export function incomeParts(allocations: readonly AllocationRate[]): IncomePart[] | null {
  if (allocations.length === 0) {
    return null;
  }

  const parts: IncomePart[] = [];

  for (const allocation of allocations) {
    const indexer = indexerOfSubclass(allocation.subclass);
    const rate = allocation.ratePercent === null || allocation.ratePercent === undefined ? null : String(allocation.ratePercent);

    if (!indexer || rate === null || !(Number(rate) > 0)) {
      return null;
    }

    parts.push({ indexer, weight: String(allocation.weight), ratePercent: rate });
  }

  return parts;
}


export function autoIncomeParts(
  asset: { autoIncome: boolean; quoteSymbol: string | null },
  allocations: readonly AllocationRate[],
): IncomePart[] | null {
  return asset.autoIncome && !asset.quoteSymbol ? incomeParts(allocations) : null;
}
