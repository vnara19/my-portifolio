"use client";

import { englishLabel } from "@/lib/english-labels";

import { CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";


export function FlowSteps({ steps, current }: { steps: string[]; current: number }) {
  return <ol aria-label="Form steps" className="flex shrink-0 gap-2 border-b border-border/60 px-5 py-4 sm:gap-4 sm:px-6">
    {steps.map((label, index) => <li key={label} aria-current={current === index ? "step" : undefined} className={cn("flex min-w-0 flex-1 items-center gap-1.5 text-[10px] sm:text-xs", current === index ? "text-primary" : "text-muted-foreground")}>
      <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border text-[10px] font-medium", current === index ? "border-primary bg-primary text-primary-foreground" : index < current ? "border-primary/50 text-primary" : "border-border")}>
        {index < current ? <CheckIcon aria-hidden="true" size={12} weight="bold" /> : index + 1}
      </span><span>{englishLabel(label)}</span>
    </li>)}
  </ol>;
}

export function FlowHeading({ title, description }: { title: string; description: string }) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, [title]);

  return <div className="mb-5"><h2 ref={heading} tabIndex={-1} className="text-lg font-medium tracking-[-0.025em] text-foreground outline-none">{title}</h2><p className="mt-2 max-w-lg text-xs leading-6 text-muted-foreground">{description}</p></div>;
}
