"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CaretUpDownIcon, CheckIcon, MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";


const Combobox = ComboboxPrimitive.Root;

const fieldSizes = {
  default: "h-9 rounded-lg pl-2.5",
  sm: "h-8 rounded-md pl-2",
} as const;

type ComboboxFieldProps = Omit<ComboboxPrimitive.Input.Props, "size"> & {
  size?: keyof typeof fieldSizes;
  invalid?: boolean;
  changed?: boolean;
  groupClassName?: string;
};

function ComboboxField({
  size = "default",
  invalid = false,
  changed = false,
  className,
  groupClassName,
  ...props
}: ComboboxFieldProps) {
  return (
    <ComboboxPrimitive.InputGroup
      data-slot="combobox-field"
      className={cn(
        "group/combobox relative flex w-full items-center border bg-background/60 text-xs text-foreground transition-[border-color,box-shadow] duration-150 focus-within:ring-2",
        fieldSizes[size],
        invalid
          ? "border-destructive focus-within:ring-destructive/40"
          : changed
            ? "border-warning-border focus-within:ring-ring/50"
            : "border-border focus-within:border-primary/60 focus-within:ring-ring/50 has-data-popup-open:border-primary/60",
        groupClassName,
      )}
    >
      <ComboboxPrimitive.Input
        data-slot="combobox-input"
        aria-invalid={invalid || undefined}
        className={cn(
          "h-full w-full min-w-0 flex-1 bg-transparent pr-7 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      <ComboboxPrimitive.Trigger
        data-slot="combobox-trigger"
        aria-label="Show options"
        className="absolute inset-y-0 right-0 grid w-7 place-items-center text-muted-foreground outline-none transition-colors hover:text-foreground data-popup-open:text-primary"
      >
        <CaretUpDownIcon aria-hidden="true" size={12} weight="bold" />
      </ComboboxPrimitive.Trigger>
    </ComboboxPrimitive.InputGroup>
  );
}

function ComboboxTrigger({ className, ...props }: ComboboxPrimitive.Trigger.Props) {
  return <ComboboxPrimitive.Trigger data-slot="combobox-trigger" className={cn("outline-none", className)} {...props} />;
}

type ComboboxContentProps = ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, "side" | "sideOffset" | "align" | "anchor">;

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  anchor,
  children,
  ...props
}: ComboboxContentProps) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        anchor={anchor}
        collisionPadding={12}
        className="z-[60] outline-none"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "flex max-h-[min(var(--available-height),20rem)] w-[max(var(--anchor-width),12rem)] max-w-[min(var(--available-width),calc(100vw-1.5rem))] origin-[var(--transform-origin)] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxSearch({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <div data-slot="combobox-search" className="relative flex shrink-0 items-center border-b border-border/70">
      <MagnifyingGlassIcon
        aria-hidden="true"
        className="pointer-events-none absolute left-3 text-muted-foreground"
        size={13}
      />
      <ComboboxPrimitive.Input
        className={cn(
          "h-9 w-full bg-transparent pr-3 pl-8 text-xs text-foreground outline-none placeholder:text-muted-foreground/60",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn("min-h-0 flex-1 scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none data-empty:p-0", className)}
      {...props}
    />
  );
}

type ComboboxItemProps = ComboboxPrimitive.Item.Props & {
  indicator?: "check" | "checkbox" | "none";
};

function ComboboxItem({ className, indicator = "check", children, ...props }: ComboboxItemProps) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "group/item relative flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-foreground/85 outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-40 data-highlighted:bg-white/[0.06] data-highlighted:text-foreground data-[selected]:text-foreground pointer-coarse:py-2.5",
        indicator === "check" && "pr-8",
        className,
      )}
      {...props}
    >
      {indicator === "checkbox" ? (
        <span className="grid size-4 shrink-0 place-items-center rounded border border-border transition-colors group-data-[selected]/item:border-primary group-data-[selected]/item:bg-primary group-data-[selected]/item:text-primary-foreground">
          <ComboboxPrimitive.ItemIndicator>
            <CheckIcon aria-hidden="true" size={10} weight="bold" />
          </ComboboxPrimitive.ItemIndicator>
        </span>
      ) : null}
      {children}
      {indicator === "check" ? (
        <ComboboxPrimitive.ItemIndicator className="absolute right-2.5 grid place-items-center text-primary">
          <CheckIcon aria-hidden="true" size={12} weight="bold" />
        </ComboboxPrimitive.ItemIndicator>
      ) : null}
    </ComboboxPrimitive.Item>
  );
}

function ComboboxEmpty({ className, children, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty data-slot="combobox-empty" {...props}>
      {children ? <div className={cn("px-3 py-3 text-xs text-muted-foreground", className)}>{children}</div> : null}
    </ComboboxPrimitive.Empty>
  );
}

function ComboboxFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="combobox-footer" className={cn("shrink-0 border-t border-border/70 p-1", className)} {...props} />;
}

export {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxField,
  ComboboxFooter,
  ComboboxItem,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
};
