"use client";

/** Searchable picker keeps option values separate from translated display labels. */

import { englishLabel } from "@/lib/english-labels";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useRef, useState } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxField,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

export type PickerOption = {
  value: string;
  label: string;

  hint?: string;
};

type CreateItem = PickerOption & { create: string };
type PickerItem = PickerOption | CreateItem;


const SEARCH_THRESHOLD = 8;

type FieldProps = Omit<
  ComboboxPrimitive.Input.Props,
  "value" | "defaultValue" | "onChange" | "size" | "className" | "disabled"
>;

export type PickerProps = FieldProps & {
  options: PickerOption[];

  value: string | null;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;


  searchable?: boolean;


  onCreate?: (text: string) => void;
  createLabel?: (text: string) => string;


  createOnMatch?: boolean;
  size?: "default" | "sm";
  invalid?: boolean;
  changed?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
};


export function Picker({
  options,
  value,
  onValueChange,
  placeholder = "Select",
  emptyMessage = "No options found",
  searchable,
  onCreate,
  createLabel = (text) => `Create “${text}”`,
  createOnMatch = false,
  size = "default",
  invalid = false,
  changed = false,
  disabled = false,
  className,
  inputClassName,
  onFocus,
  onKeyDown,
  onKeyUp,
  ...fieldProps
}: PickerProps) {
  const [open, setOpen] = useState(false);


  const [draft, setDraft] = useState<string | null>(null);

  const keepSelection = useRef(false);
  const { contains } = ComboboxPrimitive.useFilter();

  const selected = value === null ? null : (options.find((option) => option.value === value) ?? null);
  const inputValue = draft ?? (selected ? englishLabel(selected.label) : "");
  const typed = (draft ?? "").trim();
  const canCreate =
    Boolean(onCreate) &&
    typed !== "" &&
    (createOnMatch || !options.some((option) => sameText(englishLabel(option.label), typed)));
  const items: PickerItem[] = canCreate
    ? [...options, { value: `\u0000criar:${typed}`, label: createLabel(typed), create: typed }]
    : options;
  const allowTyping = searchable ?? (options.length >= SEARCH_THRESHOLD || Boolean(onCreate));

  const filter = useCallback(
    (item: PickerItem, text: string) =>
      "create" in item || text.trim() === "" || contains(item, text, searchText),
    [contains],
  );

  return (
    <Combobox<PickerItem>
      items={items}
      value={selected}
      inputValue={inputValue}
      open={open}
      disabled={disabled}
      filter={filter}
      autoHighlight
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
      isItemEqualToValue={(item, current) => item.value === current.value}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setDraft(null);
        }
      }}
      onInputValueChange={(text, details) => {


        if (details.reason !== "input-change") {
          return;
        }
        setDraft(text);


        if (!open && text.trim() === "") {
          setOpen(true);
        }
      }}
      onValueChange={(item, details) => {
        if (!item) {

          details.cancel();
          return;
        }
        if ("create" in item) {
          onCreate?.(item.create);
          return;
        }
        onValueChange(item.value);
      }}
    >
      <ComboboxField
        size={size}
        invalid={invalid}
        changed={changed}


        placeholder={selected?.label ?? placeholder}
        inputMode={allowTyping ? undefined : "none"}
        groupClassName={className}
        className={cn(!allowTyping && "cursor-pointer caret-transparent selection:bg-transparent", inputClassName)}
        onFocus={(event) => {


          if (allowTyping || !window.matchMedia("(pointer: coarse)").matches) {
            event.currentTarget.select();


            keepSelection.current = true;
          }
          onFocus?.(event);
        }}
        onMouseUp={(event) => {
          if (keepSelection.current) {
            keepSelection.current = false;
            event.preventDefault();
          }
        }}
        onBlur={(event) => {
          keepSelection.current = false;
          fieldProps.onBlur?.(event);
        }}
        onKeyDown={(event) => {


          if (event.key === "Escape" && !open) {
            event.preventBaseUIHandler();
          }
          onKeyDown?.(event);
        }}
        onKeyUp={(event) => {

          if (event.key === "Tab" && !event.altKey && !open) {
            setOpen(true);
          }
          onKeyUp?.(event);
        }}
        {...fieldProps}
      />
      <ComboboxContent>
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(item: PickerItem) =>
            "create" in item ? (
              <ComboboxItem key={item.value} value={item} indicator="none" className="text-primary data-highlighted:text-primary">
                <PlusIcon aria-hidden="true" className="shrink-0" size={12} weight="bold" />
                <span className="truncate">{englishLabel(item.label)}</span>
              </ComboboxItem>
            ) : (
              <ComboboxItem key={item.value} value={item}>
                <span className="min-w-0 flex-1 truncate">{englishLabel(item.label)}</span>
                {item.hint ? (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{item.hint}</span>
                ) : null}
              </ComboboxItem>
            )
          }
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function searchText(item: PickerItem) {
  return item.hint ? `${englishLabel(item.label)} ${item.hint}` : item.label;
}

function sameText(left: string, right: string) {
  return left.localeCompare(right, "en-GB", { sensitivity: "base" }) === 0;
}
