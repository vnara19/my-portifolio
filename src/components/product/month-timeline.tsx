"use client";

/** The global reporting-month selector preserves navigation context and offers a compact mobile picker. */

import { useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useTransition } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { MonthStrip, type MonthStripItem } from "@/components/product/month-strip";
import { confirmDiscardChanges, hasPendingChanges } from "@/components/product/unsaved-changes";
import type { PortfolioMonthSummary } from "@/modules/portfolio/application/get-portfolio-months";
import { formatMonth, formatPercent } from "@/modules/portfolio/presentation/portfolio-format";

type MonthTimelineProps = {
  months: PortfolioMonthSummary[];
  selectedMonth: string;


  scoped?: boolean;
};


export function MonthTimeline({ months, selectedMonth, scoped = false }: MonthTimelineProps) {
  const [isPending, startTransition] = useTransition();
  const [monthParam, setMonth] = useQueryState("mes", { shallow: false, startTransition });
  const calendarSeen=useRef<string|null>(null);
  useEffect(() => {
    const followCalendar = () => {
      if (document.visibilityState !== "visible" || hasPendingChanges()) return;
      const current = new Date().toISOString().slice(0,7);
      if (months.at(-1)?.month !== current) return;
      let previous = calendarSeen.current;
      try { previous ??= sessionStorage.getItem("portfolio:calendar-month"); } catch {}
      if (previous === current) return;
      calendarSeen.current=current;
      try { sessionStorage.setItem("portfolio:calendar-month",current); } catch {}
      if (monthParam && monthParam !== current) void setMonth(null,{history:"replace"});
    };
    followCalendar();
    const timer=window.setInterval(followCalendar,60_000);
    document.addEventListener("visibilitychange",followCalendar);
    return ()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",followCalendar);};
  }, [months,monthParam,setMonth]);
  const items = useMemo(() => months.map(toItem), [months]);


  const activeMonth =
    monthParam !== null && months.some((month) => month.month === monthParam) ? monthParam : selectedMonth;
  const activeIndex = months.findIndex((month) => month.month === activeMonth);

  const goTo = (month: string) => {
    if (month === activeMonth || !confirmDiscardChanges()) {
      return;
    }

    void setMonth(month);
  };

  const select = (index: number) => {
    const target = months[index];

    if (target) {
      goTo(target.month);
    }
  };


  useHotkeys("left", () => select(activeIndex - 1), [activeIndex, months, activeMonth]);
  useHotkeys("right", () => select(activeIndex + 1), [activeIndex, months, activeMonth]);

  if (months.length === 0) {
    return null;
  }

  return (
    <MonthStrip
      items={items}
      selected={activeMonth}
      onSelect={goTo}
      pending={isPending}
      scoped={scoped}
    />
  );
}

function toItem(month: PortfolioMonthSummary): MonthStripItem {
  return {
    month: month.month,
    name: formatMonth(month.referenceDate),
    short: formatMonthLabel(month.referenceDate),
    description: month.changePercent === null ? undefined : `${formatPercent(month.changePercent)} this month (BRL)`,
    marker: month.changeBrl === null ? "none" : month.changeBrl >= 0 ? "up" : "down",
  };
}

function formatMonthLabel(referenceDate: Date) {
  const label = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: "UTC",
  })
    .format(referenceDate)
    .replace(".", "");

  return label.charAt(0).toLocaleUpperCase("en-GB") + label.slice(1);
}
