import { z } from "zod";

import { fetchJson, ProviderRefusalError, QuoteHttpError } from "@/modules/quotes/infrastructure/http";

export type SelicObservation = { observedOn: string; percentAnnual: string; source: string };

export type SelicHistory = { source: string; observations: { observedOn: string; percentAnnual: string }[] };
export type SelicFetcher = (startDay: string, today: string) => Promise<SelicHistory>;

const observationsSchema = z.array(z.object({ data: z.string(), valor: z.string() }));
const SOAP_URL = "https://www3.bcb.gov.br/wssgs/services/FachadaWSSGS";


export const fetchSelicTarget: SelicFetcher = async (startDay, today) => {
  try {
    const url = new URL("https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados");
    url.searchParams.set("formato", "json");
    url.searchParams.set("dataInicial", sgsDate(startDay));
    url.searchParams.set("dataFinal", sgsDate(today));
    return selicHistory(observationsSchema.parse(await fetchJson(url, undefined, { timeoutMs: 10_000, attempts: 2 })), today, "bcb-sgs-432");
  } catch {

    return fetchSelicTargetSoap(startDay, today);
  }
};

export async function fetchSelicTargetSoap(startDay: string, today: string): Promise<SelicHistory> {
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pub="http://publico.ws.casosdeuso.sgs.pec.bcb.gov.br">' +
    "<soapenv:Body><pub:getValoresSeriesXML><codigosSeries><item>432</item></codigosSeries>" +
    `<dataInicio>${sgsDate(startDay)}</dataInicio><dataFim>${sgsDate(today)}</dataFim>` +
    "</pub:getValoresSeriesXML></soapenv:Body></soapenv:Envelope>";
  const response = await fetch(SOAP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '\"\"' },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new QuoteHttpError(response.status, `Banco Central responded with HTTP ${response.status}.`);
  }

  return parseSelicSoap(await response.text(), today);
}

export function parseSelicSoap(xml: string, today: string): SelicHistory {
  const series = xml.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");
  const contents = /<SERIE\b[^>]*ID=['"]432['"][^>]*>([\s\S]*?)<\/SERIE>/.exec(series)?.[1];

  if (!contents) {
    throw new ProviderRefusalError("INVALID_RESPONSE", "Banco Central responded without the Selic target series.");
  }

  const observations = [...contents.matchAll(/<ITEM>([\s\S]*?)<\/ITEM>/g)].flatMap((match) => {
    if (/<BLOQUEADO>true<\/BLOQUEADO>/.test(match[1])) return [];
    const data = /<DATA>([^<]+)<\/DATA>/.exec(match[1])?.[1];
    const valor = /<VALOR>([^<]+)<\/VALOR>/.exec(match[1])?.[1];
    return data && valor ? [{ data, valor }] : [];
  });
  return selicHistory(observations, today, "bcb-sgs-432-soap");
}


export function selicHistory(observations: { data: string; valor: string }[], today: string, source: string): SelicHistory {
  const byDay = new Map<string, string>();

  for (const { data, valor } of observations) {
    const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(data);
    const percentAnnual = valor.trim().replace(",", ".");
    if (!parts || !/^\d+(?:\.\d+)?$/.test(percentAnnual)) continue;
    const observedOn = `${parts[3]}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
    const date = new Date(`${observedOn}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== observedOn || observedOn > today || Number(percentAnnual) > 1000) continue;
    byDay.set(observedOn, percentAnnual);
  }

  if (byDay.size === 0) {
    throw new ProviderRefusalError("MISSING_RATE", "Banco Central did not return a valid Selic target for the period.");
  }

  return {
    source,
    observations: [...byDay.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([observedOn, percentAnnual]) => ({ observedOn, percentAnnual })),
  };
}


export function latestSelicObservation(observations: { data: string; valor: string }[], today: string, source: string): SelicObservation {
  const history = selicHistory(observations, today, source);
  return { ...history.observations[history.observations.length - 1], source };
}


export function selicChangePoints(history: SelicHistory, previous: string | null) {
  const points: { effectiveOn: string; percentAnnual: string }[] = [];
  let current = previous === null ? null : Number(previous);

  for (const observation of history.observations) {
    const value = Number(observation.percentAnnual);
    if (current === null || value !== current) {
      points.push({ effectiveOn: observation.observedOn, percentAnnual: observation.percentAnnual });
      current = value;
    }
  }

  return points;
}

function sgsDate(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}
