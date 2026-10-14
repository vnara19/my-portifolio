import { getUserDb } from "@/lib/user-db";
import { toMonthParam } from "@/modules/portfolio/presentation/reference-month";
import { currentReferenceMonth, toDateKey } from "@/modules/quotes/domain/calendar";

export type EditingCatalog = {
  institutions: { id: string; name: string }[];
  accounts: { id: string; label: string; institutionId: string; name: string }[];
  assets: {
    id: string;

    normalizedKey: string;
    name: string;
    ticker: string | null;
    quoteSymbol: string | null;
    baseCurrency: string;
    maturityDate: string | null;
    liquidity: string | null;
    appliedOn?: string | null;


    allocations: { assetClass: string; subclass: string; duration: string; weight: number; ratePercent: number | null }[];
  }[];
  strategies: string[];
  allocation: { classes: string[]; subclasses: string[] };
  clone: { allowed: boolean; sourceMonth: string | null; targetMonth: string | null };
};

const EMPTY_CATALOG: EditingCatalog = {
  institutions: [],
  accounts: [],
  assets: [],
  strategies: [],
  allocation: { classes: [], subclasses: [] },
  clone: { allowed: false, sourceMonth: null, targetMonth: null },
};

export async function getEditingCatalog(): Promise<EditingCatalog> {
  const prisma = await getUserDb();

  if (!prisma) {
    return EMPTY_CATALOG;
  }

  try {
    const [institutions, accounts, assets, strategies, allocations, targets, latest, assetPositions] = await Promise.all([
      prisma.institution.findMany({ select: { id: true, name: true } }),
      prisma.account.findMany({
        select: { id: true, name: true, institutionId: true, institution: { select: { name: true } } },
      }),
      prisma.asset.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          normalizedKey: true,
          name: true,
          ticker: true,
          quoteSymbol: true,
          baseCurrency: true,
          maturityDate: true,
          liquidity: true,
          appliedOn: true,
        },
      }),
      prisma.position.findMany({
        where: { strategy: { not: null } },
        distinct: ["strategy"],
        select: { strategy: true },
      }),
      prisma.positionAllocation.findMany({
        distinct: ["assetClass", "subclass", "duration"],
        select: { assetClass: true, subclass: true, duration: true },
      }),
      prisma.allocationTarget.findMany({
        where: { scope: { in: ["ASSET_CLASS", "STRATEGY"] } },
        select: { scope: true, primaryLabel: true },
      }),
      prisma.portfolioMonth.findFirst({
        orderBy: { referenceDate: "desc" },
        select: { referenceDate: true },
      }),
      prisma.position.findMany({
        where: { allocations: { some: {} } },
        orderBy: { portfolioMonth: { referenceDate: "desc" } },
        select: {
          assetId: true,
          allocations: {
            orderBy: { weight: "desc" },
            select: { assetClass: true, subclass: true, duration: true, weight: true, ratePercent: true },
          },
        },
      }),
    ]);

    const latestAllocations = new Map<string, EditingCatalog["assets"][number]["allocations"]>();
    for (const position of assetPositions) {
      if (!latestAllocations.has(position.assetId)) {
        latestAllocations.set(
          position.assetId,
          position.allocations.map((allocation) => ({
            ...allocation,
            weight: allocation.weight.mul(100).toNumber(),
            ratePercent: allocation.ratePercent?.toNumber() ?? null,
          })),
        );
      }
    }

    const sorted = (values: Iterable<string>) =>
      [...new Set(values)].sort((left, right) => left.localeCompare(right, "en-GB"));
    const target = latest
      ? new Date(Date.UTC(latest.referenceDate.getUTCFullYear(), latest.referenceDate.getUTCMonth() + 1, 1))
      : null;

    return {
      institutions: institutions.sort((left, right) => left.name.localeCompare(right.name, "en-GB")),
      accounts: accounts
        .map((account) => ({
          id: account.id,
          label: `${account.institution.name} · ${account.name}`,
          institutionId: account.institutionId,
          name: account.name,
        }))
        .sort((left, right) => left.label.localeCompare(right.label, "en-GB")),
      assets: assets.map((asset) => ({
        ...asset,
        maturityDate: asset.maturityDate ? toDateKey(asset.maturityDate) : null,
        appliedOn: asset.appliedOn ? toDateKey(asset.appliedOn) : null,
        allocations: latestAllocations.get(asset.id) ?? [],
      })),
      strategies: sorted([
        ...strategies.flatMap((entry) => (entry.strategy ? [entry.strategy] : [])),
        ...targets.filter((entry) => entry.scope === "STRATEGY").map((entry) => entry.primaryLabel),
      ]),
      allocation: {
        classes: sorted([
          ...allocations.map((entry) => entry.assetClass),
          ...targets.filter((entry) => entry.scope === "ASSET_CLASS").map((entry) => entry.primaryLabel),
        ]),
        subclasses: sorted(allocations.map((entry) => entry.subclass)),
      },
      clone: {
        allowed: target !== null && target.getTime() <= currentReferenceMonth().getTime(),
        sourceMonth: latest ? toMonthParam(latest.referenceDate) : null,
        targetMonth: target ? toMonthParam(target) : null,
      },
    };
  } catch {
    return EMPTY_CATALOG;
  }
}
