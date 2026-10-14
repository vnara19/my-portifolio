"use client";

/** Ask for confirmation before creating missing reporting months and carrying positions forward. */

import { Dialog } from "@base-ui/react/dialog";
import { CalendarPlusIcon } from "@phosphor-icons/react/dist/ssr";

import { confirmRollover, dismissRollover, type PendingRollover } from "@/components/product/quote-refresh-client";
import { formatMonth, formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";
import { parseMonthParam } from "@/modules/portfolio/presentation/reference-month";
import {
  backdropClass,
  centeredPopupClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/modules/portfolio/ui/edit-dialogs";

const listFormat = new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" });

function compact(month: string) {
  const date = parseMonthParam(month);
  return date ? formatMonthCompact(date) : month;
}


export function MonthRolloverPrompt({
  pending,
  creating,
  onDataChanged,
}: {
  pending: PendingRollover | null;
  creating: boolean;
  onDataChanged: () => void;
}) {
  const months = pending?.months ?? [];
  const first = months[0] ? parseMonthParam(months[0]) : null;
  const single = months.length === 1;

  return (
    <Dialog.Root
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !creating) {
          dismissRollover();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={centeredPopupClass} data-testid="month-rollover-prompt">
          {pending ? (
            <>
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <CalendarPlusIcon aria-hidden="true" size={18} weight="duotone" />
                </span>
                <div className="min-w-0">
                  <Dialog.Title className="text-base font-semibold tracking-[-0.02em]">
                    {single && first
                      ? `Start ${formatMonth(first).toLocaleLowerCase("en-GB")}?`
                      : `Create ${months.length} reporting months?`}
                  </Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                    {single
                      ? `The positions and allocations from ${compact(pending.latestMonth)} are carried forward to ${compact(months[0])}, e ${compact(pending.latestMonth)} is closed.`
                      : `${listFormat.format(months.map(compact))}, each based on the previous month, from ${compact(pending.latestMonth)}. Previous months remain closed.`}
                  </Dialog.Description>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Dialog.Close className={secondaryButtonClass} disabled={creating}>Not now
                </Dialog.Close>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void confirmRollover(onDataChanged)}
                  className={primaryButtonClass}
                >
                  {creating ? "Creating…" : single ? `Create ${compact(months[0])}` : "Create"}
                </button>
              </div>
            </>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
