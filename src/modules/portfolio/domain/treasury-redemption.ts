import { Prisma } from "@/generated/prisma/browser";
import { brazilianNetValue, brazilianIncomeTaxRate } from "./brazilian-net-value";

const DAY_MS = 86_400_000;

type Movement = {
  id: string; transferId?: string | null; occurredOn: string; kind: string; quantity: number;
  amountBrl: number; unitPriceBrl: number | null; note: string | null;
};

export function treasuryRedemptionRows(movements: Movement[], asOf: string, price: number | null, symbol: string, maturity: string | null) {
  const entries = movements.filter(entry => entry.occurredOn <= asOf);
  const completeLots = entries.every(entry => !entry.transferId && entry.kind === "CONTRIBUTION" && entry.quantity > 0 && entry.amountBrl > 0);
  const renda = symbol.startsWith("TD:TESOURO-RENDA-");
  const educa = symbol.startsWith("TD:TESOURO-EDUCA-");
  const installments = renda ? 20 : educa ? 5 : 0;
  const conversionYear = maturity ? Number(maturity.slice(0, 4)) - installments + 1 : null;
  const canEstimate = completeLots && maturity !== null && asOf < maturity &&
    (!installments || (conversionYear !== null && asOf < `${conversionYear}-01-01`));

  return entries.filter(entry => entry.kind === "CONTRIBUTION" && entry.quantity > 0 && entry.amountBrl > 0).map(entry => {
    const days = Math.round((Date.parse(asOf) - Date.parse(entry.occurredOn)) / DAY_MS);
    const gross = canEstimate && price !== null ? new Prisma.Decimal(entry.quantity).mul(price).toDecimalPlaces(2) : null;
    const taxes = gross && (!(renda || educa) || days >= 60) ?
      brazilianNetValue(gross, new Prisma.Decimal(entry.amountBrl), new Date(entry.occurredOn), new Date(asOf)) : null;
    const years = days / 365;
    // Indicative early-sale custody based on the marked value. The exchange's actual balance is private.
    const custodyRate = renda ? (years <= 10 ? 0.5 : years <= 20 ? 0.2 : 0.1) : null;
    const custody = taxes && gross && custodyRate !== null ? gross.mul(custodyRate).mul(days).div(36500).toDecimalPlaces(2) : null;
    const contracted = / Treasury (IPCA|IGPM|Selic|Fixed) (-?\d+(?:\.\d+)?)% p\.a\.$/.exec(entry.note ?? "");
    const accumulated = gross ? gross.div(entry.amountBrl).minus(1).mul(100).toNumber() : null;
    return {
      id: entry.id, day: entry.occurredOn, quantity: entry.quantity, invested: entry.amountBrl,
      price: entry.unitPriceBrl ?? entry.amountBrl / entry.quantity,
      contracted: contracted ? { indexer: contracted[1], rate: Number(contracted[2]) } : null,
      days, gross: gross?.toNumber() ?? null, accumulated,
      annualized: gross && days > 0 ? (Math.pow(gross.div(entry.amountBrl).toNumber(), 365 / days) - 1) * 100 : null,
      taxRate: taxes ? brazilianIncomeTaxRate(days) : null, ir: taxes?.ir.toNumber() ?? null,
      iof: taxes?.iof.toNumber() ?? null, custody: custody?.toNumber() ?? null,
      netBeforeInstitution: custody && taxes ? taxes.net.minus(custody).toNumber() : null,
    };
  });
}
