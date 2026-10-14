import { formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";


export const MATURITY_SOON_DAYS = 30;

export type MaturityStatus = {
  tone: "neutral" | "soon" | "expired";
  label: string;

  title: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;


export function maturityStatus(maturityDate: string, referenceDay: string): MaturityStatus {
  const maturity = parseDay(maturityDate);
  const reference = parseDay(referenceDay);
  const days = Math.round((maturity.getTime() - reference.getTime()) / DAY_MS);
  const full = formatDay(maturity);

  if (days < 0) {
    return { tone: "expired", label: "vencido", title: `Matured on ${full}` };
  }

  if (days <= MATURITY_SOON_DAYS) {
    return {
      tone: "soon",
      label: days === 0 ? "matures today" : days === 1 ? "matures tomorrow" : `matures in ${days} days`,
      title: `Matures on ${full}`,
    };
  }

  return { tone: "neutral", label: `matures in ${formatMonthCompact(maturity)}`, title: `Matures on ${full}` };
}


export function maturityHint(maturityDate: string) {
  return `vence ${formatMonthCompact(parseDay(maturityDate))}`;
}

export function formatDay(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" }).format(date);
}

function parseDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
