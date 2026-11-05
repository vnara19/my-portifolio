import { MATURITY_EXIT_NOTE } from "./maturity-exits";
import { bondPurchaseRemovalIssue } from "../domain/bond-purchase-correction";
import { correctedBondPurchase } from "../domain/bond-purchase-correction";
import { withUndo, MonthEditError } from "./month-editing";
import { Prisma } from "@/generated/prisma/client";
import { getUserDb, currentUserId } from "@/lib/user-db";
import { bondValue, readInternationalBond } from "../domain/international-bond";
import { readMonthQuoteValues } from "@/modules/quotes/application/month-quote-values";
import { fetchReferenceFxLatest } from "@/modules/quotes/infrastructure/frankfurter";
import { calendarDay, lastDayOf, toDateKey, currentReferenceMonth } from "@/modules/quotes/domain/calendar";

export async function refreshBondsForUser() {
  const db = await getUserDb();
  if (!db) return false;
  const positions = await db.position.findMany({ where: { portfolioMonth: { referenceDate: currentReferenceMonth(), status: "DRAFT" }, asset: { assetType: "international-bond" }, quantity: { gt: 0 } }, select: { id: true, portfolioMonthId: true, asset: { select: { fixedIncomeContract: true } } } });
  if (!positions.length) return false;
  const today = toDateKey(calendarDay(new Date()));
  const monthQuotes = await readMonthQuoteValues(db, currentReferenceMonth(), ["USD", "EUR"]);
  let changed = false;
  const userId = await currentUserId();
  for (const monthId of new Set(positions.map((p) => p.portfolioMonthId))) await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${"portfolio-edits"}))`;
    const current = await tx.position.findMany({ where: { portfolioMonthId: monthId, portfolioMonth: { status: "DRAFT" }, asset: { assetType: "international-bond" }, quantity: { gt: 0 } }, include: { asset: true } });
    for (const row of current) {
      const bond = readInternationalBond(row.asset.fixedIncomeContract);
      const rate = bond ? monthQuotes.get(bond.currency)?.valueBrl : null;
      if (!bond || !rate) continue;
      const result = bondValue(bond, today, rate.toString(), row.quantity.toString());
      if (!row.totalBrl.eq(result.totalBrl) || !row.unitPriceBrl?.eq(result.unitPriceBrl)) {
        await tx.position.update({ where: { id: row.id }, data: { unitPriceBrl: result.unitPriceBrl, totalBrl: result.totalBrl, exchangeRateBrl: rate } });
        changed = true;
      }
    }
  }, { maxWait: 10_000, timeout: 60_000 });
  return changed;
}

/** Correct the acquisition and its contract together; never edit a bond as a generic trade. */
export async function correctBondPurchase(input: { monthId: string; transactionId: string; date: string; units: string; totalPaid: string; accruedPerBond: string }) {
  const db = await getUserDb();
  const initial = await db?.positionTransaction.findFirst({ where: { id: input.transactionId, kind: "CONTRIBUTION", position: { portfolioMonthId: input.monthId } }, select: { position: { select: { asset: { select: { fixedIncomeContract: true } } } } } });
  const terms = readInternationalBond(initial?.position.asset.fixedIncomeContract);
  if (!terms?.faceValuePerBond) throw new MonthEditError("This is not a supported bond purchase.");
  if (input.date.slice(0,7) !== terms.settlementDate.slice(0,7)) throw new MonthEditError("Keep the corrected purchase in its original reporting month.");
  if (input.date > toDateKey(calendarDay(new Date()))) throw new MonthEditError("The purchase cannot be in the future.");
  const fx = await fetchReferenceFxLatest(terms.currency, input.date);
  return withUndo(input.monthId, async tx => {
    const entry = await tx.positionTransaction.findFirst({ where: { id: input.transactionId, kind: "CONTRIBUTION", position: { portfolioMonthId: input.monthId } }, include: { position: { include: { asset: true } } } });
    const bond = readInternationalBond(entry?.position.asset.fixedIncomeContract);
    if (!entry || !bond?.faceValuePerBond || bond.settlementDate !== terms.settlementDate || bond.totalPaid !== terms.totalPaid || bond.faceAmount !== terms.faceAmount) throw new MonthEditError("The purchase changed. Refresh and try again.");
    const updated = correctedBondPurchase(bond, input);
    const rows = await tx.position.findMany({ where: { assetId: entry.position.assetId }, include: { portfolioMonth: true } });
    await tx.asset.update({ where: { id: entry.position.assetId }, data: { fixedIncomeContract: updated, appliedOn: new Date(input.date) } });
    const recordedFx = /FX (\d+(?:\.\d+)?) BRL\/(USD|EUR)\./.exec(entry.note ?? "");
    const rate = new Prisma.Decimal(input.date === bond.settlementDate && recordedFx?.[2] === bond.currency ? recordedFx[1] : fx.value);
    await tx.positionTransaction.update({ where: { id: entry.id }, data: { occurredOn: new Date(input.date), quantity: updated.faceAmount, amountBrl: new Prisma.Decimal(input.totalPaid).mul(rate).toDecimalPlaces(2), unitPriceBrl: new Prisma.Decimal(input.totalPaid).mul(rate).div(updated.faceAmount).toDecimalPlaces(8), note: `Bond acquisition: ${bond.currency} ${input.totalPaid} total paid including accrued interest and fees; FX ${rate.toString()} BRL/${bond.currency}.` } });
    for (const row of rows) {
      const day = toDateKey(new Date(Math.min(calendarDay(new Date()).getTime(), lastDayOf(row.portfolioMonth.referenceDate).getTime())));
      if (day < input.date) throw new MonthEditError("A holding precedes the corrected purchase date.");
      const rowRate = row.exchangeRateBrl;
      if (!rowRate?.gt(0)) throw new MonthEditError("A historical bond exchange rate is missing.");
      const redeemed = new Prisma.Decimal(bond.faceAmount).sub(row.quantity);
      const held = new Prisma.Decimal(updated.faceAmount).sub(redeemed);
      if (held.lt(0)) throw new MonthEditError("The corrected quantity is below the amount already redeemed.");
      const value = bondValue(updated, day, rowRate.toString(), held.toFixed());
      await tx.position.update({ where: { id: row.id }, data: { quantity: held, openingQuantity: row.id === entry.positionId ? row.openingQuantity : row.openingQuantity.add(new Prisma.Decimal(updated.faceAmount).sub(bond.faceAmount)), totalBrl: value.totalBrl, unitPriceBrl: value.unitPriceBrl } });
    }
    return { assets: [{ ...entry.position.asset, fixedIncomeContract: bond, expectedFixedIncomeContract: updated }] };
  }, { linkedMonths: true });
}

/** Remove one acquisition lot across reporting months; retain the asset and undo snapshots. */
export async function removeBondPurchase(input: { monthId: string; transactionId: string }) {
  return withUndo(input.monthId, async (tx, month) => {
    const purchase = await tx.positionTransaction.findFirst({ where: { id: input.transactionId, position: { portfolioMonthId: month.id } }, include: { position: { include: { asset: true } } } });
    const bond = readInternationalBond(purchase?.position.asset.fixedIncomeContract);
    if (!purchase || !bond || purchase.kind !== "CONTRIBUTION" || toDateKey(purchase.occurredOn) !== bond.settlementDate) throw new MonthEditError("This transaction is not the original bond purchase.");
    const holdings = await tx.position.findMany({ where: { assetId: purchase.position.assetId, accountId: purchase.position.accountId }, select: { id: true } });
    const ids = holdings.map(row => row.id);
    const movements = await tx.positionTransaction.findMany({ where: { positionId: { in: ids } }, select: { id: true, kind: true, note: true, transferId: true } });
    const issue = bondPurchaseRemovalIssue(movements, purchase.id, MATURITY_EXIT_NOTE);
    if (issue) throw new MonthEditError(issue);
    await tx.position.deleteMany({ where: { id: { in: ids } } });
  }, { linkedMonths: true });
}
