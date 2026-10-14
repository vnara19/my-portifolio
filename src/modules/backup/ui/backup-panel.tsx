"use client";

import { englishLabel } from "@/lib/english-labels";

import { Dialog } from "@base-ui/react/dialog";
import {
  ArchiveIcon,
  CircleNotchIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";

import { showAppToast } from "@/components/product/app-toaster";
import {
  BACKUP_TABLES,
  type BackupPreview,
  type BackupRestoreResponse,
} from "@/modules/backup/domain/backup-format";
import {
  backdropClass,
  centeredPopupClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/modules/portfolio/ui/edit-dialogs";
import { formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { formatRefreshDateTime } from "@/modules/quotes/presentation/refresh-time";


type Pending = { backup: unknown; preview: BackupPreview };

const SUMMARY_TABLES = BACKUP_TABLES.filter(
  (table): table is Extract<(typeof BACKUP_TABLES)[number], { label: string }> => table.label !== null,
);

const count = (value: number) => value.toLocaleString("en-GB");
const month = (value: string) => formatMonthCompact(new Date(`${value}-01T00:00:00.000Z`));

async function postRestore(mode: "check" | "apply", backup: unknown): Promise<BackupRestoreResponse> {
  try {
    const response = await fetch("/api/backup/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, backup }),
    });
    return (await response.json()) as BackupRestoreResponse;
  } catch {
    return { state: "invalid", message: "Could not reach the application. Try again." };
  }
}

export function BackupPanel() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<Pending | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setError(null);
    setChecking(true);

    let backup: unknown;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      setChecking(false);
      setError(`${file.name} is not a valid backup file.`);
      return;
    }

    const result = await postRestore("check", backup);
    setChecking(false);

    if (result.state === "checked") {
      setPending({ backup, preview: result.preview });
      setDialogOpen(true);
    } else {
      setError(result.state === "invalid" ? result.message : "Unexpected application response.");
    }
  }

  async function restore() {
    if (!pending) {
      return;
    }

    setRestoring(true);
    const result = await postRestore("apply", pending.backup);
    setRestoring(false);
    setDialogOpen(false);

    if (result.state === "restored") {
      showAppToast({
        tone: "success",
        title: "Backup restored",
        description: `${count(result.counts.portfolioMonths)} reporting months and ${count(result.counts.positions)} positions.`,
      });
      router.refresh();
    } else {
      setError(result.state === "invalid" ? result.message : "Unexpected application response.");
    }
  }

  return (
    <section id="backup" className="premium-panel scroll-mt-32 rounded-[24px] p-5 sm:p-6" aria-labelledby="backup-title">
      <div className="flex items-center gap-2">
        <ArchiveIcon aria-hidden="true" className="text-primary" size={16} weight="duotone" />
        <h2 id="backup-title" className="text-base font-semibold tracking-[-0.025em]">Data backup
        </h2>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <a href="/api/backup" download className={primaryButtonClass}>

          <UploadSimpleIcon aria-hidden="true" size={14} weight="bold" />Export backup
        </a>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={checking || restoring}
          onClick={() => input.current?.click()}
        >
          {checking ? (
            <CircleNotchIcon aria-hidden="true" className="mr-2 animate-spin" size={14} weight="bold" />
          ) : (
            <DownloadSimpleIcon aria-hidden="true" className="mr-2" size={14} weight="bold" />
          )}
          {checking ? "Checking file…" : "Import backup"}
        </button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-label="Backup file"
          onChange={chooseFile}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-4 flex items-start gap-2 text-xs leading-5 text-destructive">
          <WarningCircleIcon aria-hidden="true" className="mt-0.5 shrink-0" size={14} weight="fill" />
          {error}
        </p>
      ) : null}

      <Dialog.Root open={dialogOpen} onOpenChange={(open) => !restoring && setDialogOpen(open)}>
        <Dialog.Portal>
          <Dialog.Backdrop className={backdropClass} />
          <Dialog.Popup className={centeredPopupClass}>
            {pending ? (
              <>
                <Dialog.Title className="text-base font-semibold tracking-[-0.02em]">Import this backup?</Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">Exported on {formatRefreshDateTime(pending.preview.exportedAt)}
                  {pending.preview.firstMonth && pending.preview.lastMonth
                    ? `, with reporting months from ${month(pending.preview.firstMonth)} a ${month(pending.preview.lastMonth)}`
                    : ", without reporting months"}. Your portfolio data will be replaced; export a backup first if you want to keep it. Only missing shared automatic quotes will be imported.
                </Dialog.Description>
                <table className="mt-5 w-full text-left text-xs">
                  <thead>
                    <tr className="text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
                      <th className="py-1.5 font-semibold">Details</th>
                      <th className="py-1.5 text-right font-semibold">Today</th>
                      <th className="py-1.5 text-right font-semibold">No backup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SUMMARY_TABLES.map(({ key, label }) => (
                      <tr key={key} className="border-t border-border/60">
                        <td className="py-1.5 text-foreground/85">{englishLabel(label)}</td>
                        <td className="py-1.5 text-right font-mono text-muted-foreground tabular-nums">
                          {count(pending.preview.current[key])}
                        </td>
                        <td className="py-1.5 text-right font-mono text-foreground tabular-nums">
                          {count(pending.preview.file[key])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-6 flex justify-end gap-2">
                  <Dialog.Close className={secondaryButtonClass} disabled={restoring}>Cancel
                  </Dialog.Close>
                  <button type="button" className={primaryButtonClass} disabled={restoring} onClick={restore}>
                    {restoring ? <CircleNotchIcon aria-hidden="true" className="animate-spin" size={14} weight="bold" /> : null}
                    {restoring ? "Importando…" : "Importar"}
                  </button>
                </div>
              </>
            ) : null}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
