import { Prisma } from "@/generated/prisma/browser";
import { brazilianNetValue, brazilianIncomeTaxRate } from "./brazilian-net-value";
import { addDays, isBusinessDay } from "./business-days";

const DAY_MS = 86_400_000;

type Movement = {
  id: string; transferId?: string | null; occurredOn: string; kind: string; quantity: number;
  amountBrl: number; unitPriceBrl: number | null; note: string | null;
};

function settlementDay(purchasedOn: string) {
  let day = addDays(purchasedOn, 1);
  while (!isBusinessDay(day)) day = addDays(day, 1);
  return day;
}

function anniversary(day: string, years: number) {
  const date = new Date(day);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

function custodyStart(settledOn: string, asOf: string, symbol: string, maturity: string) {
  if (!symbol.includes("COM-JUROS-SEMESTRAIS:")) return settledOn;
  // Coupon payments collect the custody accrued through that payment date.
  const month = Number(maturity.slice(5, 7));
  const months = [month, ((month + 5) % 12) + 1];
  const year = Number(asOf.slice(0, 4));
  const coupons = [year - 1, year].flatMap(y => months.map(m => {
    let day = `${y}-${String(m).padStart(2, "0")}-${maturity.slice(8, 10)}`;
    while (!isBusinessDay(day)) day = addDays(day, 1);
    return day;
  }));
  return [settledOn, ...coupons.filter(day => day >= settledOn && day <= asOf)].sort().at(-1)!;
}

export function treasuryRedemptionRows(movements: Movement[], asOf: string, price: number | null, symbol: string, maturity: string | null, selicStockBrl?: number | null) {
  const entries = movements.filter(entry => entry.occurredOn <= asOf);
  const completeLots = entries.every(entry => !entry.transferId && (entry.kind === "INCOME" || (entry.kind === "CONTRIBUTION" && entry.quantity > 0 && entry.amountBrl > 0)));
  const renda = /^TD:TESOURO-RENDA(?:-|:)/.test(symbol);
  const educa = /^TD:TESOURO-EDUCA(?:-|:)/.test(symbol);
  const selic = symbol.startsWith("TD:TESOURO-SELIC:");
  const installments = renda ? 20 : educa ? 5 : 0;
  const conversionYear = maturity ? Number(maturity.slice(0, 4)) - installments + 1 : null;
  const canEstimate = completeLots && maturity !== null && asOf < maturity &&
    (!installments || (conversionYear !== null && asOf < `${conversionYear}-01-01`));
  const stock = selicStockBrl === undefined && price !== null
    ? entries.reduce((total, entry) => total + (entry.kind === "CONTRIBUTION" ? entry.quantity * price : 0), 0)
    : selicStockBrl;

  return entries.filter(entry => entry.kind === "CONTRIBUTION" && entry.quantity > 0 && entry.amountBrl > 0).map(entry => {
    const days = Math.round((Date.parse(asOf) - Date.parse(entry.occurredOn)) / DAY_MS);
    const settledOn = settlementDay(entry.occurredOn);
    const settledDays = Math.max(0, Math.round((Date.parse(asOf) - Date.parse(settledOn)) / DAY_MS));
    const gross = canEstimate && price !== null && Number.isFinite(price) && price > 0 ? new Prisma.Decimal(entry.quantity).mul(price).toDecimalPlaces(2) : null;
    const taxes = gross && (!(renda || educa) || settledDays >= 60) ?
      brazilianNetValue(gross, new Prisma.Decimal(entry.amountBrl), new Date(entry.occurredOn), new Date(asOf)) : null;
    const firstBand = renda ? 10 : 7;
    const secondBand = renda ? 20 : 14;
    const custodyRate = renda || educa
      ? (asOf < anniversary(settledOn, firstBand) ? 0.5 : asOf < anniversary(settledOn, secondBand) ? 0.2 : 0.1)
      : 0.2;
    const feeStart = maturity ? custodyStart(settledOn, asOf, symbol, maturity) : settledOn;
    const custodyDays = Math.max(0, Math.round((Date.parse(asOf) - Date.parse(feeStart)) / DAY_MS));
    // Estimated from the marked balance. Selic's CPF-wide exemption is shared across all recorded holdings.
    const taxableShare = selic ? (stock == null || !Number.isFinite(stock) || stock <= 0 ? null : Math.max(0, stock - 10_000) / stock) : 1;
    const custody = taxes && gross && taxableShare !== null
      ? gross.mul(taxableShare).mul(custodyRate).mul(custodyDays).div(36500).toDecimalPlaces(2) : null;
    const contracted = / Treasury (IPCA|IGPM|Selic|Fixed) (-?\d+(?:\.\d+)?)% p\.a\.(?=\s|$)/.exec(entry.note ?? "");
    const accumulated = gross ? gross.div(entry.amountBrl).minus(1).mul(100).toNumber() : null;
    return {
      id: entry.id, day: entry.occurredOn, quantity: entry.quantity, invested: entry.amountBrl,
      price: entry.unitPriceBrl ?? entry.amountBrl / entry.quantity,
      contracted: contracted ? { indexer: contracted[1], rate: Number(contracted[2]) } : null,
      days, gross: gross?.toNumber() ?? null, accumulated,
      annualized: gross && days > 0 ? (Math.pow(gross.div(entry.amountBrl).toNumber(), 365 / days) - 1) * 100 : null,
      taxRate: brazilianIncomeTaxRate(days), ir: taxes?.ir.toNumber() ?? null,
      iof: taxes?.iof.toNumber() ?? null, custody: custody?.toNumber() ?? null,
      net: custody !== null && taxes ? taxes.net.minus(custody).toDecimalPlaces(2).toNumber() : null,
    };
  });
}
