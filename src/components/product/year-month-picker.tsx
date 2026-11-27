"use client";

import { CaretDownIcon, ListChecksIcon } from "@phosphor-icons/react/dist/ssr";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";
import { tv } from "tailwind-variants";

import { BottomSheet, BottomSheetClose, BottomSheetTrigger, sheetButton } from "@/components/product/bottom-sheet";
import { filterBadge } from "@/components/product/page-controls";
import { formatCompetenceLong, formatCompetenceMonth, summarizeCompetences } from "@/lib/competence";


//


const picker = tv({
  slots: {
    card: "hidden min-w-0 rounded-2xl border border-border bg-card/50 p-4 sm:block",
    head: "flex flex-wrap items-center justify-between gap-x-4 gap-y-2",
    label: "text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase",
    summary: "font-mono text-xs text-foreground",
    actions: "flex items-center gap-1",
    body: "mt-3 flex flex-col gap-2.5",
    segmented: "relative inline-flex w-fit shrink-0 gap-0.5 rounded-xl border border-border bg-background/50 p-1",


    rail: "flex w-fit max-w-full rounded-xl border border-border bg-background/50 p-1",
    trigger:
      "flex h-11 w-full items-center justify-between gap-3 rounded-xl border px-3.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 sm:hidden",
    triggerLabel: "text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase",
    triggerValue: "flex min-w-0 items-center gap-2 font-mono text-xs",
    sheetYears: "flex flex-wrap gap-2",
    sheetMonths: "mt-2 grid grid-cols-4 gap-2",
    sheetActions: "mb-2 flex flex-wrap items-center gap-2",
    dot: "size-1.5 shrink-0 rounded-full bg-primary",
  },
  variants: {
    multiple: {
      true: { trigger: "border-primary/30 bg-primary/[0.08]", triggerValue: "text-primary" },
      false: { trigger: "border-border bg-card/60", triggerValue: "text-foreground" },
    },
  },
  defaultVariants: { multiple: false },
});

const action = tv({
  base: "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
  variants: {
    pressed: {
      true: "bg-primary/[0.12] text-primary",
      false: "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
    },
  },
  defaultVariants: { pressed: false },
});

const yearButton = tv({
  base: "relative inline-flex h-8 min-w-14 shrink-0 items-center justify-center rounded-lg px-3 font-mono text-[11px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/50",
  variants: {
    open: {
      true: "text-primary",
      false: "text-muted-foreground hover:bg-white/[0.045] hover:text-foreground",
    },
  },
  defaultVariants: { open: false },
});


const cell = tv({
  base: "relative flex h-9 w-12 min-w-0 touch-manipulation flex-col items-center justify-center gap-1 border border-transparent font-mono text-[11px] font-medium outline-none transition-colors duration-150 select-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/50",
  variants: {
    selected: {
      true: "border-y-primary/30 bg-primary/[0.14] text-primary",
      false: "rounded-lg text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
    },
    joinLeft: { true: "", false: "" },
    joinRight: { true: "", false: "" },
  },
  compoundVariants: [
    { selected: true, joinLeft: false, class: "rounded-l-lg border-l-primary/30" },
    { selected: true, joinLeft: true, class: "rounded-l-none" },
    { selected: true, joinRight: false, class: "rounded-r-lg border-r-primary/30" },
    { selected: true, joinRight: true, class: "rounded-r-none" },
  ],
  defaultVariants: { selected: false, joinLeft: false, joinRight: false },
});

const attention = tv({
  base: "h-0.5 w-3.5 rounded-full transition-colors",
  variants: { pending: { true: "bg-warning-foreground/80", false: "bg-transparent" } },
  defaultVariants: { pending: false },
});

const MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));

export function YearMonthPicker({
  months,
  selected,
  multiple,
  pendingMonths,
  resultLabel = "Ready",
  onSelect,
  onToggleYear,
  onToggleMultiple,
}: {

  months: readonly string[];

  selected: readonly string[];
  multiple: boolean;

  pendingMonths: ReadonlySet<string>;

  resultLabel?: string;
  onSelect: (month: string) => void;

  onToggleYear: (year: number) => void;
  onToggleMultiple: () => void;
}) {


  const years = [...new Set(months.map((month) => Number(month.slice(0, 4))))].sort((a, b) => b - a);
  const anchorYear = Number((selected.at(-1) ?? months[0] ?? "").slice(0, 4)) || years[0];
  const [pinned, setPinned] = useState<{ year: number; from: string } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);


  const key = multiple ? "multiple" : (selected[0] ?? "");

  if (pinned !== null && pinned.from !== key) {
    setPinned(null);
  }

  const viewYear = pinned?.year ?? anchorYear;
  const slots = picker({ multiple });
  const summary = summarizeCompetences(selected);

  const openYear = (year: number) => setPinned(year === anchorYear && !multiple ? null : { year, from: key });

  const choose = (month: string, closeSheet: boolean) => {
    if (multiple) {
      setPinned({ year: viewYear, from: "multiple" });
    }

    onSelect(month);


    if (closeSheet && !multiple) {
      setSheetOpen(false);
    }
  };

  const shared = { years, viewYear, selected, multiple, pendingMonths, onOpenYear: openYear, onToggleYear, onToggleMultiple };

  return (
    <div className="min-w-0">
      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Reporting month"
        testId="family-month-sheet"
        trigger={
          <BottomSheetTrigger aria-label={`Reporting month: ${summary}`} data-testid="family-month-trigger" className={slots.trigger()}>
            <span className={slots.triggerLabel()}>Reporting month</span>
            <span className={slots.triggerValue()}>
              <span className="truncate">{summary}</span>
              <CaretDownIcon aria-hidden="true" className="shrink-0 text-muted-foreground" size={13} weight="bold" />
            </span>
          </BottomSheetTrigger>
        }
        footer={<BottomSheetClose className={sheetButton({ variant: "primary" })}>{resultLabel}</BottomSheetClose>}
      >
        <SheetBody {...shared} onChoose={(month) => choose(month, true)} />
      </BottomSheet>

      <fieldset className={slots.card()} data-testid="family-month-picker" data-multiple={multiple || undefined}>
        <legend className="sr-only">Reporting month</legend>
        <CardBody {...shared} summary={summary} onChoose={(month) => choose(month, false)} />
      </fieldset>
    </div>
  );
}

type BodyProps = {
  years: readonly number[];
  viewYear: number;
  selected: readonly string[];
  multiple: boolean;
  pendingMonths: ReadonlySet<string>;
  onOpenYear: (year: number) => void;
  onChoose: (month: string) => void;
  onToggleYear: (year: number) => void;
  onToggleMultiple: () => void;
};

function yearLabel(year: number, count: number, open: boolean) {
  return count > 0 && !open ? `${year}, ${count} ${count === 1 ? "selected month" : "selected months"}` : String(year);
}

function monthLabel(month: string, pending: boolean) {
  return `${formatCompetenceLong(month)}${pending ? ", with pending items" : ""}`;
}


function CardBody({
  years,
  viewYear,
  selected,
  multiple,
  pendingMonths,
  summary,
  onOpenYear,
  onChoose,
  onToggleYear,
  onToggleMultiple,
}: BodyProps & { summary: string }) {
  const slots = picker();
  const reduceMotion = useReducedMotion() ?? false;
  const group = useId();
  const chosen = new Set(selected);
  const yearMonths = MONTHS.map((month) => `${viewYear}-${month}`);
  const wholeYear = yearMonths.every((month) => chosen.has(month));

  return (
    <>
      <div className={slots.head()}>
        <div className="flex items-baseline gap-3">
          <p aria-hidden="true" className={slots.label()}>Reporting month
          </p>
          <p aria-hidden="true" className={slots.summary()} data-testid="family-month-summary">
            {summary}
          </p>
        </div>
        <div className={slots.actions()}>
          <button
            type="button"
            aria-pressed={wholeYear}
            aria-label={`Full year ${viewYear}`}
            onClick={() => onToggleYear(viewYear)}
            className={action({ pressed: wholeYear })}
          >Full year
          </button>
          <button
            type="button"
            aria-label="Select multiple months"
            aria-pressed={multiple}
            title={multiple ? "Select a single month" : "Select multiple months"}
            onClick={onToggleMultiple}
            className={action({ pressed: multiple })}
          >
            <ListChecksIcon aria-hidden="true" size={14} weight={multiple ? "bold" : "regular"} />Multiple months
            {multiple && selected.length > 1 ? (
              <span aria-hidden="true" data-testid="multi-month-count" className="font-mono text-[10px] font-semibold">
                {selected.length}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <div className={slots.body()}>
        <LayoutGroup id={group}>
          <div className={slots.segmented()} data-testid="family-year-badges">
            {years.map((year) => {
              const count = selected.filter((month) => month.startsWith(`${year}-`)).length;
              const open = year === viewYear;

              return (
                <button
                  key={year}
                  type="button"
                  aria-pressed={open}
                  aria-label={yearLabel(year, count, open)}
                  onClick={() => onOpenYear(year)}
                  className={yearButton({ open })}
                >
                  {open ? (
                    <motion.span
                      layoutId="year-marker"
                      aria-hidden="true"
                      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
                      className="absolute inset-0 rounded-lg border border-primary/30 bg-primary/[0.14]"
                    />
                  ) : null}
                  <span className="relative">{year}</span>
                  {count > 0 && !open ? <span aria-hidden="true" className="absolute top-1.5 right-1.5 size-1 rounded-full bg-primary" /> : null}
                </button>
              );
            })}
          </div>
        </LayoutGroup>

        <div role="group" aria-label={`Months in ${viewYear}`} className={slots.rail()} data-testid="family-month-badges">
          {yearMonths.map((month, index) => {
            const on = chosen.has(month);
            const pending = pendingMonths.has(month);

            return (
              <button
                key={month}
                type="button"
                aria-pressed={on}
                aria-label={monthLabel(month, pending)}
                data-competence={month}
                onClick={() => onChoose(month)}
                className={cell({
                  selected: on,
                  joinLeft: on && index > 0 && chosen.has(yearMonths[index - 1]),
                  joinRight: on && index < 11 && chosen.has(yearMonths[index + 1]),
                })}
              >
                {formatCompetenceMonth(month)}
                <span aria-hidden="true" className={attention({ pending })} />
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}


function SheetBody({ years, viewYear, selected, multiple, pendingMonths, onOpenYear, onChoose, onToggleYear, onToggleMultiple }: BodyProps) {
  const slots = picker();
  const chosen = new Set(selected);
  const yearMonths = MONTHS.map((month) => `${viewYear}-${month}`);
  const wholeYear = yearMonths.every((month) => chosen.has(month));

  return (
    <div>
      <div className={slots.sheetActions()}>
        <button
          type="button"
          aria-pressed={wholeYear}
          aria-label={`Full year ${viewYear}`}
          onClick={() => onToggleYear(viewYear)}
          className={filterBadge({ active: wholeYear, class: "h-11" })}
        >Full year
        </button>
        <button
          type="button"
          aria-label="Select multiple months"
          aria-pressed={multiple}
          onClick={onToggleMultiple}
          className={filterBadge({ active: multiple, class: ["h-11", "gap-1.5"] })}
        >
          <ListChecksIcon aria-hidden="true" size={14} weight={multiple ? "bold" : "regular"} />Multiple months
          {multiple && selected.length > 1 ? (
            <span aria-hidden="true" data-testid="multi-month-count" className="font-mono text-[10px] font-semibold">
              {selected.length}
            </span>
          ) : null}
        </button>
      </div>

      <div className={slots.sheetYears()} data-testid="family-year-badges">
        {years.map((year) => {
          const count = selected.filter((month) => month.startsWith(`${year}-`)).length;
          const open = year === viewYear;

          return (
            <button
              key={year}
              type="button"
              aria-pressed={open}
              aria-label={yearLabel(year, count, open)}
              onClick={() => onOpenYear(year)}
              className={filterBadge({ active: open, marked: count > 0, class: ["font-mono", "h-11"] })}
            >
              {year}
              {count > 0 && !open ? <span aria-hidden="true" className={slots.dot()} /> : null}
            </button>
          );
        })}
      </div>

      <div role="group" aria-label={`Months in ${viewYear}`} className={slots.sheetMonths()} data-testid="family-month-badges">
        {yearMonths.map((month) => {
          const pending = pendingMonths.has(month);

          return (
            <button
              key={month}
              type="button"
              aria-pressed={chosen.has(month)}
              aria-label={monthLabel(month, pending)}
              data-competence={month}
              onClick={() => onChoose(month)}
              className={filterBadge({ active: chosen.has(month), class: ["justify-center", "font-mono", "h-11"] })}
            >
              {formatCompetenceMonth(month)}
              {pending ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-warning-foreground" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
