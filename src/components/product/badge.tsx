import type { ComponentProps } from "react";
import { tv, type VariantProps } from "tailwind-variants";


const badge = tv({
  base: "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase",
  variants: {
    tone: {
      primary: "bg-primary/10 text-primary",
      spent: "bg-chart-spent/10 text-chart-spent",
      accent: "bg-accent text-accent-foreground",
      warning: "bg-warning/50 text-warning-foreground",
      neutral: "bg-white/[0.06] text-muted-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ tone, className, ...props }: ComponentProps<"span"> & VariantProps<typeof badge>) {
  return <span className={badge({ tone, className })} {...props} />;
}
