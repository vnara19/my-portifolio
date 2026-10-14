import { getUserDb } from "@/lib/user-db";
import { getAllocationOverview } from "@/modules/portfolio/application/get-allocation-overview";
import type { AllocationAggregates, AllocationGroupKey } from "@/modules/portfolio/domain/rebalance";
import { REDEMPTIONS_BY_CLASS, SUBCLASSES_BY_CLASS } from "@/modules/portfolio/domain/classification";
import { fixedIncomeTaxonomyTargets } from "@/modules/portfolio/domain/default-targets";

export type TargetEditorItem = {
  key: string;
  scope: AllocationGroupKey;
  primaryLabel: string;
  secondaryLabel: string | null;
  percent: number;
};


export type TargetPlanVersion = {
  id: string;
  importedAt: Date;

  exportedAt: Date;
};

const VERSION_LIMIT = 12;

export type TargetEditorData = {

  updatedAt: Date;
  tolerance: number;
  items: TargetEditorItem[];
  versions: TargetPlanVersion[];
  preview: { referenceDate: Date; aggregates: AllocationAggregates } | null;
};


export type TargetEditorResult =
  | { state: "ready"; editor: TargetEditorData }
  | { state: "missing" }
  | { state: "error"; message: string };

export async function getTargetEditor(referenceDate?: Date): Promise<TargetEditorResult> {
  const prisma = await getUserDb();

  if (!prisma) {
    return { state: "error", message: "The database is not configured." };
  }

  try {
    const [active, imports, overview] = await Promise.all([
      prisma.targetPlan.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        select: {
          updatedAt: true,
          tolerancePercent: true,
          targets: {
            orderBy: { key: "asc" },
            select: {
              key: true,
              scope: true,
              primaryLabel: true,
              secondaryLabel: true,
              percentage: true,
            },
          },
        },
      }),
      prisma.dataImport.findMany({
        orderBy: { importedAt: "desc" },
        take: VERSION_LIMIT,
        select: { id: true, importedAt: true, exportedAt: true },
      }),
      getAllocationOverview(referenceDate),
    ]);

    if (!active) {
      return { state: "missing" };
    }

    const editor: TargetEditorData = {
      updatedAt: active.updatedAt,
      tolerance: active.tolerancePercent.toNumber(),
      items: [
        ...active.targets.map((target) => ({
          key: target.key,
          scope: target.scope as AllocationGroupKey,
          primaryLabel: target.primaryLabel,
          secondaryLabel: target.secondaryLabel,
          percent: target.percentage.mul(100).toNumber(),
        })),


        ...missingFixedIncomeTargets(active.targets).map((target) => ({ ...target, percent: 0 })),
      ],
      versions: imports.map((entry) => ({ id: entry.id, importedAt: entry.importedAt, exportedAt: entry.exportedAt })),
      preview: overview ? { referenceDate: overview.referenceDate, aggregates: overview.aggregates } : null,
    };

    return { state: "ready", editor };
  } catch (error) {


    const reason = error instanceof Error ? error.message.trim().split("\n").filter(Boolean).at(-1) : undefined;
    return { state: "error", message: reason ? reason.slice(0, 240) : "Unknown error." };
  }
}

function missingFixedIncomeTargets(existing: { key: string }[]) {
  const keys = new Set(existing.map((target) => target.key));
  return fixedIncomeTaxonomyTargets(SUBCLASSES_BY_CLASS["Renda Fixa"], REDEMPTIONS_BY_CLASS["Renda Fixa"]).filter(
    (target) => !keys.has(target.key),
  );
}
