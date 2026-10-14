import { GearSixIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";

import { AppShell } from "@/components/product/app-shell";
import { cn } from "@/lib/utils";
import { requireSessionUser } from "@/modules/auth/session";
import { AccountPanel } from "@/modules/auth/ui/account-panel";
import { BackupPanel } from "@/modules/backup/ui/backup-panel";
import { getMonthContext } from "@/modules/portfolio/application/get-month-context";
import { getTargetEditor } from "@/modules/portfolio/application/get-target-editor";
import { ensureDefaultTargetPlan } from "@/modules/portfolio/application/target-plan-editing";
import { TargetEditor } from "@/modules/portfolio/ui/target-editor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portfolio settings",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const user = await requireSessionUser();
  const { months, selected } = await getMonthContext(mes);
  let result = await getTargetEditor(selected?.referenceDate);


  if (result.state === "missing" && (await ensureDefaultTargetPlan().catch(() => null)) === "created") {
    result = await getTargetEditor(selected?.referenceDate);
  }

  return (
    <AppShell
      active="settings"
      months={months}
      selectedMonth={selected?.month ?? null}
    >
      {result.state === "ready" ? (
        <TargetEditor editor={result.editor}>
          <BackupPanel />
          <AccountPanel name={user.name} email={user.email} />
        </TargetEditor>
      ) : (


        <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-7">
          <div className="flex min-h-[40dvh] flex-col items-center justify-center text-center">
            <span
              className={cn(
                "grid size-12 place-items-center rounded-2xl border border-border bg-card",
                result.state === "error" ? "text-destructive" : "text-primary",
              )}
            >
              {result.state === "error" ? (
                <WarningCircleIcon aria-hidden="true" size={22} weight="duotone" />
              ) : (
                <GearSixIcon aria-hidden="true" size={22} weight="duotone" />
              )}
            </span>
            <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">Portfolio targets</h1>
            {result.state === "error" ? (
              <p role="alert" className="mt-3 max-w-xl text-sm text-muted-foreground">Could not load the targets. {result.message}
              </p>
            ) : (
              <p className="mt-3 max-w-xl text-sm text-muted-foreground">There are no positions yet. Restore a backup or add positions under Positions: default targets are created from portfolio categories.
              </p>
            )}
          </div>
          <div className="space-y-6">
            <BackupPanel />
            <AccountPanel name={user.name} email={user.email} />
          </div>
        </div>
      )}
    </AppShell>
  );
}
