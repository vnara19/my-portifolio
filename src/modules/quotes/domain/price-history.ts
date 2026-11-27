
//


//


export type MonthlyQuoteInput = {
  /** YYYY-MM */
  month: string;
  valueBrl: number;
  /** YYYY-MM-DD */
  quoteDate: string | null;
  carriedFrom: string | null;
};

export type DailyQuoteInput = {
  /** YYYY-MM-DD */
  day: string;
  valueBrl: number;
};

export type PricePoint = {

  t: number;
  day: string;
  month: string;

  open: boolean;
  valueBrl: number;

  valueUsd: number | null;
};

export type PriceHistory = {
  points: PricePoint[];

  carriedMonths: string[];
};

type Closing = { day: string; valueBrl: number };


export function monthlyClosings(monthly: MonthlyQuoteInput[], daily: DailyQuoteInput[], today: string) {
  const closings = new Map<string, Closing>();
  const carried = new Set<string>();

  for (const quote of daily) {
    const month = quote.day.slice(0, 7);
    const current = closings.get(month);

    if (!current || quote.day > current.day) {
      closings.set(month, { day: quote.day, valueBrl: quote.valueBrl });
    }
  }

  for (const quote of monthly) {
    if (quote.carriedFrom) {
      if (!closings.has(quote.month)) {
        carried.add(quote.month);
      }

      continue;
    }

    const lastDay = lastDayKey(quote.month);
    closings.set(quote.month, {
      day: quote.quoteDate ?? (lastDay < today ? lastDay : today),
      valueBrl: quote.valueBrl,
    });
  }

  return { closings, carried };
}

export function buildPriceHistory({
  symbol,
  monthly,
  daily,
  usdMonthly,
  usdDaily,
  today,
}: {
  symbol: string;
  monthly: MonthlyQuoteInput[];
  daily: DailyQuoteInput[];
  usdMonthly: MonthlyQuoteInput[];
  usdDaily: DailyQuoteInput[];
  /** YYYY-MM-DD */
  today: string;
}): PriceHistory {
  const inUsd = symbol !== "USD";
  const { closings, carried } = monthlyClosings(monthly, daily, today);
  const usd = inUsd ? monthlyClosings(usdMonthly, usdDaily, today).closings : new Map<string, Closing>();
  const currentMonth = today.slice(0, 7);

  const points: PricePoint[] = [...closings.entries()]
    .map(([month, closing]) => {
      const rate = usd.get(month)?.valueBrl;

      return {
        t: dayTime(closing.day),
        day: closing.day,
        month,
        open: month >= currentMonth,
        valueBrl: closing.valueBrl,
        valueUsd: inUsd && rate ? closing.valueBrl / rate : null,
      };
    })
    .sort((left, right) => left.t - right.t);

  return { points, carriedMonths: [...carried].sort() };
}

export function dayTime(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
}

function lastDayKey(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}
