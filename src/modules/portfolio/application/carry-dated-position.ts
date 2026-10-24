import { Prisma } from "@/generated/prisma/client";
import { SCOPED_USER } from "@/lib/user-db";
import { bondCostState, bondValue, readInternationalBond } from "../domain/international-bond";
import { tradeBalance } from "../domain/trade-balance";
import { valueCdiPositions } from "./cdi-positions";
import { readMonthQuoteValues } from "@/modules/quotes/application/month-quote-values";
import { addMonths, calendarDay, toDateKey, lastDayOf } from "@/modules/quotes/domain/calendar";

type State = { accountId: string; assetId: string; quantity: Prisma.Decimal; totalBrl: Prisma.Decimal; unitPriceBrl: Prisma.Decimal | null; exchangeRateBrl: Prisma.Decimal | null; strategy: string | null; calculationStartDate: Date | null; allocations: { assetClass: string; subclass: string; duration: string; weight: Prisma.Decimal; ratePercent: Prisma.Decimal | null }[] };

/** Carry only the quantity change. Existing later trades, prices and allocations are preserved. */
export async function carryDatedPositions(tx: Prisma.TransactionClient, month: { referenceDate: Date }, before: State[], after: State[]) {
  const key = (p: State) => `${p.accountId}:${p.assetId}`;
  const old = new Map(before.map((p) => [key(p), p])), next = new Map(after.map((p) => [key(p), p]));
  const sourceQuotes = await readMonthQuoteValues(tx, month.referenceDate);
  const months = await tx.portfolioMonth.findMany({ where: { referenceDate: { gt: month.referenceDate } }, orderBy: { referenceDate: "asc" }, select: { id: true, referenceDate: true } });
  for (const identity of new Set([...old.keys(), ...next.keys()])) {
    let previous = next.get(identity) ?? old.get(identity)!;
    let delta = (next.get(identity)?.quantity ?? new Prisma.Decimal(0)).sub(old.get(identity)?.quantity ?? 0);
    if (delta.isZero()) continue;
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: previous.assetId }, select: { name: true, quoteSymbol: true, baseCurrency: true, fixedIncomeContract: true, autoIncome: true } });
    for (const target of months) {
      const held = await tx.position.findFirst({ where: { portfolioMonthId: target.id, accountId: previous.accountId, assetId: previous.assetId }, include: { allocations: true, transactions: { orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }] } } });
      let quantity = (held?.quantity ?? new Prisma.Decimal(0)).add(delta);
      const openingQuantity = (held?.openingQuantity ?? new Prisma.Decimal(0)).add(delta);
      if (quantity.lt(0) || openingQuantity.lt(0)) throw new Error(`This dated change would leave a negative holding for ${asset.name} in ${toDateKey(target.referenceDate).slice(0, 7)}.`);
      if (held && asset.quoteSymbol) tradeBalance(openingQuantity, held.transactions.filter((t) => t.kind === "CONTRIBUTION" || t.kind === "WITHDRAWAL").map((t) => ({ date: t.occurredOn, quantity: t.quantity, sale: t.kind === "WITHDRAWAL" || t.amountBrl.lt(0) })));
      const quotes = await readMonthQuoteValues(tx, target.referenceDate);
      for (const currency of ["USD", "EUR"]) {
        const point = sourceQuotes.get(currency);
        if (point && !quotes.has(currency)) {
          await tx.manualQuote.createMany({ data: [{ userId: SCOPED_USER, referenceDate: target.referenceDate, symbol: currency, instrumentType: "FIAT", baseCurrency: currency, valueBrl: point.valueBrl }], skipDuplicates: true });
          quotes.set(currency, point);
        }
      }
      let unitPriceBrl = held?.unitPriceBrl ?? (asset.quoteSymbol ? quotes.get(asset.quoteSymbol)?.valueBrl : null) ?? previous.unitPriceBrl;
      if (asset.quoteSymbol && !quotes.has(asset.quoteSymbol) && unitPriceBrl) {
        // A previously observed price may be carried; never substitute a future quote.
        await tx.manualQuote.createMany({ data: [{ userId: SCOPED_USER, referenceDate: target.referenceDate, symbol: asset.quoteSymbol, instrumentType: "CARRIED", baseCurrency: asset.baseCurrency, valueBrl: unitPriceBrl }], skipDuplicates: true });
      }
      let totalBrl = asset.quoteSymbol && unitPriceBrl ? quantity.mul(unitPriceBrl).toDecimalPlaces(2) : quantity.toDecimalPlaces(2);
      const bond = readInternationalBond(asset.fixedIncomeContract);
      if (bond) {
        const asOf = toDateKey(new Date(Math.min(calendarDay(new Date()).getTime(), lastDayOf(target.referenceDate).getTime())));
        const fx = quotes.get(bond.currency)?.valueBrl ?? sourceQuotes.get(bond.currency)?.valueBrl;
        if (!fx) throw new Error(`The ${bond.currency} exchange rate is unavailable for ${toDateKey(target.referenceDate).slice(0, 7)}.`);
        if (bond.valuationMode === "Cost") quantity = bondCostState(bond, asOf).face;
        const value = bondValue(bond, asOf, fx.toString(), quantity.toString()); totalBrl = value.totalBrl; unitPriceBrl = value.unitPriceBrl;
      }
      const data = { quantity, openingQuantity, unitPriceBrl, totalBrl };
      const saved = held ? await tx.position.update({ where: { id: held.id }, data }) : await tx.position.create({ data: { ...data, userId: SCOPED_USER, portfolioMonthId: target.id, accountId: previous.accountId, assetId: previous.assetId, strategy: previous.strategy, exchangeRateBrl: previous.exchangeRateBrl, calculationStartDate: asset.autoIncome ? target.referenceDate : null } });
      if (!held && previous.allocations.length) await tx.positionAllocation.createMany({ data: previous.allocations.map(({ assetClass, subclass, duration, weight, ratePercent }) => ({ userId: SCOPED_USER, positionId: saved.id, assetClass, subclass, duration, weight, ratePercent })) });
      await valueCdiPositions(tx, { where: { id: saved.id }, asOf: toDateKey(new Date(Math.min(calendarDay(new Date()).getTime(), addMonths(target.referenceDate, 1).getTime()))) });
      const updated = await tx.position.findUniqueOrThrow({ where: { id: saved.id }, include: { allocations: true } });
      delta = updated.quantity.sub(held?.quantity ?? 0);
      previous = updated;
    }
  }
}
