
/** Parse the official Tesouro Direto CSV without renaming its external column headers or security identifiers. */
import { monthEndPoints, type DayValue } from "@/modules/quotes/domain/history-backfill";


export const TREASURY_INSTRUMENT_TYPE = "TESOURO";
export const TREASURY_PROVIDER = "tesouro";
export const TREASURY_SOURCE_URL = "https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto";

export type TreasuryIdentity = {
  symbol: string;
  providerId: string;
  name: string;
  type: string;
  /** YYYY-MM-DD */
  maturityDate: string;
};

export type TreasurySeries = TreasuryIdentity & { points: DayValue[] };
export type TreasuryBook = { series: Map<string, TreasurySeries> };
export type TreasuryCatalogBond = TreasuryIdentity & { quoteDate: string; valueBrl: number };

export function treasurySymbol(type: string, maturityDate: string) {
  const slug = type.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `TD:${slug}:${maturityDate}`;
}

export function treasuryProviderId(type: string, maturityDate: string) {
  return `${type.trim()}|${maturityDate}`;
}


export function treasurySeriesOf(book: TreasuryBook, target: { symbol: string; providerId?: string | null }) {
  const series = book.series.get(target.symbol);

  if (!series || (target.providerId && series.providerId !== target.providerId)) {
    return null;
  }

  return series;
}

export function latestTreasuryPoint(series: TreasurySeries, today: string) {


  return series.points.findLast((point) => point.day <= today);
}


export function treasuryMonthEndPoints(series: TreasurySeries, months: string[], currentMonth: string) {
  if (months.length === 0) return new Map<string, DayValue>();
  const points = monthEndPoints(series.points, months[0], currentMonth);
  const firstMonth = series.points[0].day.slice(0, 7);
  const lastMonth = series.points.at(-1)!.day.slice(0, 7);
  const missing = months.filter((month) => month >= firstMonth && month <= lastMonth && !points.has(month));
  if (missing.length > 0) throw new Error(`Tesouro Direto has not published prices for reporting months ${missing.join(", ")}.`);
  return new Map([...points].filter(([month]) => months.includes(month)));
}


export function getTreasuryCatalog(book: TreasuryBook, today: string): TreasuryCatalogBond[] {
  return [...book.series.values()].flatMap((series) => {
    const point = series.maturityDate > today ? latestTreasuryPoint(series, today) : null;

    if (!point) {
      return [];
    }

    const { points: _points, ...identity } = series;
    void _points;
    return [{ ...identity, quoteDate: point.day, valueBrl: point.value }];
  }).sort((left, right) =>
    typeRank(left.type) - typeRank(right.type) ||
    left.type.localeCompare(right.type, "en-GB") ||
    left.maturityDate.localeCompare(right.maturityDate));
}


const TYPE_ORDER = ["Tesouro Selic", "Tesouro Prefixado", "Tesouro IPCA+", "Tesouro Renda+", "Tesouro Educa+"];

function typeRank(type: string) {
  const index = TYPE_ORDER.findIndex((prefix) => type === prefix || type.startsWith(`${prefix} `));
  return index === -1 ? TYPE_ORDER.length : index;
}


export function isTreasuryDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) &&
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}

function officialDay(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  const day = match ? `${match[3]}-${match[2]}-${match[1]}` : "";

  if (!isTreasuryDay(day)) {
    throw new Error("Tesouro Direto returned an invalid date in the price file.");
  }

  return day;
}

function officialPrice(value: string) {
  const text = value.trim();

  if (!text) {
    return null;
  }

  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(text)) {
    throw new Error("Tesouro Direto returned an invalid price in the price file.");
  }

  const price = Number(text.replace(/\./g, "").replace(",", "."));

  if (!Number.isFinite(price)) {
    throw new Error("Tesouro Direto returned an invalid price in the price file.");
  }


  return price > 0 ? price : null;
}


function* csvRows(text: string) {
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && (char === ";" || char === "\n" || char === "\r")) {
      row.push(field);
      field = "";

      if (char !== ";") {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        if (row.some((entry) => entry.trim())) yield row;
        row = [];
      }
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("The Tesouro Direto price file contains an incomplete field.");
  row.push(field);
  if (row.some((entry) => entry.trim())) yield row;
}


export function parseTreasuryCsv(text: string): TreasuryBook {
  const rows = csvRows(text.replace(/^\uFEFF/, ""));
  const header = rows.next().value;
  const required = ["Tipo Titulo", "Data Vencimento", "Data Base", "PU Base Manha"];

  if (!header || required.some((name) => !header.includes(name))) {
    throw new Error("The Tesouro Direto file does not contain the expected market price columns.");
  }

  const [typeColumn, maturityColumn, dayColumn, priceColumn] = required.map((name) => header.indexOf(name));
  const series = new Map<string, TreasurySeries>();

  for (const row of rows) {
    if (row.length !== header.length) throw new Error("The Tesouro Direto price file contains an incomplete row.");
    const value = officialPrice(row[priceColumn]);
    if (value === null) continue;
    const type = row[typeColumn].trim();
    if (!type || type.includes("|")) throw new Error("The Tesouro Direto file contains an invalid security type.");
    const maturityDate = officialDay(row[maturityColumn]);
    const day = officialDay(row[dayColumn]);
    const symbol = treasurySymbol(type, maturityDate);
    let entry = series.get(symbol);

    if (entry && entry.type !== type) throw new Error("Two Tesouro Direto securities have the same identifier.");
    if (!entry) {
      const dayLabel = `${maturityDate.slice(8, 10)}/${maturityDate.slice(5, 7)}/${maturityDate.slice(0, 4)}`;
      entry = { symbol, providerId: treasuryProviderId(type, maturityDate), name: `${type} · ${dayLabel}`, type, maturityDate, points: [] };
      series.set(symbol, entry);
    }

    entry.points.push({ day, value });
  }

  if (series.size === 0) throw new Error("Tesouro Direto did not return valid market prices.");
  for (const entry of series.values()) {
    entry.points.sort((left, right) => left.day.localeCompare(right.day));
    for (let index = 1; index < entry.points.length; index += 1) {
      if (entry.points[index].day === entry.points[index - 1].day) {
        throw new Error("Tesouro Direto returned multiple prices for the same security and date.");
      }
    }
  }

  return { series };
}
