import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/product/app-shell";
import { getUserDb } from "@/lib/user-db";
import { getEditingCatalog } from "@/modules/portfolio/application/get-editing-catalog";
import { getMonthContext } from "@/modules/portfolio/application/get-month-context";
import { getMonthPositions } from "@/modules/portfolio/application/get-month-positions";
import { getPositionHistory, type PositionHistoryView } from "@/modules/portfolio/application/get-position-history";
import { formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { PositionDetail, type PositionEditing } from "@/modules/portfolio/ui/position-detail";

export const dynamic = "force-dynamic";

type PositionPageProps = {
  params: Promise<{ accountId: string; assetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PositionPageProps): Promise<Metadata> {
  const { assetId } = await params;
  const asset = await (await getUserDb())
    ?.asset.findUnique({ where: { id: assetId }, select: { name: true } })
    .catch(() => null);

  return { title: asset?.name ?? "Position" };
}


export default async function PositionPage({ params, searchParams }: PositionPageProps) {
  const [{ accountId, assetId }, query] = await Promise.all([params, searchParams]);
  const mes = typeof query.mes === "string" ? query.mes : undefined;
  const { months, selected } = await getMonthContext(mes);
  const [history, month, catalog] = await Promise.all([
    getPositionHistory({ accountId, assetId, months, selected }),
    selected ? getMonthPositions(selected.referenceDate) : Promise.resolve(null),
    getEditingCatalog(),
  ]);


  const positionMonths = history ? monthsWithPosition(history, query.contas === "todas") : null;

  if (history && positionMonths && positionMonths.size > 0 && !positionMonths.has(history.selectedMonth)) {
    const target =
      [...positionMonths].filter((month) => month <= history.selectedMonth).at(-1) ?? [...positionMonths][0];
    const next = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
      for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
        next.append(key, entry);
      }
    }

    next.set("mes", target);
    redirect(`/posicoes/${accountId}/${assetId}?${next.toString()}`);
  }

  const editing: PositionEditing | null = month
    ? {
        position:
          month.positions.find((position) => position.accountId === accountId && position.assetId === assetId) ?? null,
        month: {
          id: month.id,
          label: formatMonthCompact(month.referenceDate),
          isCurrent: month.isCurrent,
          quotes: month.quotes,
          isLocked: month.isLocked,
          referenceDate: month.referenceDate,
        },
        occupied: month.positions.map((position) => `${position.accountId}:${position.assetId}`),
        catalog,
      }
    : null;

  return (
    <AppShell
      active="positions"
      months={positionMonths && positionMonths.size > 0 ? months.filter((month) => positionMonths.has(month.month)) : months}
      selectedMonth={selected?.month ?? null}
      context={history ? { kind: "position", label: history.assetName } : undefined}
    >
      <PositionDetail history={history} editing={editing} />
    </AppShell>
  );
}


function monthsWithPosition(history: PositionHistoryView, allAccounts: boolean) {
  const view = allAccounts && history.all ? history.all : history.account;
  return new Set(view.slots.filter((slot) => slot.kind === "present").map((slot) => slot.month));
}
