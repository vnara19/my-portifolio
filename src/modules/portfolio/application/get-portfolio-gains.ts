import { historicalClosingValues } from "./historical-closing-values";
import { recordedTradeAmounts, recordedTradeFeeBrl } from "../domain/purchase-cost";
import { datedFx } from "../domain/position-money";
import type { GainIssue } from "../domain/portfolio-gains";
import { Prisma } from "@/generated/prisma/client";
import { readInternationalBond } from "../domain/international-bond";
import { readFixedIncomeContract } from "@/modules/portfolio/domain/brazilian-fixed-income";
import { getUserDb } from "@/lib/user-db";
import { portfolioGains, unavailableGains } from "@/modules/portfolio/domain/portfolio-gains";
import { convertBrl } from "@/modules/portfolio/domain/reporting-currency";

/** Read only the selected user's ledger, including closed holdings, through the selected month. */
export async function getPortfolioGains(referenceDate: Date, currentUsdRate: number | null, currency: "USD" | "EUR" = "USD") {
  const db = await getUserDb();
  if (!db) return { ...unavailableGains(), byAsset: [], realizedHistory: [] as {day:string;value:number}[] };
  const end = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1));
  const [transactions, positions, rates, bondAssets] = await Promise.all([
    db.positionTransaction.findMany({
      where: { occurredOn: { lt: end }, position: { portfolioMonth: { referenceDate: { lte: referenceDate } } } },
      orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { kind: true, createdAt: true, occurredOn: true, quantity: true, unitPriceBrl: true, amountBrl: true, transferId: true, note: true, position: { select: { accountId: true, assetId: true } } },
    }),
    db.position.findMany({ where: { portfolioMonth: { referenceDate }, quantity: { gt: 0 } }, select: { accountId: true, assetId: true, quantity: true, totalBrl: true, asset: { select: { fixedIncomeContract: true, quoteSymbol: true } } } }),
    db.dailyQuote.findMany({ where: { symbol: currency, quoteDate: { lt: end } }, orderBy: { quoteDate: "asc" }, select: { quoteDate: true, valueBrl: true } }),
    db.asset.findMany({ where: { assetType: "international-bond" }, select: { id: true, fixedIncomeContract: true } }),
  ]);
  const closingValues = await historicalClosingValues(referenceDate, positions.flatMap(p=>p.asset.quoteSymbol?[p.asset.quoteSymbol]:[]));
  for (const position of positions) {
    const close = position.asset.quoteSymbol ? closingValues.get(position.asset.quoteSymbol) : undefined;
    if (close !== undefined) position.totalBrl = position.quantity.mul(close);
  }
  const dailyRates=rates.map(r=>({day:r.quoteDate.toISOString().slice(0,10),rate:r.valueBrl.toNumber()}));
  const holding = (row: { accountId: string; assetId: string }) => `${row.accountId}:${row.assetId}`;
  const bonds = new Map(bondAssets.map((asset) => [asset.id, readInternationalBond(asset.fixedIncomeContract)]));
  const interest = new Map<string, { remaining: Prisma.Decimal; usdPerNative: Prisma.Decimal; units: Prisma.Decimal }>();
  // A savings payout is available before same-day withdrawal instructions.
  transactions.sort((a,b) => +a.occurredOn - +b.occurredOn || Number(b.note === "Savings automatic return") - Number(a.note === "Savings automatic return") || +a.createdAt - +b.createdAt);
  const movements = transactions.map((row) => {
    const key = holding(row.position);
    const exact = recordedTradeAmounts(row);
    const usdRate = datedFx(row.occurredOn.toISOString().slice(0,10),row.note,currency,dailyRates,new Map())?.rate ?? null;
    const movement = { holding: key, kind: row.kind, quantity: row.quantity.toNumber(), amountBrl: /^Net withdrawal: BRL (\d+(?:\.\d+)?);/.test(row.note ?? "") ? Number(/^Net withdrawal: BRL (\d+(?:\.\d+)?);/.exec(row.note!)![1]) : (exact?.amountBrl ?? row.amountBrl).toNumber(), usdRate, transferId: row.transferId, feeBrl: exact?.feeBrl.toNumber() ?? recordedTradeFeeBrl(row.note), costRecoveryUsd: 0 };
    const bond = bonds.get(row.position.assetId);
    if (!bond || !usdRate) return movement;
    let state = interest.get(key);
    if (!state && (row.kind === "CONTRIBUTION" || row.kind === "OPENING")) {
      state = { remaining: new Prisma.Decimal(bond.accruedInterestPaid), usdPerNative: row.amountBrl.div(usdRate).div(bond.totalPaid), units: new Prisma.Decimal(0) };
      interest.set(key, state);
    }
    if (!state) return movement;
    if (row.kind === "CONTRIBUTION" || row.kind === "OPENING") state.units = state.units.plus(row.quantity);
    if (row.kind === "WITHDRAWAL" && state.units.gt(0)) {
      state.remaining = state.remaining.mul(Prisma.Decimal.max(0, new Prisma.Decimal(1).minus(row.quantity.div(state.units))));
      state.units = state.units.minus(row.quantity);
    }
    const coupon = /^Bond coupon: (USD|EUR) (\d+(?:\.\d+)?);/.exec(row.note ?? "");
    if (row.kind === "INCOME" && row.quantity.eq(0) && coupon && coupon[1] === bond.currency && state.remaining.gt(0)) {
      const recovered = Prisma.Decimal.min(state.remaining, new Prisma.Decimal(coupon[2]));
      movement.costRecoveryUsd = recovered.mul(state.usdPerNative).toNumber();
      state.remaining = state.remaining.minus(recovered);
    }
    return movement;
  });
  let issue:GainIssue|undefined;
  const snapshots=positions.map((row) => ({ holding: holding(row), quantity: readFixedIncomeContract(row.asset?.fixedIncomeContract) && !row.asset.quoteSymbol ? transactions.filter((entry) => holding(entry.position) === holding(row)).reduce((sum, entry) => sum + (entry.kind === "WITHDRAWAL" ? -1 : 1) * entry.quantity.toNumber(), 0) : row.quantity.toNumber(), valueUsd: convertBrl(row.totalBrl.toNumber(), currentUsdRate) }));
  const realizedHistory: {day:string;value:number}[]=[];
  const gains=portfolioGains(movements, snapshots,reason=>{issue=reason;},(index,value)=>realizedHistory.push({day:transactions[index].occurredOn.toISOString().slice(0,10),value}));
  const byAsset=[...new Set([...positions.map(p=>p.assetId),...transactions.map(t=>t.position.assetId)])].map(assetId=>{
    const keys=new Set([...positions.filter(p=>p.assetId===assetId).map(holding),...transactions.filter(t=>t.position.assetId===assetId).map(t=>holding(t.position))]);
    const entries=movements.filter(m=>keys.has(m.holding));
    const principal=entries.filter(m=>m.kind==="CONTRIBUTION"||m.kind==="OPENING").reduce((sum,m)=>sum+(m.usdRate?(m.amountBrl-(m.feeBrl??0))/m.usdRate:0),0);
    return {assetId, sold:!positions.some(p=>p.assetId===assetId), principal, ...portfolioGains(movements.filter(m=>keys.has(m.holding)),snapshots.filter(p=>keys.has(p.holding)))};
  });
  return {...gains,...(issue?{issue}: {}),byAsset,realizedHistory:issue?[]:realizedHistory};
}
