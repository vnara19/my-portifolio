import { Prisma } from "@/generated/prisma/client";
import { currentUserId, getUserDb, SCOPED_USER } from "@/lib/user-db";
import { calendarDay, lastDayOf, toDateKey } from "@/modules/quotes/domain/calendar";
import { valueCdiPositions } from "./cdi-positions";

export const MATURITY_EXIT_NOTE = "Maturity exit at recorded value; no cash balance or tax settlement";

/** Close tracked exposure, not a bank redemption. Keep both history and the external outflow. */
export async function applyMaturityExits(now = new Date()) {
  const db = await getUserDb();
  if (!db) return;
  const today = calendarDay(now);
  const due = await db.position.findMany({ where: { quantity: { gt: 0 }, asset: { maturityDate: { lte: today } } }, select: { asset: { select: { maturityDate: true } }, portfolioMonth: { select: { referenceDate: true } } } });
  if (!due.some((row) => row.asset.maturityDate! <= lastDayOf(row.portfolioMonth.referenceDate))) return;
  const userId = await currentUserId();
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${"portfolio-edits"}))`;
    const rows = await tx.position.findMany({
      where: { quantity: { gt: 0 }, asset: { maturityDate: { lte: today } } },
      include: { asset: true, portfolioMonth: true },
      orderBy: [{ portfolioMonth: { referenceDate: "asc" } }, { id: "asc" }],
    });
    for (const row of rows) {
      const maturity = row.asset.maturityDate!;
      if (maturity > lastDayOf(row.portfolioMonth.referenceDate)) continue;
      const prior = await tx.positionTransaction.findFirst({ where: { note: MATURITY_EXIT_NOTE, position: { assetId: row.assetId, accountId: row.accountId } }, select: { id: true } });
      if (!prior) {
        await valueCdiPositions(tx, { where: { id: row.id }, asOf: toDateKey(maturity) });
        const current = await tx.position.findUniqueOrThrow({ where: { id: row.id } });
        const ledger = await tx.positionTransaction.findMany({ where: { occurredOn: { lte: maturity }, position: { assetId: row.assetId, accountId: row.accountId } }, select: { kind: true, quantity: true, amountBrl: true } });
        const first = await tx.position.findFirst({ where: { assetId: row.assetId, accountId: row.accountId }, orderBy: { portfolioMonth: { referenceDate: "asc" } }, select: { openingQuantity: true } });
        const units = ledger.reduce((sum, item) => sum.plus(item.kind === "WITHDRAWAL" || item.amountBrl.lt(0) ? item.quantity.neg() : item.quantity), first?.openingQuantity ?? new Prisma.Decimal(0));
        if (units.gt(0)) await tx.positionTransaction.create({ data: { userId: SCOPED_USER, positionId: row.id, kind: "WITHDRAWAL", occurredOn: maturity, quantity: units, amountBrl: current.totalBrl, unitPriceBrl: row.asset.quoteSymbol ? current.totalBrl.div(units).toDecimalPlaces(8) : null, note: MATURITY_EXIT_NOTE } });
      }
      await tx.position.update({ where: { id: row.id }, data: { quantity: 0, totalBrl: 0, calculatedIncomeBrl: 0, calculationStartDate: null, incomeCalculatedThrough: null } });
    }
  }, { maxWait: 10_000, timeout: 60_000 });
}
