import { tv } from "tailwind-variants";


export const filterBadge = tv({
  base: "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-8",
  variants: {
    active: {
      true: "border-primary/30 bg-primary/[0.08] text-primary",
      false: "border-border bg-card/60 text-muted-foreground hover:text-foreground",
    },


    marked: { true: "", false: "" },
  },
  compoundVariants: [{ active: false, marked: true, class: "border-primary/25 text-foreground" }],
  defaultVariants: { active: false, marked: false },
});

export const headerButton = tv({
  base: "inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold outline-none",
  variants: {
    variant: {
      primary:
        "bg-primary text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] disabled:opacity-40",
      secondary:
        "border border-border bg-card/70 text-foreground transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50",
    },
  },
  defaultVariants: { variant: "secondary" },
});
