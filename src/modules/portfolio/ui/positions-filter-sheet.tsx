"use client";

import { englishLabel } from "@/lib/english-labels";

import { FunnelSimpleIcon } from "@phosphor-icons/react/dist/ssr";

import { BottomSheet, BottomSheetClose, BottomSheetTrigger, sheetButton } from "@/components/product/bottom-sheet";
import { cn } from "@/lib/utils";

export type FilterGroup = {
  key: string;
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;

  formatOption?: (value: string) => string;

  multiple?: boolean;

  subtle?: boolean;
};

export function PositionsFilterSheet({
  groups,
  additionalActiveCount = 0,
  resultCount,
  resultLabel = (count) => `View ${count} ${count === 1 ? "position" : "positions"}`,
  onClear,
  className,
  testId = "positions-filter-sheet",
}: {
  groups: FilterGroup[];
  additionalActiveCount?: number;

  resultCount: number;
  resultLabel?: (count: number) => string;
  onClear: () => void;
  className?: string;
  testId?: string;
}) {
  const active = groups.reduce((total, group) => total + group.selected.length, additionalActiveCount);

  return (
    <BottomSheet
      title="Filters"
      testId={testId}
      trigger={
        <BottomSheetTrigger
          aria-label={active > 0 ? `Filters, ${active} active` : "Filters"}
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
            active > 0 ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card/60 text-foreground",
            className,
          )}
        >
          <FunnelSimpleIcon aria-hidden="true" size={15} weight="bold" />Filters
          {active > 0 ? (
            <span className="rounded-full bg-primary px-1.5 font-mono text-[10px] text-primary-foreground">{active}</span>
          ) : null}
        </BottomSheetTrigger>
      }
      footer={
        <>
          <button type="button" onClick={onClear} disabled={active === 0} className={sheetButton({ variant: "secondary" })}>Clear
          </button>
          <BottomSheetClose className={sheetButton({ variant: "primary" })}>{resultLabel(resultCount)}</BottomSheetClose>
        </>
      }
    >
      {groups
        .filter((group) => group.options.length > 0)
        .map((group) => (
          <ChipGroup
            key={group.key}
            label={englishLabel(group.label)}
            count={group.selected.length}
            subtle={group.subtle}
            options={group.options.map((option) => ({ key: option, label: group.formatOption?.(option) ?? option }))}
            isOn={(key) => group.selected.includes(key)}
            onToggle={(key) =>
              group.onChange(
                group.multiple === false
                  ? [key]
                  : group.selected.includes(key)
                    ? group.selected.filter((value) => value !== key)
                    : [...group.selected, key],
              )
            }
          />
        ))}
    </BottomSheet>
  );
}

function ChipGroup({
  label,
  count = 0,
  options,
  isOn,
  onToggle,
  subtle = false,
}: {
  label: string;
  count?: number;
  options: { key: string; label: string }[];
  isOn: (key: string) => boolean;
  onToggle: (key: string) => void;
  subtle?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {englishLabel(label)}
        {count > 0 ? <span className="rounded-full bg-primary/15 px-1.5 font-mono text-[10px] text-primary">{count}</span> : null}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const on = isOn(option.key);

          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(option.key)}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border px-3 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                on
                  ? subtle
                    ? "border-primary/30 bg-primary/[0.08] text-primary"
                    : "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-background/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {englishLabel(option.label)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
