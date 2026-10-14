"use client";

/** Responsive month timeline with keyboard navigation, safe touch targets and reduced-motion support. */

import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { tv } from "tailwind-variants";

import { MonthSheet, monthMarker } from "@/components/product/month-sheet";
import { cn } from "@/lib/utils";













export type MonthStripMarker = "up" | "down" | "none";

export type MonthStripItem = {

  month: string;

  name: string;

  short: string;

  description?: string;

  marker: MonthStripMarker;
};

type YearGroup = { year: number; months: MonthStripItem[] };

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const PANEL_MOTION: Record<"full" | "reduced", { enter: Transition; exit: Transition }> = {
  full: {
    enter: { width: { duration: 0.22, ease: EASE_OUT }, opacity: { duration: 0.18, ease: EASE_OUT } },
    exit: { width: { duration: 0.22, ease: EASE_OUT }, opacity: { duration: 0.2, ease: EASE_OUT } },
  },
  reduced: {
    enter: { width: { duration: 0 }, opacity: { duration: 0.12 } },
    exit: { width: { duration: 0 }, opacity: { duration: 0.12 } },
  },
};

const strip = tv({
  slots: {
    band: "relative flex items-center gap-2 border-b border-border/70 bg-background/80 px-4 py-2 backdrop-blur-xl sm:px-6 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)]",
    progress: "pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden transition-opacity duration-150",
    nav: "hidden min-w-0 flex-1 flex-row-reverse overflow-x-auto overscroll-x-contain sm:flex [scrollbar-width:none] xl:col-start-2 [&::-webkit-scrollbar]:hidden",
    trail: "ml-auto flex shrink-0 items-center gap-2 justify-self-end xl:col-start-3",
  },
  variants: { pending: { true: { progress: "opacity-100" }, false: { progress: "opacity-0" } } },
  defaultVariants: { pending: false },
});

const yearCapsule = tv({
  slots: {
    root: "flex items-center rounded-xl border bg-card/70 p-[3px] transition-colors duration-150",
    year: "flex h-10 shrink-0 touch-manipulation flex-col items-center justify-center rounded-lg px-2 font-mono text-[11px] tracking-[0.06em] outline-none transition-colors duration-150 select-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-8 pointer-coarse:h-11",
    months: "flex w-max shrink-0 items-center gap-0.5 py-[3px] pr-0.5 pl-1 pointer-coarse:gap-1",
  },
  variants: {
    expanded: { true: { year: "cursor-default text-foreground" }, false: {} },
    holdsSelected: { true: {}, false: {} },
    scoped: { true: {}, false: {} },
  },
  compoundVariants: [
    { expanded: false, holdsSelected: true, class: { root: "border-primary/35", year: "text-primary hover:bg-white/[0.045]" } },
    {
      expanded: false,
      holdsSelected: false,
      class: { root: "border-border", year: "text-muted-foreground hover:bg-white/[0.045] hover:text-foreground" },
    },
    { expanded: true, scoped: true, class: { root: "border-primary/30" } },
    { expanded: true, scoped: false, class: { root: "border-border" } },
  ],
  defaultVariants: { expanded: false, holdsSelected: false, scoped: false },
});

const monthButton = tv({
  base: "flex h-10 min-w-10 shrink-0 touch-manipulation flex-col items-center justify-center rounded-lg px-2 text-[11px] font-medium outline-none transition-colors duration-150 select-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-8 sm:min-w-9 pointer-coarse:h-11 pointer-coarse:min-w-11",
  variants: {
    selected: {
      true: "bg-primary text-primary-foreground",
      false: "text-muted-foreground hover:bg-white/[0.045] hover:text-foreground pointer-coarse:active:bg-white/[0.09]",
    },
  },
  defaultVariants: { selected: false },
});

const yearTick = tv({
  base: "size-[3px] rounded-[1px]",
  variants: {
    state: {
      absent: "bg-muted-foreground/15",
      selected: "bg-foreground",
      none: "bg-muted-foreground/45",
      up: "bg-chart-up",
      down: "bg-chart-down",
    },
  },
});

type MonthStripProps = {

  items: readonly MonthStripItem[];

  selected: string;
  onSelect: (month: string) => void;

  pending?: boolean;

  scoped?: boolean;

  trailing?: ReactNode;
};

export function MonthStrip({ items, selected, onSelect, pending = false, scoped = false, trailing }: MonthStripProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const stripRef = useRef<HTMLElement>(null);
  const [browsing, setBrowsing] = useState<{ year: number; from: string } | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });


  const [intro, setIntro] = useState(scoped);

  useEffect(() => {
    if (!intro) {
      return;
    }

    const done = window.setTimeout(() => setIntro(false), 700);
    return () => window.clearTimeout(done);
  }, [intro]);

  const selectedYear = Number(selected.slice(0, 4));





  if (browsing !== null && browsing.from !== selected) {
    setBrowsing(null);
  }

  const expandedYear = browsing?.year ?? selectedYear;
  const hydrated = useSyncExternalStore(subscribeNothing, isClient, isServer);
  const years = useMemo(() => groupByYear(items), [items]);

  const reveal = useCallback((behavior: ScrollBehavior) => {
    const element = stripRef.current;


    const expanded = element?.querySelector<HTMLElement>("[data-expanded]");
    const target = expanded?.querySelector<HTMLElement>("[aria-current='date']") ?? expanded;

    if (!element || !target) {
      return;
    }

    const stripBox = element.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    const offset = targetBox.left - stripBox.left + element.scrollLeft;
    const left = targetBox.width >= element.clientWidth ? offset : offset - (element.clientWidth - targetBox.width) / 2;




    element.scrollTo({ left, behavior });
  }, []);

  const lastExpandedYear = useRef(expandedYear);
  const firstReveal = useRef(true);

  const handleYearOpened = () => {
    reveal(reduceMotion ? "auto" : "smooth");
  };






  useLayoutEffect(() => {
    const element = stripRef.current;
    const focused = document.activeElement;

    if (!element || !(focused instanceof HTMLElement) || !element.contains(focused)) {
      return;
    }

    const panel = focused.closest("[role='group']");

    if (!panel || panel.closest("[data-expanded]")) {
      return;
    }

    const expanded = element.querySelector<HTMLElement>("[data-expanded]");
    const target = expanded?.querySelector<HTMLElement>("[aria-current='date']") ?? expanded?.querySelector<HTMLElement>("button");

    target?.focus({ preventScroll: true });
  }, [expandedYear]);

  useEffect(() => {
    const yearChanged = lastExpandedYear.current !== expandedYear;
    lastExpandedYear.current = expandedYear;



    if (yearChanged) {
      return;
    }

    reveal(firstReveal.current || reduceMotion ? "auto" : "smooth");
    firstReveal.current = false;
  }, [selected, expandedYear, reduceMotion, reveal]);

  const updateEdges = useCallback(() => {
    const element = stripRef.current;
    const content = element?.firstElementChild;

    if (!element || !content) {
      return;
    }

    const stripBox = element.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    const start = contentBox.left < stripBox.left - 1;
    const end = contentBox.right > stripBox.right + 1;

    setEdges((current) => (current.start === start && current.end === end ? current : { start, end }));
  }, []);

  useEffect(() => {
    const element = stripRef.current;

    if (!element) {
      return;
    }

    const observer = new ResizeObserver(updateEdges);
    observer.observe(element);

    if (element.firstElementChild) {
      observer.observe(element.firstElementChild);
    }

    return () => observer.disconnect();
  }, [updateEdges]);

  const expandYear = (year: number) => {
    setBrowsing(year === selectedYear ? null : { year, from: selected });
  };

  if (items.length === 0) {
    return null;
  }

  const slots = strip({ pending });
  const panelMotion = PANEL_MOTION[reduceMotion ? "reduced" : "full"];
  const fade = `linear-gradient(to right, ${edges.start ? "transparent" : "black"}, black 20px, black calc(100% - 20px), ${edges.end ? "transparent" : "black"})`;

  return (



    <div className={slots.band()}>
      <span aria-hidden="true" className={slots.progress()}>
        <span className="month-progress block h-full w-1/3 bg-primary" />
      </span>
      <span aria-live="polite" className="sr-only">
        {pending ? "Loading reporting month" : ""}
      </span>

      <MonthSheet items={items} selected={selected} onSelect={onSelect} scoped={scoped} />

      {}
      <nav
        ref={stripRef}
        aria-label="Reporting months"
        data-hydrated={hydrated || undefined}
        data-scoped={scoped || undefined}
        onScroll={updateEdges}
        className={slots.nav()}
        style={{ maskImage: fade, WebkitMaskImage: fade }}
      >
        <div className="flex w-max shrink-0 items-center gap-1.5">
          {years.map((group) => (
            <YearCapsule
              key={group.year}
              group={group}
              expanded={group.year === expandedYear}
              scoped={scoped}
              intro={intro && !reduceMotion}
              selected={selected}
              panelMotion={panelMotion}
              onExpand={() => expandYear(group.year)}
              onSelect={onSelect}
              onOpened={handleYearOpened}
            />
          ))}
        </div>
      </nav>

      {trailing ? <div className={slots.trail()}>{trailing}</div> : null}
    </div>
  );
}

function YearCapsule({
  group,
  expanded,
  scoped,
  intro,
  selected,
  panelMotion,
  onExpand,
  onSelect,
  onOpened,
}: {
  group: YearGroup;
  expanded: boolean;
  scoped: boolean;
  intro: boolean;
  selected: string;
  panelMotion: { enter: Transition; exit: Transition };
  onExpand: () => void;
  onSelect: (month: string) => void;
  onOpened: () => void;
}) {
  const chosen = group.months.find((month) => month.month === selected);
  const holdsSelected = chosen !== undefined;
  const panelId = `competencias-${group.year}`;
  const hintId = `${panelId}-selecionada`;


  const hint = chosen && !expanded ? `Selected reporting month: ${chosen.name}` : null;
  const slots = yearCapsule({ expanded, holdsSelected, scoped });

  return (
    <div data-expanded={expanded || undefined} className={slots.root()}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        aria-describedby={hint ? hintId : undefined}
        aria-disabled={expanded || undefined}
        onClick={expanded ? undefined : onExpand}
        className={slots.year()}
      >
        <span className="leading-none">{group.year}</span>
        <YearTicks group={group} selected={selected} hidden={expanded} />
      </button>
      {hint ? (
        <span id={hintId} hidden>
          {hint}
        </span>
      ) : null}

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="months"
            id={panelId}
            role="group"
            aria-label={`Months in ${group.year}`}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1, transition: panelMotion.enter }}
            exit={{ width: 0, opacity: 0, transition: panelMotion.exit }}
            onAnimationComplete={(definition) => {
              const opened = typeof definition === "object" && "width" in definition && definition.width === "auto";

              if (opened) {
                onOpened();
              }
            }}
            className="-my-[3px] flex justify-end overflow-hidden"
          >
            <div className={slots.months()}>
              {group.months.map((month, index) => (
                <MonthButton
                  key={month.month}
                  item={month}
                  selected={month.month === selected}
                  onSelect={onSelect}
                  intro={intro ? Math.min(index, 12) * 0.025 : null}
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MonthButton({
  item,
  selected,
  onSelect,
  intro,
}: {
  item: MonthStripItem;
  selected: boolean;
  onSelect: (month: string) => void;

  intro: number | null;
}) {
  return (
    <motion.button
      initial={intro === null ? false : { opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 30, delay: intro ?? 0 }}
      type="button"
      aria-label={item.description ? `${item.name}, ${item.description}` : item.name}
      aria-current={selected ? "date" : undefined}
      onClick={() => onSelect(item.month)}
      className={monthButton({ selected })}
    >
      <span className="leading-none">{item.short}</span>
      <span aria-hidden="true" className={monthMarker({ marker: item.marker, selected })} />
    </motion.button>
  );
}

function YearTicks({ group, selected, hidden }: { group: YearGroup; selected: string; hidden: boolean }) {
  const byMonth = new Map(group.months.map((month) => [Number(month.month.slice(5, 7)) - 1, month]));



  return (
    <span aria-hidden="true" className={cn("mt-1 flex gap-px transition-opacity duration-150", hidden ? "opacity-0" : "opacity-100")}>
      {Array.from({ length: 12 }, (_, index) => {
        const month = byMonth.get(index);

        return <span key={index} className={yearTick({ state: !month ? "absent" : month.month === selected ? "selected" : month.marker })} />;
      })}
    </span>
  );
}



function subscribeNothing() {
  return () => {};
}

function isClient() {
  return true;
}

function isServer() {
  return false;
}

function groupByYear(items: readonly MonthStripItem[]): YearGroup[] {
  const groups: YearGroup[] = [];

  for (const item of items) {
    const year = Number(item.month.slice(0, 4));
    const group = groups.at(-1);

    if (group?.year === year) {
      group.months.push(item);
    } else {
      groups.push({ year, months: [item] });
    }
  }

  return groups;
}
