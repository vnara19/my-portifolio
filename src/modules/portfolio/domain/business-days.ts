
/** Brazilian business-day calendar for 252-day fixed-income accrual; English display does not change local market rules. */


export function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const holidayCache = new Map<number, Set<string>>();


export function nationalHolidays(year: number) {
  const cached = holidayCache.get(year);

  if (cached) {
    return cached;
  }

  const fixed = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];

  if (year >= 2024) {
    fixed.push("11-20");
  }

  const easter = easterSunday(year);
  const moving = [-48, -47, -2, 60].map((offset) => addDays(easter, offset));
  const holidays = new Set([...fixed.map((day) => `${year}-${day}`), ...moving]);
  holidayCache.set(year, holidays);
  return holidays;
}

export function isBusinessDay(day: string) {
  const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !nationalHolidays(Number(day.slice(0, 4))).has(day);
}


export function businessDaysBetween(start: string, end: string) {
  let count = 0;

  for (let day = start; day < end; day = addDays(day, 1)) {
    if (isBusinessDay(day)) {
      count += 1;
    }
  }

  return count;
}

export function addDays(day: string, amount: number) {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
