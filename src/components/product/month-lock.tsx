"use client";

import { englishLabel } from "@/lib/english-labels";

import { Dialog } from "@base-ui/react/dialog";
import { LockKeyIcon, LockKeyOpenIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setMonthOpenAction } from "@/app/actions/edit-month";
import { showAppToast } from "@/components/product/app-toaster";
import { hasPendingChanges } from "@/components/product/unsaved-changes";
import { cn } from "@/lib/utils";
import type { PortfolioMonthSummary } from "@/modules/portfolio/application/get-portfolio-months";
import { formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import {
  backdropClass,
  centeredPopupClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/modules/portfolio/ui/edit-dialogs";

const chipClass =
  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 sm:px-3";


export function MonthLock({ month }: { month: PortfolioMonthSummary }) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const open = month.status === "DRAFT";
  const label = formatMonthCompact(month.referenceDate);

  const change = (next: boolean) => {
    if (!next && hasPendingChanges()) {
      showAppToast({ tone: "warning", title: "Save or discard changes before closing the month." });
      return;
    }

    startSaving(async () => {
      const result = await setMonthOpenAction({ monthId: month.id, open: next });
      showAppToast({ tone: result.ok ? "success" : "error", title: result.message });
      router.refresh();
    });
  };

  if (open) {
    return (
      <div data-testid="month-lock" data-state="open" className="flex shrink-0 items-center gap-1.5">
        <span
          title={`${englishLabel(label)} is open for editing`}
          className="hidden items-center gap-1.5 px-1 text-[11px] font-medium text-warning-foreground sm:inline-flex"
        >
          <LockKeyOpenIcon aria-hidden="true" size={14} weight="bold" />Open
        </span>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => change(false)}
          aria-label={`Close ${englishLabel(label)}`}
          className={cn(chipClass, "border-border bg-card/70 text-foreground hover:bg-white/[0.05]")}
        >
          <LockKeyOpenIcon aria-hidden="true" size={14} weight="bold" className="text-warning-foreground sm:hidden" />
          <LockKeyIcon aria-hidden="true" size={14} weight="bold" className="hidden sm:block" />Close month
        </button>
      </div>
    );
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger
        data-testid="month-lock"
        data-state="closed"
        disabled={isSaving}
        aria-label={`${englishLabel(label)} closed. Open to edit`}
        className={cn(chipClass, "border-border bg-card/70 text-muted-foreground hover:text-foreground")}
      >
        <LockKeyIcon aria-hidden="true" size={14} weight="bold" />Closed
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={centeredPopupClass}>
          <Dialog.Title className="text-base font-semibold tracking-[-0.02em]">Open {englishLabel(label)}?</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">Open, {englishLabel(label)}allows editing positions, allocations and manual quotes. Changes apply to all analyses for the month. Close it again when finished.
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className={secondaryButtonClass}>Cancel</Dialog.Close>
            <Dialog.Close className={primaryButtonClass} onClick={() => change(true)}>Open month
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
