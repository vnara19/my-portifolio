"use client";

/** Shared mobile sheet with safe-area padding and optional confirm/clear footer controls. */

import { Drawer } from "@base-ui/react/drawer";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { tv } from "tailwind-variants";


const sheet = tv({
  slots: {
    backdrop:
      "fixed inset-0 z-50 min-h-dvh bg-black/60 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:duration-0 data-ending-style:opacity-0 data-starting-style:opacity-0",
    viewport: "fixed inset-0 z-50 flex items-end justify-center",
    popup:
      "flex max-h-[85dvh] w-full flex-col rounded-t-3xl border-t border-border bg-card text-foreground shadow-2xl outline-none [transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:select-none data-ending-style:[transform:translateY(100%)] data-starting-style:[transform:translateY(100%)]",
    handle: "mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/15",
    header: "flex shrink-0 items-center justify-between px-5 pt-3 pb-2",
    title: "text-base font-semibold tracking-[-0.02em]",
    close:
      "grid size-9 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
    content: "min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5",
    footer:
      "flex shrink-0 items-center gap-2 border-t border-border/70 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]",
  },
  variants: {

    footed: {
      true: { content: "pb-4" },
      false: { content: "pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]" },
    },
  },
  defaultVariants: { footed: true },
});


export const sheetButton = tv({
  base: "inline-flex h-11 items-center justify-center rounded-xl px-4 text-xs outline-none focus-visible:ring-2",
  variants: {
    variant: {
      primary:
        "flex-1 bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40",
      secondary:
        "border border-border font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-ring/50 disabled:opacity-40",
    },
  },
  defaultVariants: { variant: "secondary" },
});

export const BottomSheetTrigger = Drawer.Trigger;
export const BottomSheetClose = Drawer.Close;

export function BottomSheet({
  trigger,
  title,
  footer,
  children,
  open,
  onOpenChange,
  testId,
}: {

  trigger: ReactNode;
  title: string;


  footer?: ReactNode;
  children: ReactNode;

  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
}) {
  const slots = sheet({ footed: footer !== undefined });

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      {trigger}
      <Drawer.Portal>
        <Drawer.Backdrop className={slots.backdrop()} />
        <Drawer.Viewport className={slots.viewport()}>
          <Drawer.Popup data-testid={testId} className={slots.popup()}>
            <div aria-hidden="true" className={slots.handle()} />
            <div className={slots.header()}>
              <Drawer.Title className={slots.title()}>{title}</Drawer.Title>
              <Drawer.Close aria-label="Close" className={slots.close()}>
                <XIcon aria-hidden="true" size={15} weight="bold" />
              </Drawer.Close>
            </div>

            <Drawer.Content className={slots.content()}>{children}</Drawer.Content>

            {footer === undefined ? null : <div className={slots.footer()}>{footer}</div>}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
