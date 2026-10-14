"use client";

import { englishLabel } from "@/lib/english-labels";

import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxFooter,
  ComboboxItem,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  formatOption,
  multiple = true,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;

  formatOption?: (value: string) => string;

  multiple?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Combobox<string, boolean>
      multiple={multiple}
      items={options}
      itemToStringLabel={(option) => formatOption?.(option) ?? englishLabel(option)}
      value={multiple ? selected : (selected[0] ?? null)}
      open={open}
      onOpenChange={setOpen}
      onValueChange={(next) => onChange(Array.isArray(next) ? [...next] : next ? [next] : [])}
      onInputValueChange={(_, details) => {

        if (multiple && details.isItemPress) {
          details.cancel();
        }
      }}
    >
      <ComboboxTrigger
        aria-label={
          selected.length > 0
            ? `${englishLabel(label)} ${selected.length} ${selected.length === 1 ? "selected" : "selected"}`
            : label
        }
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
          selected.length > 0
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border bg-card/60 text-muted-foreground hover:text-foreground data-popup-open:text-foreground",
        )}
      >
        {englishLabel(label)}
        {selected.length > 0 ? (
          <span className="rounded-full bg-primary px-1.5 font-mono text-[10px] text-primary-foreground">
            {selected.length}
          </span>
        ) : null}
        <CaretDownIcon
          aria-hidden="true"
          className="transition-transform duration-150 in-data-popup-open:rotate-180"
          size={11}
          weight="bold"
        />
      </ComboboxTrigger>
      <ComboboxContent aria-label={`Filter by ${englishLabel(label)}`} className="w-[max(var(--anchor-width),14rem)]">

        <ComboboxSearch aria-label={`Search in ${englishLabel(label)}`} placeholder="Search" />
        <ComboboxEmpty>No options found</ComboboxEmpty>
        <ComboboxList>
          {(option: string) => (
            <ComboboxItem key={option} value={option} indicator={multiple ? "checkbox" : "check"}>
              <span className="min-w-0 flex-1 truncate">{formatOption?.(option) ?? englishLabel(option)}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
        {selected.length > 0 && multiple ? (
          <ComboboxFooter>
            <button
              type="button"
              onClick={() => {


                setOpen(false);
                onChange([]);
              }}
              className="flex w-full items-center rounded-lg px-2.5 py-2 text-[11px] text-muted-foreground outline-none transition-colors select-none hover:bg-white/[0.06] hover:text-foreground focus-visible:bg-white/[0.06] focus-visible:text-foreground"
            >Clear selection
            </button>
          </ComboboxFooter>
        ) : null}
      </ComboboxContent>
    </Combobox>
  );
}
