


export const HISTORY_BACKFILL_MONTHS = 36;

export type DayValue = {
  /** YYYY-MM-DD */
  day: string;
  value: number;
};


export function monthEndPoints(points: DayValue[], fromMonth: string, toMonth: string) {
  const closings = new Map<string, DayValue>();

  for (const point of points) {
    const month = point.day.slice(0, 7);

    if (month < fromMonth || month >= toMonth || !(point.value > 0)) {
      continue;
    }

    const current = closings.get(month);

    if (!current || point.day > current.day) {
      closings.set(month, point);
    }
  }

  return closings;
}

/** YYYY-MM months from `fromMonth` (inclusive) to `toMonth` (exclusive). */
export function monthsBetween(fromMonth: string, toMonth: string) {
  const months: string[] = [];
  let [year, month] = fromMonth.split("-").map(Number);

  for (;;) {
    const key = `${year}-${String(month).padStart(2, "0")}`;

    if (key >= toMonth) {
      return months;
    }

    months.push(key);
    month += 1;

    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
}
