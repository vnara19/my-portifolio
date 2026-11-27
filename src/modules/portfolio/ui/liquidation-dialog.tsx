"use client";

/** Full withdrawal closes a position without deleting its history. Require review before recording the received amount. */

import { englishLabel } from "@/lib/english-labels";

import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { useState, useTransition } from "react";

import { liquidatePositionAction, type EditActionResult } from "@/app/actions/edit-month";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import { formatBrl, formatPriceBrl, parseLocaleNumber } from "@/modules/portfolio/presentation/portfolio-format";
import {
  backdropClass,
  Field,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/modules/portfolio/ui/edit-dialogs";
import type { TransactionMonth } from "@/modules/portfolio/ui/position-transaction-dialog";


export type LiquidationTarget = {
  positionId: string;
  assetName: string;

  quantity: number;
  quoteSymbol: string | null;
  totalBrl: number;
};

const popupClass =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(440px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";

export function LiquidationDialog({
  open,
  onOpenChange,
  target,
  formKey,
  month,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: LiquidationTarget | null;
  formKey: number;
  month: TransactionMonth;
  onSaved: (result: EditActionResult) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={popupClass} data-testid="liquidation-form">
          {target ? (
            <LiquidationForm
              key={formKey}
              target={target}
              month={month}
              onSaved={(result) => {
                onSaved(result);
                onOpenChange(false);
              }}
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LiquidationForm({
  target,
  month,
  onSaved,
}: {
  target: LiquidationTarget;
  month: TransactionMonth;
  onSaved: (result: EditActionResult) => void;
}) {
  const [day, setDay] = useState(month.lastDay);
  const [amountText, setAmountText] = useState(AMOUNT.format(target.totalBrl));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const amount = parseLocaleNumber(amountText);
  const valid = amount !== null && amount > 0;
  const quoted = Boolean(target.quoteSymbol);
  const difference = valid ? amount - target.totalBrl : 0;

  const save = () =>
    startSaving(async () => {
      setError(null);
      const result = await liquidatePositionAction({
        monthId: month.id,
        liquidation: { positionId: target.positionId, occurredOn: day, amountBrl: String(amount) },
      });

      if (result.ok) {
        onSaved(result);
      } else {
        setError(result.message);
      }
    });

  return (
    <>
      <header className="flex items-start gap-4 border-b border-border/70 px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0">
          <Dialog.Title className="truncate text-base font-semibold tracking-[-0.02em]">Liquidate {target.assetName}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">Full withdrawal of {formatBrl(target.totalBrl)} in {englishLabel(month.label)}. The history is preserved.
          </Dialog.Description>
        </div>
        <Dialog.Close
          aria-label="Close"
          className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <XIcon aria-hidden="true" size={14} weight="bold" />
        </Dialog.Close>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day">
            <DatePicker
              aria-label="Liquidation date"
              value={day}
              min={month.firstDay}
              max={month.lastDay}
              onChange={setDay}
            />
          </Field>
          <Field label="Amount received (BRL)">
            <input
              inputMode="decimal"
              aria-label="Amount received"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              className={cn(inputClass, "text-right font-mono")}
            />
          </Field>
        </div>

        <dl data-testid="liquidation-summary" className="space-y-1.5 rounded-xl border border-border px-3 py-2.5 text-xs">
          <Row label="Balance afterwards" value={formatBrl(0)} />
          {quoted && valid && target.quantity > 0 ? (
            <Row label="Execution price" value={formatPriceBrl(amount / target.quantity)} />
          ) : null}
          {!quoted && Math.abs(difference) > 0.004 ? (
            <Row label={difference > 0 ? "Return on redemption" : "Received less than the balance"} value={formatBrl(difference)} />
          ) : null}
        </dl>

        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border/70 px-5 py-4 sm:px-6">
        <Dialog.Close className={secondaryButtonClass}>Cancel</Dialog.Close>
        <button type="button" onClick={save} disabled={!valid || !day || isSaving} className={primaryButtonClass}>
          {isSaving ? "Liquidando…" : "Liquidate"}
        </button>
      </footer>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{englishLabel(label)}</dt>
      <dd className="font-mono text-foreground">{value}</dd>
    </div>
  );
}

const AMOUNT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2, useGrouping: false });
