"use client";

import { englishLabel } from "@/lib/english-labels";

import type { ReactNode } from "react";

import { headerButton } from "@/components/product/page-controls";
import { Picker } from "@/components/ui/picker";
import { LIQUIDITY_SUGGESTIONS } from "@/modules/portfolio/domain/liquidity";
import { isRedemption, redemptionLabel, REDEMPTION_VALUES } from "@/modules/portfolio/domain/redemption";


export const backdropClass =
  "fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0";
export const centeredPopupClass =
  "fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";
export const inputClass =
  "h-9 w-full rounded-lg border border-border bg-background/60 px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/50";
export const primaryButtonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground outline-none transition-[background-color,transform] duration-150 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";
export const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border px-3.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50";


export const headerPrimaryButtonClass = headerButton({ variant: "primary" });


export function AllocationPicker({
  label,
  values,
  value,
  onChange,
  placeholder = "Choose",
  disabled = false,
}: {
  label: string;
  values: readonly string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const options = [
    ...values.map((entry) => ({ value: entry, label: englishLabel(entry) })),
    ...(value && !values.includes(value) ? [{ value, label: englishLabel(value), hint: "not in the list" }] : []),
  ];

  return (
    <Picker
      aria-label={englishLabel(label)}
      options={options}
      value={value || null}
      onValueChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      emptyMessage="No option with this name"
    />
  );
}


export function RedemptionPicker({
  label,
  values = REDEMPTION_VALUES,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  values?: readonly string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const options = [
    ...values.map((entry) => ({ value: entry, label: redemptionLabel(entry) })),
    ...(value && !values.includes(value) ? [{ value, label: redemptionLabel(value), hint: isRedemption(value) ? "not in the list" : "from spreadsheet" }] : []),
  ];

  return (
    <Picker
      aria-label={englishLabel(label)}
      options={options}
      value={value || null}
      onValueChange={onChange}
      placeholder={disabled ? "Choose the class" : "Choose"}
      disabled={disabled}
    />
  );
}

const NO_LIQUIDITY_VALUE = "__sem_liquidez__";


export function LiquidityPicker({
  label = "Liquidity",
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = [
    { value: NO_LIQUIDITY_VALUE, label: "Leave unspecified" },
    ...(value && !LIQUIDITY_SUGGESTIONS.includes(value) ? [value] : []).map((entry) => ({ value: entry, label: englishLabel(entry) })),
    ...LIQUIDITY_SUGGESTIONS.map((entry) => ({ value: entry, label: englishLabel(entry) })),
  ];

  return (
    <Picker
      aria-label={englishLabel(label)}
      options={options}
      value={value || null}
      placeholder="Optional"
      onValueChange={(next) => onChange(next === NO_LIQUIDITY_VALUE ? "" : next)}
      onCreate={(text) => onChange(text)}
      createLabel={(text) => `Use “${text}”`}
      emptyMessage="Type to use a different term"
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{englishLabel(label)}</span>
      {children}
    </label>
  );
}
