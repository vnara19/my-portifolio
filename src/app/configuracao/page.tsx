import { requireSessionUser } from "@/modules/auth/session";
import { AccountPanel } from "@/modules/auth/ui/account-panel";
import { BackupPanel } from "@/modules/backup/ui/backup-panel";
import type { Metadata } from "next";
import { AppShell } from "@/components/product/app-shell";
import { getUserDb } from "@/lib/user-db";
import { getMonthContext } from "@/modules/portfolio/application/get-month-context";
import { DEFAULT_REBALANCE_TOLERANCE } from "@/modules/portfolio/domain/rebalance";
import { TargetEditor } from "@/modules/portfolio/ui/target-editor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Portfolio Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams;
  const { months, selected } = await getMonthContext(mes);
  const user = await requireSessionUser();
  const db = await getUserDb();
  const versions = await db?.dataImport.findMany({ orderBy: { importedAt: "desc" }, take: 12, select: { id: true, importedAt: true, exportedAt: true } }) ?? [];
  const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short" });
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
    {tolerance === null ? <p role="alert" className="mx-auto max-w-3xl px-5 py-6 text-sm text-destructive">Could not load tolerance. Please try again.</p> : <TargetEditor tolerance={tolerance}>
      {versions.length > 0 ? <section className="premium-panel rounded-[24px] p-5 sm:p-6" aria-label="Versions">
        <h2 className="text-base font-semibold">Versions</h2>
        <ol className="mt-4 space-y-3">{versions.map((version) => <li key={version.id} data-version-kind="import" className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span>Backup imported</span><span className="text-muted-foreground">exported on {dateFormat.format(version.exportedAt)}</span>
          <span className="ml-auto font-mono text-muted-foreground">{dateFormat.format(version.importedAt)}</span>
        </li>)}</ol>
      </section> : null}
      <BackupPanel /><AccountPanel name={user.name} email={user.email} />
    </TargetEditor>}
  </AppShell>;
}
