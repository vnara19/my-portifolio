
/** Reporting months are YYYY-MM keys backed by UTC dates on the first day of the month. */


export type Competence = string;

const KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function isCompetence(value: string): value is Competence {
  const match = KEY.exec(value);
  return match !== null && Number(match[1]) >= 2000 && Number(match[1]) <= 2100;
}

export function competenceOf(date: Date): Competence {
  return date.toISOString().slice(0, 7);
}

export function competenceDate(competence: Competence) {
  const [year, month] = competence.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

export function addCompetenceMonths(competence: Competence, amount: number): Competence {
  const [year, month] = competence.split("-").map(Number);
  return competenceOf(new Date(Date.UTC(year, month - 1 + amount, 1)));
}


export function currentCompetence(now = new Date()): Competence {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** "Oct/26". */
export function formatCompetence(competence: Competence) {
  const [year, month] = competence.split("-");
  return `${SHORT_MONTHS[Number(month) - 1]}/${year.slice(2)}`;
}

/** "October 2026". */
export function formatCompetenceLong(competence: Competence) {
  const [year, month] = competence.split("-");
  return `${LONG_MONTHS[Number(month) - 1]} ${year}`;
}


export function formatCompetenceMonth(competence: Competence) {
  return SHORT_MONTHS[Number(competence.split("-")[1]) - 1];
}


export function summarizeCompetences(selected: readonly string[]) {
  const months = [...new Set(selected)].sort();

  if (months.length === 0) return "";
  if (months.length === 12 && months.every((month) => month.slice(0, 4) === months[0].slice(0, 4))) {
    return `${months[0].slice(0, 4)} inteiro`;
  }
  if (months.length <= 3) return months.map(formatCompetence).join(", ");

  return `${months.length} months`;
}
