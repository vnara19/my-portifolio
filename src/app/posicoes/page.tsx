import type { Metadata } from "next";

import { AppShell } from "@/components/product/app-shell";
import { getEditingCatalog } from "@/modules/portfolio/application/get-editing-catalog";
import { getMonthContext } from "@/modules/portfolio/application/get-month-context";
import { getMonthPositions } from "@/modules/portfolio/application/get-month-positions";
import { PositionsWorkspace } from "@/modules/portfolio/ui/positions-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Positions",
};

export default async function PositionsPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const { months, selected } = await getMonthContext(mes);
  const [month, catalog] = await Promise.all([
    getMonthPositions(selected?.referenceDate),
    getEditingCatalog(),
  ]);

  return (
    <AppShell active="positions" months={months} selectedMonth={selected?.month ?? null}>
      <PositionsWorkspace month={month} catalog={catalog} />
    </AppShell>
  );
}
