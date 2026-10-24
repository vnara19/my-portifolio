import { bondLookupFieldsSchema, type BondLookupFields, type BondLookupSource } from "@/modules/portfolio/domain/bond-lookup";
import { bondDay, scheduledBondCoupons } from "@/modules/portfolio/domain/international-bond";
import { QuoteHttpError } from "./http";

const pages = new Map<string, { until: number; promise: Promise<string | null> }>();
/** Public issuer pages only; bounded reads, shared catalog cache, no browser/session bypass. */
async function html(url: string): Promise<string | null> {
  const cached = pages.get(url);
  if (cached && cached.until > Date.now()) return cached.promise;
  const promise = (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(6500), cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) throw new QuoteHttpError(response.status, "Official bond source unavailable.");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty issuer response");
    let size = 0, text = ""; const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 2_000_000) { await reader.cancel(); throw new Error("Issuer response too large"); }
        text += decoder.decode(value, { stream: true });
      }
    } finally { reader.releaseLock(); }
    return text + decoder.decode();
  })();
  if (pages.size > 200) pages.clear();
  pages.set(url, { promise, until: Date.now() + 3_600_000 });
  promise.catch(() => { pages.set(url, { promise, until: Date.now() + 30_000 }); });
  return promise;
}
export function htmlText(value: string) {
  return value.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : " ")
    .replace(/&(?:nbsp|#160);/g, " ").replace(/&amp;/g, "&").replace(/&euro;/g, "€").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
}
const rows = (page: string) => [...page.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => htmlText(c[1])));
export function officialDate(value: string) {
  const months: Record<string, string> = { jan: "01", feb: "02", mar: "03", mär: "03", apr: "04", may: "05", mai: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", okt: "10", nov: "11", dec: "12", dez: "12" };
  const match = value.trim().match(/^(\d{1,2})[.\s/-]+([A-Za-zä]+|\d{1,2})[.\s/-]+(\d{4})$/);
  if (!match) return null;
  const month = /^\d+$/.test(match[2]) ? match[2].padStart(2, "0") : months[match[2].toLowerCase().slice(0, 3)];
  const date = `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
  return bondDay.safeParse(date).success ? date : null;
}
function decimal(value: string) { const clean = value.trim().replace(/\s*%$/, "").replace(",", "."); return /^\d+(?:\.\d+)?$/.test(clean) && Number(clean) <= 100 ? String(Number(clean)) : null; }
function source(name: string, url: string, fields: BondLookupFields): BondLookupSource { return { name, url, fields: bondLookupFieldsSchema.parse(fields) }; }
function regularTerms(fields: BondLookupFields, rate: string | null, frequency?: "1" | "2" | "4" | "12", anchor?: string) {
  if (rate === null) return fields;
  if (Number(rate) === 0) return { ...fields, structure: "Zero" as const };
  const next = { ...fields, structure: "Fixed" as const, annualRate: rate };
  if (frequency && anchor && fields.maturityDate) {
    const terms = { annualRate: rate, frequency: Number(frequency) as 1 | 2 | 4 | 12, anchorDate: anchor, dayCount: "Manual" as const };
    try {
      const dates = scheduledBondCoupons(terms, new Date().toISOString().slice(0, 10), fields.maturityDate, "1");
      return { ...next, frequency, anchorDate: dates[0]?.date ?? anchor };
    } catch { /* Do not fabricate a regular schedule for inconsistent dates. */ }
  }
  return next;
}
const NTMA = "https://www.ntma.ie/business-areas/funding-and-debt-management/government-securities/government-bonds";
export function parseNtma(page: string, identifier: string): BondLookupSource | null {
  // Only the current benchmark/non-benchmark table: exclude amortising/floating/retired tables.
  const table = [...page.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].find((m) => /Treasury Bond Offering Circular/.test(htmlText(m[0])))?.[0];
  if (!table) return null;
  const matches = rows(table).filter((r) => r.length === 5 && r[4] === identifier);
  if (matches.length !== 1) return null;
  const row = matches[0], maturity = officialDate(row[2]);
  const rate = row[0].match(/^(\d+(?:\.\d+)?)%\s+\d{4}(?:\s|$)/)?.[1];
  if (!maturity || !rate || /floating|amortis/i.test(row[0])) return null;
  const coupon = officialDate(`${row[3]} ${maturity.slice(0, 4)}`);
  const fields: BondLookupFields = { issuer: "Ireland", issuerCountry: "Ireland", family: "Sovereign", currency: "EUR", maturityDate: maturity };
  // A single recurring annual coupon date in this standard Treasury Bond table.
  const annual = coupon?.slice(5) === maturity.slice(5) ? "1" : undefined;
  return source("NTMA", NTMA, regularTerms(fields, decimal(rate), annual, maturity));
}
export async function ntmaBond(id: string) { if (!id.startsWith("IE")) return null; const page = await html(NTMA); return page ? parseNtma(page, id) : null; }

const GERMANY = "https://www.deutsche-finanzagentur.de/bundeswertpapiere/factsheet/isin/";
export function parseGermanBond(page: string, id: string): BondLookupSource | null {
  const isin = page.match(/bb-text-with-label__label[^>]*>\s*ISIN\s*<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  if (!isin || htmlText(isin) !== id) return null;
  const attributes = new Map<string, string>();
  const termKeys = new Set(["Emittent", "Emissionswährung", "Fälligkeit", "Kupon in %", "Zahlweise"]);
  for (const row of rows(page).filter((r) => r.length === 2 && termKeys.has(r[0]))) {
    if (attributes.has(row[0]) && attributes.get(row[0]) !== row[1]) return null;
    attributes.set(row[0], row[1]);
  }
  if (attributes.get("Emittent") !== "Bundesrepublik Deutschland" || attributes.get("Emissionswährung") !== "€") return null;
  const maturity = officialDate(attributes.get("Fälligkeit") ?? ""); if (!maturity) return null;
  const fields: BondLookupFields = { issuer: "Federal Republic of Germany", issuerCountry: "Germany", family: "Sovereign", currency: "EUR", maturityDate: maturity };
  const kind = page.match(/bb-text-with-label__label[^>]*>\s*Art\s*<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
  if (/inflation/i.test(htmlText(kind))) return source("German Finance Agency", `${GERMANY}${id}/`, { ...fields, structure: "Inflation" });
  const frequency = attributes.get("Zahlweise") === "jährlich" ? "1" : attributes.get("Zahlweise") === "halbjährlich" ? "2" : undefined;
  // Minimum tradable amount is intentionally not Face Value per Bond.
  const heading = htmlText(page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  // The zero coupon appears explicitly in the official heading; its table cell is a dash.
  const rate = decimal(attributes.get("Kupon in %") ?? "") ?? (/^0(?:[,.]0+)?\s*%\s/.test(heading) ? "0" : null);
  return source("German Finance Agency", `${GERMANY}${id}/`, regularTerms(fields, rate, frequency, maturity));
}
export async function germanBond(id: string) { if (!id.startsWith("DE")) return null; const page = await html(`${GERMANY}${id}/`); return page ? parseGermanBond(page, id) : null; }

const ESM = "https://www.esm.europa.eu/investors/esm-and-efsf/transactions?items_per_page=All";
export function parseEsm(page: string, id: string): BondLookupSource | null {
  const matches = rows(page).filter((r) => r[1] === id && r.length >= 10);
  if (!matches.length) return null;
  const candidates = matches.map((row) => {
    const issuer = row[0] === "ESM" ? "European Stability Mechanism" : row[0] === "EFSF" ? "European Financial Stability Facility" : null;
    const maturity = officialDate(row[8]); if (!issuer || !maturity || !["EUR", "USD"].includes(row[6])) return null;
    const fields: BondLookupFields = { issuer, family: "Supranational", currency: row[6] as "EUR" | "USD", maturityDate: maturity };
    return row[2] === "Bill" ? { ...fields, structure: "Zero" as const } : row[2] === "Bond" ? regularTerms(fields, decimal(row[9])) : fields;
  }).filter((v) => v !== null);
  if (!candidates.length || new Set(candidates.map((v) => JSON.stringify(v))).size !== 1) return null;
  // No country or coupon frequency is guessed from a supranational issuer's address.
  return source("ESM / EFSF", ESM, candidates[0]);
}
export async function esmBond(id: string) { if (!/^(EU|XS)/.test(id)) return null; const page = await html(ESM); return page ? parseEsm(page, id) : null; }

const AFT = "https://www.aft.gouv.fr/en/titre/";
/** Explicit nominal-value labels only. Inflation-adjusted principal and trade minima are not units. */
export function parseFrenchBond(page: string, id: string): BondLookupSource | null {
  const text = htmlText(page);
  if (!text.includes(`ISIN Code ${id} Type of security Nominal, fixed rate Currency of issue Euro Nominal value `)) return null;
  const matches = [...text.matchAll(/Nominal value (\d+(?:\.\d{1,8})?) Euro Maturity date (\d{2}\/\d{2}\/\d{4})/g)];
  if (matches.length !== 1 || Number(matches[0][1]) <= 0) return null;
  const maturityDate = officialDate(matches[0][2]); if (!maturityDate) return null;
  return source("Agence France Trésor", `${AFT}${id.toLowerCase()}`, { currency: "EUR", maturityDate, faceValuePerBond: matches[0][1] });
}
export async function frenchBond(id: string) { if (!/^FR[A-Z0-9]{10}$/.test(id)) return null; const page = await html(`${AFT}${id.toLowerCase()}`); return page ? parseFrenchBond(page, id) : null; }

const CNMV = "https://www.cnmv.es/portal/ancv/isin";
/** The registry column also holds prices for non-debt assets: accept conventional fixed debt only. */
export function parseSpanishBond(page: string, id: string): BondLookupSource | null {
  const table = [...page.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].find((m) => /Nominal\s*\/\s*VMN\s*\/\s*Precio/.test(htmlText(m[0])))?.[0];
  if (!table) return null;
  const matches = rows(table).filter((r) => r.length === 9 && r[0] === id);
  if (matches.length !== 1) return null;
  const row = matches[0];
  // DBFTFB: debt/bond/fixed-rate/standard redemption. Do not interpret equity prices,
  // index-linked principal, structured or amortising securities as Face Value per Bond.
  if (row[8] !== "DBFTFB" || !["EUR", "USD"].includes(row[6]) || !/^\d{1,3}(?:\.\d{3})*(?:,\d{1,8})?$|^\d+(?:,\d{1,8})?$/.test(row[5])) return null;
  const value = row[5].replaceAll(".", "").replace(",", "."), maturityDate = officialDate(row[4]);
  if (Number(value) <= 0 || !maturityDate) return null;
  return source("CNMV", `${CNMV}?isin=${id}&lang=es`, { currency: row[6] as "EUR" | "USD", maturityDate, faceValuePerBond: String(Number(value)) });
}
export async function spanishBond(id: string) { if (!/^ES[A-Z0-9]{10}$/.test(id)) return null; const page = await html(`${CNMV}?isin=${id}&lang=es`); return page ? parseSpanishBond(page, id) : null; }
