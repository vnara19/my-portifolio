


export function calendarDay(now: Date) {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}


export function currentReferenceMonth(now = new Date()) {
  return monthOf(calendarDay(now));
}

export function monthOf(day: Date) {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
}

export function addMonths(month: Date, amount: number) {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + amount, 1));
}

export function lastDayOf(month: Date) {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
}

export function toDateKey(day: Date) {
  return day.toISOString().slice(0, 10);
}
