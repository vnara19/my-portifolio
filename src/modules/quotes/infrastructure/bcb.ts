import { z } from "zod";

import { fetchJson, ProviderRefusalError, QuoteHttpError } from "@/modules/quotes/infrastructure/http";


const periodSchema = z.object({
  value: z.array(z.object({ cotacaoVenda: z.number().positive(), dataHoraCotacao: z.string() })),
});


function olindaDate(day: string) {
  const [year, month, date] = day.split("-");
  return `'${month}-${date}-${year}'`;
}


export async function fetchPtaxUsdPeriod(startDay: string, endDay: string) {
  const url = new URL(
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)",
  );
  url.searchParams.set("@dataInicial", olindaDate(startDay));
  url.searchParams.set("@dataFinalCotacao", olindaDate(endDay));
  url.searchParams.set("$format", "json");
  url.searchParams.set("$select", "cotacaoVenda,dataHoraCotacao");
  const payload = periodSchema.parse(await fetchJson(url));

  return payload.value.map((quote) => ({ day: quote.dataHoraCotacao.slice(0, 10), value: quote.cotacaoVenda }));
}


export async function fetchPtaxUsdLatest(today: string) {
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 10);
  const days = await fetchPtaxUsdPeriod(start.toISOString().slice(0, 10), today);
  const latest = days.at(-1);

  if (!latest) {
    throw new ProviderRefusalError("MISSING_QUOTE", "Banco Central has not published PTAX in the last few days.");
  }

  return latest.value;
}


const cdiSchema = z.array(z.object({ data: z.string(), valor: z.string() }));


function sgsDate(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}


export async function fetchCdiDaily(startDay: string, endDay: string) {
  try {
    return await fetchCdiDailyJson(startDay, endDay);
  } catch (error) {

    if (error instanceof QuoteHttpError && error.statusCode === 404) {
      throw error;
    }

    return fetchCdiDailySoap(startDay, endDay);
  }
}

async function fetchCdiDailyJson(startDay: string, endDay: string) {
  const url = new URL("https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados");
  url.searchParams.set("formato", "json");
  url.searchParams.set("dataInicial", sgsDate(startDay));
  url.searchParams.set("dataFinal", sgsDate(endDay));
  const payload = cdiSchema.parse(await fetchJson(url));

  return payload.map((entry) => {
    const [date, month, year] = entry.data.split("/");
    return { date: `${year}-${month}-${date}`, dailyPercent: entry.valor.replace(",", ".") };
  });
}

const SGS_SOAP_URL = "https://www3.bcb.gov.br/wssgs/services/FachadaWSSGS";


export async function fetchCdiDailySoap(startDay: string, endDay: string) {
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pub="http://publico.ws.casosdeuso.sgs.pec.bcb.gov.br">' +
    "<soapenv:Body><pub:getValoresSeriesXML><codigosSeries><item>12</item></codigosSeries>" +
    `<dataInicio>${sgsDate(startDay)}</dataInicio><dataFim>${sgsDate(endDay)}</dataFim>` +
    "</pub:getValoresSeriesXML></soapenv:Body></soapenv:Envelope>";
  const response = await fetch(SGS_SOAP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();

  if (text.includes("Value(s) not found")) {
    return [];
  }

  if (!response.ok) {
    throw new QuoteHttpError(response.status, `Banco Central responded with HTTP ${response.status}.`);
  }

  const series = text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");

  if (!/<SERIE ID='12'>/.test(series)) {
    throw new ProviderRefusalError("INVALID_RESPONSE", "Banco Central responded without the CDI series.");
  }

  const items = [...series.matchAll(/<ITEM>([\s\S]*?)<\/ITEM>/g)].map((match) => match[1]);

  return items.flatMap((item) => {
    const date = /<DATA>(\d{1,2})\/(\d{1,2})\/(\d{4})<\/DATA>/.exec(item);
    const value = /<VALOR>([\d.,]+)<\/VALOR>/.exec(item);

    if (!date || !value || /<BLOQUEADO>true<\/BLOQUEADO>/.test(item)) {
      return [];
    }

    const [, day, month, year] = date;
    return [{ date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`, dailyPercent: value[1].replace(",", ".") }];
  });
}

/** SGS 433 observations are monthly inflation percentages, not daily rates. */
export async function fetchIpcaMonthly(startDay: string, endDay: string) {
  const url = new URL("https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados");
  url.searchParams.set("formato", "json");
  url.searchParams.set("dataInicial", sgsDate(`${startDay.slice(0, 7)}-01`));
  url.searchParams.set("dataFinal", sgsDate(endDay));
  const payload = cdiSchema.parse(await fetchJson(url));
  return payload.map((entry) => {
    const [day, month, year] = entry.data.split("/");
    const value = entry.valor.replace(",", ".");
    if (day !== "01" || !/^-?\d+(?:\.\d+)?$/.test(value) || Number(value) <= -100) throw new ProviderRefusalError("INVALID_RESPONSE", "Invalid monthly IPCA observation.");
    return { date: `${year}-${month}-01`, dailyPercent: value };
  });
}
