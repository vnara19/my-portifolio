"use client";

/** Accessible calendar using English labels and UTC-safe date keys. Parse display dates separately from database values. */

import { englishLabel } from "@/lib/english-labels";

import { Popover } from "@base-ui/react/popover";
import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";


const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_NAMES = ["domingo", "segunda", "Tuesday", "quarta", "quinta", "sexta", "Saturday"];
const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "March",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const YEARS_PER_PAGE = 12;

export type DatePickerProps = {
  /** YYYY-MM-DD, or empty. */
  value: string;
  onChange: (value: string) => void;

  min?: string;
  max?: string;
  "aria-label": string;
  placeholder?: string;

  clearable?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
};

export function DatePicker({
  value,
  onChange,
  min,
  max,
  "aria-label": label,
  placeholder = "dd/mm/aaaa",
  clearable = false,
  invalid = false,
  disabled = false,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value ? toDisplay(value) : "");
  const typed = draft !== null && draft.length === 10 ? fromDisplay(draft) : null;
  const outOfRange = typed !== null && !withinRange(typed, min, max);
  const incomplete = draft !== null && draft.length > 0 && (draft.length < 10 || typed === null);

  const type = (text: string) => {
    const masked = maskDate(text);
    setDraft(masked);

    if (masked === "") {
      onChange("");
      return;
    }

    const day = masked.length === 10 ? fromDisplay(masked) : null;

    if (day && withinRange(day, min, max)) {
      onChange(day);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div
        data-slot="date-picker"
        className={cn(
          "relative flex h-9 w-full items-center rounded-lg border bg-background/60 text-xs text-foreground transition-[border-color,box-shadow] duration-150 focus-within:ring-2",
          invalid || outOfRange
            ? "border-destructive focus-within:ring-destructive/40"
            : "border-border focus-within:border-primary/60 focus-within:ring-ring/50",
          open && "border-primary/60",
          disabled && "opacity-50",
          className,
        )}
      >
        <input
          aria-label={englishLabel(label)}
          aria-invalid={invalid || outOfRange || undefined}
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={shown}
          disabled={disabled}
          maxLength={10}
          onChange={(event) => type(event.target.value)}
          onFocus={() => setDraft(value ? toDisplay(value) : "")}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && event.altKey) {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className="h-full w-full min-w-0 flex-1 bg-transparent pr-9 pl-2.5 font-mono text-xs tabular-nums outline-none placeholder:font-sans placeholder:text-muted-foreground/60 disabled:cursor-not-allowed"
        />
        <Popover.Trigger
          disabled={disabled}
          aria-label={`Open calendar: ${englishLabel(label)}`}
          className="absolute inset-y-0 right-0 grid w-9 place-items-center rounded-r-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-primary data-popup-open:text-primary"
        >
          <CalendarBlankIcon aria-hidden="true" size={14} weight="bold" />
        </Popover.Trigger>
      </div>
      {incomplete || outOfRange ? (
        <span className="sr-only" role="status">
          {outOfRange ? `Choose a date between ${toDisplay(min ?? "")} e ${toDisplay(max ?? "")}.` : "Incomplete date."}
        </span>
      ) : null}
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={12} className="z-[60] outline-none">
          <Popover.Popup
            aria-label={`Calendar: ${englishLabel(label)}`}
            className="w-[min(18rem,calc(100vw-1.5rem))] origin-[var(--transform-origin)] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0"
          >
            {open ? (
              <Calendar
                value={value}
                min={min}
                max={max}
                clearable={clearable}
                onSelect={(day) => {
                  onChange(day);
                  setDraft(null);
                  setOpen(false);
                }}
              />
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Calendar({
  value,
  min,
  max,
  clearable,
  onSelect,
}: {
  value: string;
  min?: string;
  max?: string;
  clearable: boolean;
  onSelect: (day: string) => void;
}) {
  const today = todayKey();
  const start = value || clampDay(today, min, max);
  const [focused, setFocused] = useState(start);
  const [view, setView] = useState<"days" | "years">("days");
  const [yearPage, setYearPage] = useState(() => Number(start.slice(0, 4)) - 5);
  const focusRef = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);

  useEffect(() => {

    if (view === "days") {
      focusRef.current?.focus({ preventScroll: !moved.current });
    }
  }, [focused, view]);

  const year = Number(focused.slice(0, 4));
  const month = Number(focused.slice(5, 7)) - 1;
  const first = new Date(Date.UTC(year, month, 1));
  const gridStart = addDays(toKey(first), -first.getUTCDay());
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const weeks = days[35].slice(5, 7) === focused.slice(5, 7) ? 6 : 5;

  const move = (day: string) => {
    moved.current = true;
    setFocused(clampDay(day, min, max));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const steps: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => addMonthsKeepingDay(focused, event.shiftKey ? -12 : -1),
      PageDown: () => addMonthsKeepingDay(focused, event.shiftKey ? 12 : 1),
      Home: () => addDays(focused, -new Date(`${focused}T00:00:00Z`).getUTCDay()),
      End: () => addDays(focused, 6 - new Date(`${focused}T00:00:00Z`).getUTCDay()),
    };
    const step = steps[event.key];

    if (step) {
      event.preventDefault();
      move(step());
    }
  };

  const monthDisabled = (offset: number) => {
    const target = addMonthsKeepingDay(`${focused.slice(0, 8)}01`, offset);
    const lastOfTarget = addDays(addMonthsKeepingDay(target, 1), -1);
    return (min !== undefined && lastOfTarget < min) || (max !== undefined && target > max);
  };

  if (view === "years") {
    const years = Array.from({ length: YEARS_PER_PAGE }, (_, index) => yearPage + index);
    const yearAllowed = (candidate: number) =>
      (min === undefined || `${candidate}-12-31` >= min) && (max === undefined || `${candidate}-01-01` <= max);

    return (
      <div>
        <CalendarHeader
          title={`${years[0]} – ${years[years.length - 1]}`}
          titleLabel="Back to days"
          onTitle={() => setView("days")}
          onPrevious={() => setYearPage((page) => page - YEARS_PER_PAGE)}
          onNext={() => setYearPage((page) => page + YEARS_PER_PAGE)}
          previousLabel="Previous years"
          nextLabel="Next years"
        />
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {years.map((candidate) => (
            <button
              key={candidate}
              type="button"
              disabled={!yearAllowed(candidate)}
              aria-pressed={candidate === year}
              onClick={() => {
                move(`${candidate}${focused.slice(4)}`);
                setView("days");
              }}
              className={cn(
                "h-9 rounded-lg font-mono text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-30",
                candidate === year ? "bg-primary text-primary-foreground" : "text-foreground/85 hover:bg-white/[0.06]",
              )}
            >
              {candidate}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <CalendarHeader
        title={`${MONTH_NAMES[month]} ${year}`}
        titleLabel={`${MONTH_NAMES[month]} on ${year}. Choose the year`}
        onTitle={() => {
          setYearPage(year - 5);
          setView("years");
        }}
        onPrevious={() => move(addMonthsKeepingDay(focused, -1))}
        onNext={() => move(addMonthsKeepingDay(focused, 1))}
        previousLabel="Previous month"
        nextLabel="Next month"
        previousDisabled={monthDisabled(-1)}
        nextDisabled={monthDisabled(1)}
      />

      <div className="mt-3 grid grid-cols-7 text-center" aria-hidden="true">
        {WEEKDAYS.map((weekday, index) => (
          <span key={index} className="pb-1.5 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {weekday}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5" onKeyDown={onKeyDown} data-testid="date-picker-days">
        {days.slice(0, weeks * 7).map((day) => {
          const inMonth = day.slice(5, 7) === focused.slice(5, 7);
          const allowed = withinRange(day, min, max);
          const selected = day === value;
          const isToday = day === today;
          const date = new Date(`${day}T00:00:00Z`);

          return (
            <button
              key={day}
              ref={day === focused ? focusRef : undefined}
              type="button"
              tabIndex={day === focused ? 0 : -1}
              disabled={!allowed}
              aria-pressed={selected}
              aria-label={`${WEEKDAY_NAMES[date.getUTCDay()]}, ${date.getUTCDate()} on ${MONTH_NAMES[date.getUTCMonth()]} on ${date.getUTCFullYear()}${isToday ? ", today" : ""}`}
              onClick={() => onSelect(day)}
              onFocus={() => {
                if (day !== focused) setFocused(day);
              }}
              className={cn(
                "mx-auto grid size-9 place-items-center rounded-lg font-mono text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-25 sm:size-8",
                selected
                  ? "bg-primary font-semibold text-primary-foreground"
                  : isToday
                    ? "text-primary ring-1 ring-primary/45 hover:bg-primary/10"
                    : inMonth
                      ? "text-foreground/90 hover:bg-white/[0.06]"
                      : "text-muted-foreground/45 hover:bg-white/[0.04]",
              )}
            >
              {date.getUTCDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
        {withinRange(today, min, max) ? (
          <button
            type="button"
            onClick={() => onSelect(today)}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50"
          >Today
          </button>
        ) : (
          <span />
        )}
        {clearable && value ? (
          <button
            type="button"
            onClick={() => onSelect("")}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CalendarHeader({
  title,
  titleLabel,
  onTitle,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  previousDisabled = false,
  nextDisabled = false,
}: {
  title: string;
  titleLabel: string;
  onTitle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
}) {
  const arrowClass =
    "grid size-8 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="flex items-center justify-between gap-1">
      <button type="button" aria-label={previousLabel} onClick={onPrevious} disabled={previousDisabled} className={arrowClass}>
        <CaretLeftIcon aria-hidden="true" size={13} weight="bold" />
      </button>
      <button
        type="button"
        aria-label={titleLabel}
        onClick={onTitle}
        className="h-8 rounded-lg px-2.5 text-xs font-semibold tracking-[-0.01em] text-foreground capitalize outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {title}
      </button>
      <button type="button" aria-label={nextLabel} onClick={onNext} disabled={nextDisabled} className={arrowClass}>
        <CaretRightIcon aria-hidden="true" size={13} weight="bold" />
      </button>
    </div>
  );
}


export function maskDate(text: string) {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join("/");
}

function toDisplay(day: string) {
  return day ? day.split("-").reverse().join("/") : "";
}

function fromDisplay(text: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);

  if (!match) {
    return null;
  }

  const day = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && toKey(date) === day ? day : null;
}

function withinRange(day: string, min?: string, max?: string) {
  return (min === undefined || day >= min) && (max === undefined || day <= max);
}

function clampDay(day: string, min?: string, max?: string) {
  if (min !== undefined && day < min) return min;
  if (max !== undefined && day > max) return max;
  return day;
}

function toKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return toKey(date);
}


function addMonthsKeepingDay(day: string, amount: number) {
  const [year, month, date] = day.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + amount, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date, lastDay));
  return toKey(target);
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}


const SHORT_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type MonthPickerProps = {
  /** YYYY-MM, or empty. */
  value: string;
  onChange: (value: string) => void;

  min?: string;
  max?: string;
  "aria-label": string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
};

export function MonthPicker({
  value,
  onChange,
  min = "2000-01",
  max = "2100-12",
  "aria-label": label,
  placeholder = "mm/aaaa",
  invalid = false,
  disabled = false,
  className,
}: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value ? toMonthDisplay(value) : "");
  const typed = draft !== null && draft.length === 7 ? fromMonthDisplay(draft) : null;
  const outOfRange = typed !== null && (typed < min || typed > max);
  const incomplete = draft !== null && draft.length > 0 && (draft.length < 7 || typed === null);

  const type = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 6);
    const masked = [digits.slice(0, 2), digits.slice(2, 6)].filter(Boolean).join("/");
    setDraft(masked);
    const month = masked.length === 7 ? fromMonthDisplay(masked) : null;

    if (month && month >= min && month <= max) {
      onChange(month);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div
        data-slot="month-picker"
        className={cn(
          "relative flex h-9 w-full items-center rounded-lg border bg-background/60 text-xs text-foreground transition-[border-color,box-shadow] duration-150 focus-within:ring-2",
          invalid || outOfRange
            ? "border-destructive focus-within:ring-destructive/40"
            : "border-border focus-within:border-primary/60 focus-within:ring-ring/50",
          open && "border-primary/60",
          disabled && "opacity-50",
          className,
        )}
      >
        <input
          aria-label={englishLabel(label)}
          aria-invalid={invalid || outOfRange || undefined}
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={shown}
          disabled={disabled}
          maxLength={7}
          onChange={(event) => type(event.target.value)}
          onFocus={() => setDraft(value ? toMonthDisplay(value) : "")}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && event.altKey) {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className="h-full w-full min-w-0 flex-1 bg-transparent pr-9 pl-2.5 font-mono text-xs tabular-nums outline-none placeholder:font-sans placeholder:text-muted-foreground/60 disabled:cursor-not-allowed"
        />
        <Popover.Trigger
          disabled={disabled}
          aria-label={`Open months: ${englishLabel(label)}`}
          className="absolute inset-y-0 right-0 grid w-9 place-items-center rounded-r-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-primary data-popup-open:text-primary"
        >
          <CalendarBlankIcon aria-hidden="true" size={14} weight="bold" />
        </Popover.Trigger>
      </div>
      {incomplete || outOfRange ? (
        <span className="sr-only" role="status">
          {outOfRange ? `Choose a month between ${toMonthDisplay(min)} e ${toMonthDisplay(max)}.` : "Incomplete month."}
        </span>
      ) : null}
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={12} className="z-[60] outline-none">
          <Popover.Popup
            aria-label={`Months: ${englishLabel(label)}`}
            className="w-[min(17rem,calc(100vw-1.5rem))] origin-[var(--transform-origin)] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0"
          >
            {open ? (
              <MonthGrid
                value={value}
                min={min}
                max={max}
                onSelect={(month) => {
                  onChange(month);
                  setDraft(null);
                  setOpen(false);
                }}
              />
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MonthGrid({
  value,
  min,
  max,
  onSelect,
}: {
  value: string;
  min: string;
  max: string;
  onSelect: (month: string) => void;
}) {
  const current = todayKey().slice(0, 7);
  const start = value || (current < min ? min : current > max ? max : current);
  const [focused, setFocused] = useState(start);
  const focusRef = useRef<HTMLButtonElement>(null);
  const year = Number(focused.slice(0, 4));

  useEffect(() => {
    focusRef.current?.focus({ preventScroll: true });
  }, [focused]);

  const shift = (month: string, amount: number) => {
    const [y, m] = month.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1 + amount, 1));
    const next = date.toISOString().slice(0, 7);
    return next < min ? min : next > max ? max : next;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3, PageUp: -12, PageDown: 12 };
    const step = steps[event.key];

    if (step !== undefined) {
      event.preventDefault();
      setFocused(shift(focused, step));
    }
  };

  return (
    <div>
      <CalendarHeader
        title={String(year)}
        titleLabel={`Year ${year}. Return to the current year`}
        onTitle={() => setFocused(shift(current, 0))}
        onPrevious={() => setFocused(shift(focused, -12))}
        onNext={() => setFocused(shift(focused, 12))}
        previousLabel="Previous year"
        nextLabel="Next year"
        previousDisabled={`${year - 1}-12` < min}
        nextDisabled={`${year + 1}-01` > max}
      />
      <div className="mt-3 grid grid-cols-3 gap-1.5" onKeyDown={onKeyDown} data-testid="month-picker-months">
        {SHORT_MONTH_NAMES.map((name, index) => {
          const month = `${year}-${String(index + 1).padStart(2, "0")}`;
          const selected = month === value;
          const isCurrent = month === current;

          return (
            <button
              key={month}
              ref={month === focused ? focusRef : undefined}
              type="button"
              tabIndex={month === focused ? 0 : -1}
              disabled={month < min || month > max}
              aria-pressed={selected}
              aria-label={`${MONTH_NAMES[index]} on ${year}${isCurrent ? ", current month" : ""}`}
              onClick={() => onSelect(month)}
              onFocus={() => {
                if (month !== focused) setFocused(month);
              }}
              className={cn(
                "h-9 rounded-lg text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-25",
                selected
                  ? "bg-primary font-semibold text-primary-foreground"
                  : isCurrent
                    ? "text-primary ring-1 ring-primary/45 hover:bg-primary/10"
                    : "text-foreground/90 hover:bg-white/[0.06]",
              )}
            >
              {name}
            </button>
          );
        })}
      </div>
      {current >= min && current <= max ? (
        <div className="mt-3 border-t border-border/60 pt-2.5">
          <button
            type="button"
            onClick={() => onSelect(current)}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50"
          >Current month
          </button>
        </div>
      ) : null}
    </div>
  );
}

function toMonthDisplay(month: string) {
  return month ? `${month.slice(5, 7)}/${month.slice(0, 4)}` : "";
}

function fromMonthDisplay(text: string) {
  const match = /^(\d{2})\/(\d{4})$/.exec(text);
  return match && Number(match[1]) >= 1 && Number(match[1]) <= 12 ? `${match[2]}-${match[1]}` : null;
}
