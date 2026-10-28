import { monthFromKey } from "@/modules/portfolio/domain/position-history";
import { formatMonthCompact } from "@/modules/portfolio/presentation/portfolio-format";


const POSITION_PAGE_PARAMS = ["contas"];


export function positionHref(accountId: string, assetId: string, search: string | URLSearchParams) {
  return `/posicoes/${accountId}/${assetId}${queryOf(search)}`;
}

export function positionsTableHref(search: string | URLSearchParams) {
  return `/posicoes${queryOf(search)}`;
}

function queryOf(search: string | URLSearchParams) {
  const params = new URLSearchParams(search);

  for (const key of POSITION_PAGE_PARAMS) {
    params.delete(key);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}


export function monthLabel(month: string) {
  return formatMonthCompact(monthFromKey(month));
}


export function monthRangeLabel(first: string, last: string) {
  return first === last ? monthLabel(first) : `${monthLabel(first)} a ${monthLabel(last)}`;
}


export function quantityUnit(quoteSymbol: string | null, ticker: string | null) {
  return (ticker ?? quoteSymbol ?? "").replace(/\.SAO$/, "");
}


export function formatQuantity(quantity: number, quoteSymbol: string | null, ticker: string | null) {
  if (quoteSymbol === "USD") {
    return `US$ ${formatUsd(quantity)}`;
  }

  return `${quantity.toLocaleString("en-GB", { maximumFractionDigits: 8 })} ${quantityUnit(quoteSymbol, ticker)}`;
}

export function formatUsd(value: number) {
  return value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


export function formatSignedBrl(value: number) {
  const formatted = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(value);

  return formatted;
}





export function formatEstimatedPrice(value: number) {
  const digits = Math.abs(value) >= 100 ? 2 : Math.abs(value) >= 1 ? 4 : 8;

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(value);
}
