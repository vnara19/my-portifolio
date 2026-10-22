import { withUndo, MonthEditError } from "./month-editing";
import { Prisma } from "@/generated/prisma/client";
import { getUserDb, currentUserId, SCOPED_USER } from "@/lib/user-db";
import { internationalBondSchema, bondValue, readInternationalBond, type InternationalBond } from "../domain/international-bond";
import { readMonthQuoteValues } from "@/modules/quotes/application/month-quote-values";
import { fetchReferenceFxLatest } from "@/modules/quotes/infrastructure/frankfurter";
import { calendarDay, lastDayOf, toDateKey, currentReferenceMonth } from "@/modules/quotes/domain/calendar";

/** Quotes and actual cash receipts are private. Editing shares the portfolio month lock. */
export async function updateBond(input: { monthId: string; positionId: string; date: string; marketValue: string; source: string; coupon?: string; redeemedFace?: string; principalReceived?: string }) {
  const db = await getUserDb();
  if (!db) throw new MonthEditError("The database is unavailable.");
  const owned = await db.position.findFirst({ where: { id: input.positionId, portfolioMonthId: input.monthId }, select: { asset: { select: { fixedIncomeContract: true } }, portfolioMonth: { select: { referenceDate: true } } } });
  const original = readInternationalBond(owned?.asset.fixedIncomeContract);
  if (!original) throw new MonthEditError("This position is not an international bond.");
  if (input.date < original.settlementDate || input.date > toDateKey(calendarDay(new Date()))) throw new MonthEditError("Enter a valuation date between settlement and today.");
  const valuationDay = toDateKey(new Date(Math.min(calendarDay(new Date()).getTime(), lastDayOf(owned!.portfolioMonth.referenceDate).getTime())));
  const [fx, couponFx, usd] = await Promise.all([fetchReferenceFxLatest(original.currency, valuationDay), fetchReferenceFxLatest(original.currency, input.date), fetchReferenceFxLatest("USD", input.date)]);
  return withUndo(input.monthId, async (tx) => {
    const position = await tx.position.findFirst({ where: { id: input.positionId, portfolioMonthId: input.monthId }, include: { asset: true, portfolioMonth: true } });
    const bond = readInternationalBond(position?.asset.fixedIncomeContract);
    if (!position || !bond || position.portfolioMonth.status !== "DRAFT" || position.quantity.lte(0)) throw new MonthEditError("Choose an active bond in an open reporting month.");
    const end = toDateKey(new Date(Math.min(calendarDay(new Date()).getTime(), lastDayOf(position.portfolioMonth.referenceDate).getTime())));
    if (input.date < bond.settlementDate || input.date > end) throw new MonthEditError("The valuation date must follow settlement and cannot exceed the reporting date.");
    if ((input.coupon || input.redeemedFace) && input.date < toDateKey(position.portfolioMonth.referenceDate)) throw new MonthEditError("Record coupon receipts in their actual reporting month.");
    if ((input.coupon || input.redeemedFace) && bond.quotes.some((q) => q.date > input.date)) throw new MonthEditError("Cash receipts must include a valuation no earlier than the latest saved valuation.");
    const currentQuotes = await readMonthQuoteValues(tx, position.portfolioMonth.referenceDate, [bond.currency]);
    const currentFx = currentQuotes.get(bond.currency)?.valueBrl ?? new Prisma.Decimal(fx.value);
    if (input.coupon || input.redeemedFace) await tx.dailyQuote.createMany({ data: [{ symbol: "USD", quoteDate: new Date(usd.day), instrumentType: "FIAT", baseCurrency: "USD", valueBrl: usd.value, provider: "frankfurter-ecb", fetchedAt: new Date() }], skipDuplicates: true });
    const storedUsd = input.coupon || input.redeemedFace ? await tx.dailyQuote.findFirst({ where: { symbol: "USD", quoteDate: { lte: new Date(input.date), gte: new Date(usd.day) } }, orderBy: { quoteDate: "desc" }, select: { valueBrl: true } }) : null;
    const cashFx = bond.currency === "USD" && storedUsd ? storedUsd.valueBrl : new Prisma.Decimal(couponFx.value);
    let faceHeld = position.quantity;
    if (input.redeemedFace) {
      const face = new Prisma.Decimal(input.redeemedFace);
      if (!input.principalReceived || face.gt(faceHeld)) throw new MonthEditError("The redeemed face amount exceeds this holding.");
      const duplicate = await tx.positionTransaction.findFirst({ where: { occurredOn: new Date(input.date), kind: "WITHDRAWAL", note: { startsWith: "Bond principal:" }, position: { assetId: position.assetId, accountId: position.accountId } } });
      if (duplicate) throw new MonthEditError("A principal repayment is already recorded for this holding on that date.");
      faceHeld = faceHeld.minus(face);
      if (faceHeld.eq(0) && new Prisma.Decimal(input.marketValue).gt(0)) throw new MonthEditError("Enter zero market value after full redemption.");
      await tx.positionTransaction.create({ data: { userId: SCOPED_USER, positionId: position.id, kind: "WITHDRAWAL", occurredOn: new Date(input.date), quantity: face, amountBrl: new Prisma.Decimal(input.principalReceived).mul(cashFx).toDecimalPlaces(2), note: `Bond principal: ${bond.currency} ${input.principalReceived}; face redeemed ${input.redeemedFace}.` } });
    }
    const updated: InternationalBond = { ...bond, quotes: [...bond.quotes.filter((q) => q.date !== input.date), { date: input.date, marketValue: input.marketValue, source: input.source }] };
    internationalBondSchema.parse(updated);
    // The supplied full valuation is after any coupon received on this date.
    if (input.coupon) {
      const duplicate = await tx.positionTransaction.findFirst({ where: { occurredOn: new Date(input.date), kind: "INCOME", note: { startsWith: "Bond coupon:" }, position: { assetId: position.assetId, accountId: position.accountId } } });
      if (duplicate) throw new MonthEditError("A coupon receipt is already recorded for this holding on that date.");
      await tx.positionTransaction.create({ data: { userId: SCOPED_USER, positionId: position.id, kind: "INCOME", occurredOn: new Date(input.date), quantity: 0, amountBrl: new Prisma.Decimal(input.coupon).mul(cashFx).toDecimalPlaces(2), note: `Bond coupon: ${bond.currency} ${input.coupon}; FX ${cashFx.toString()} BRL/${bond.currency}.` } });
    }
    const result = bondValue(updated, end, currentFx.toString(), faceHeld.toString());
    await tx.asset.update({ where: { id: position.assetId }, data: { fixedIncomeContract: updated } });
    await tx.position.update({ where: { id: position.id }, data: { quantity: faceHeld, unitPriceBrl: result.unitPriceBrl, totalBrl: result.totalBrl, exchangeRateBrl: currentFx } });
    return { assets: [{ ...position.asset, fixedIncomeContract: bond, expectedFixedIncomeContract: updated }] };
  });
}

/** A daily FX refresh does not invent a new native market quotation. */
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
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${monthId}))`;
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
