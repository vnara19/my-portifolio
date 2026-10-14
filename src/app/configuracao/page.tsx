import type { Metadata } from "next";
import { AppShell } from "@/components/product/app-shell";
import { getUserDb } from "@/lib/user-db";
import { getMonthContext } from "@/modules/portfolio/application/get-month-context";
import { DEFAULT_REBALANCE_TOLERANCE } from "@/modules/portfolio/domain/rebalance";
import { TargetEditor } from "@/modules/portfolio/ui/target-editor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Portfolio settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams;
  const { months, selected } = await getMonthContext(mes);
  const db = await getUserDb();
  let tolerance: number | null = null;
  try {
    if (db) {
      const plan = await db.targetPlan.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" }, select: { tolerancePercent: true } });
      tolerance = plan?.tolerancePercent.toNumber() ?? DEFAULT_REBALANCE_TOLERANCE;
    }
  } catch {
    // Do not display an editable default when the saved value could not be read.
  }
  return <AppShell active="settings" months={months} selectedMonth={selected?.month ?? null}>
    {tolerance === null ? <p role="alert" className="mx-auto max-w-3xl px-5 py-6 text-sm text-destructive">Could not load tolerance. Please try again.</p> : <TargetEditor tolerance={tolerance} />}
  </AppShell>;
}
