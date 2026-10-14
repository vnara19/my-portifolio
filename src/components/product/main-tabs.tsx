"use client";

import { englishLabel } from "@/lib/english-labels";

import { ChartLineUpIcon, ChartPieSliceIcon, CoinsIcon, GearSixIcon, ListBulletsIcon } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import { useSearchParams } from "next/navigation";

import { TabLink } from "@/components/product/section-tabs";

export type TabKey = "overview" | "positions" | "settings";


export type NavContext = { kind: "position" | "quotes"; label: string };


export const MAIN_TABS = [
  { key: "overview", label: "Overview", href: "/", icon: ChartPieSliceIcon },
  { key: "positions", label: "Positions", href: "/posicoes", icon: ListBulletsIcon },
] as const;

const ENTER: Transition = { type: "spring", stiffness: 380, damping: 30, mass: 0.9 };

const TRAIL_ICONS = {
  position: ChartLineUpIcon,
  quotes: CoinsIcon,
} as const;


export function MainTabs({ active }: { active: TabKey | "none" }) {
  const searchParams = useSearchParams();
  const month = searchParams.get("mes");
  const reduceMotion = useReducedMotion();
  const withMonth = (href: string) => (month ? `${href}?mes=${month}` : href);

  return (
    <nav aria-label="Main navigation" className="flex items-center gap-0.5 rounded-xl border border-border bg-card/70 p-1">
      {MAIN_TABS.map((tab) => (
        <TabLink key={tab.key} href={withMonth(tab.href)} active={tab.key === active}>
          <tab.icon aria-hidden="true" size={14} weight="duotone" className="shrink-0 max-[419px]:hidden" />
          {englishLabel(tab.label)}
        </TabLink>
      ))}

      <AnimatePresence initial={false} mode="popLayout">
        {active === "settings" ? (
          <motion.span
            key="settings"
            layout
            initial={reduceMotion ? false : { opacity: 0, scale: 0.7, filter: "blur(3px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.7, filter: "blur(3px)" }}
            transition={ENTER}
            className="flex"
          >
            <TabLink href={withMonth("/configuracao")} active testId="settings-tab">
              <GearSixIcon aria-hidden="true" size={14} weight="duotone" className="shrink-0" />
              <span className="max-sm:sr-only">Settings</span>
            </TabLink>
          </motion.span>
        ) : null}
      </AnimatePresence>
    </nav>
  );
}


export function NavTrail({ context }: { context: NavContext }) {
  const reduceMotion = useReducedMotion();
  const Icon = TRAIL_ICONS[context.kind];

  return (
    <div className="flex justify-center px-4 pb-3 sm:px-6">
      <motion.p
        key={`${context.kind}:${englishLabel(context.label)}`}
        data-testid="nav-trail"
        data-kind={context.kind}
        initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={ENTER}
        className="relative z-10 flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full border border-primary/30 bg-card px-3 text-[12px]"
      >
        <Icon aria-hidden="true" size={13} weight="duotone" className="shrink-0 text-primary" />
        <span className="min-w-0 truncate font-medium text-foreground">
          <span className="sr-only">You are in </span>
          {englishLabel(context.label)}
        </span>
      </motion.p>
    </div>
  );
}
