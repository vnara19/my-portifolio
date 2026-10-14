"use client";

/** The global reporting-month selector preserves navigation context and offers a compact mobile picker. */

import { useQueryState } from "nuqs";
import { useMemo, useTransition } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { MonthLock } from "@/components/product/month-lock";
import { MonthStrip, type MonthStripItem } from "@/components/product/month-strip";
import { confirmDiscardChanges } from "@/components/product/unsaved-changes";
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
  const items = useMemo(() => months.map(toItem), [months]);


  const activeMonth =
    monthParam !== null && months.some((month) => month.month === monthParam) ? monthParam : selectedMonth;
  const activeIndex = months.findIndex((month) => month.month === activeMonth);
  const active = months[activeIndex];

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
      trailing={active ? <MonthLock month={active} /> : null}
    />
  );
}

function toItem(month: PortfolioMonthSummary): MonthStripItem {
  return {
    month: month.month,
    name: formatMonth(month.referenceDate),
    short: formatMonthLabel(month.referenceDate),
    description: month.changePercent === null ? undefined : `${formatPercent(month.changePercent)} this month`,
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
