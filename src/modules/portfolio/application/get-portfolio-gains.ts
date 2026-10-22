import { Prisma } from "@/generated/prisma/client";
import { readInternationalBond } from "../domain/international-bond";
import { readFixedIncomeContract } from "@/modules/portfolio/domain/brazilian-fixed-income";
import { getUserDb } from "@/lib/user-db";
import { portfolioGains, unavailableGains } from "@/modules/portfolio/domain/portfolio-gains";
import { convertBrl } from "@/modules/portfolio/domain/reporting-currency";

/** Read only the selected user's ledger, including closed holdings, through the selected month. */
export async function getPortfolioGains(referenceDate: Date, currentUsdRate: number | null) {
  const db = await getUserDb();
  if (!db) return unavailableGains();
  const end = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1));
  const [transactions, positions, rates, bondAssets] = await Promise.all([
    db.positionTransaction.findMany({
      where: { occurredOn: { lt: end }, position: { portfolioMonth: { referenceDate: { lte: referenceDate } } } },
      orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { kind: true, occurredOn: true, quantity: true, amountBrl: true, transferId: true, note: true, position: { select: { accountId: true, assetId: true } } },
    }),
    db.position.findMany({ where: { portfolioMonth: { referenceDate }, quantity: { gt: 0 } }, select: { accountId: true, assetId: true, quantity: true, totalBrl: true, asset: { select: { fixedIncomeContract: true, quoteSymbol: true } } } }),
    db.dailyQuote.findMany({ where: { symbol: "USD", quoteDate: { lt: end } }, orderBy: { quoteDate: "asc" }, select: { quoteDate: true, valueBrl: true } }),
    db.asset.findMany({ where: { assetType: "international-bond" }, select: { id: true, fixedIncomeContract: true } }),
  ]);
  const historicalRate = (date: Date) => {
    // Weekend/holiday trades may use the previous published business-day observation.
    const rate = rates.findLast((entry) => entry.quoteDate <= date);
    return rate && date.getTime() - rate.quoteDate.getTime() <= 7 * 86400000 ? rate.valueBrl.toNumber() : null;
  };
  const holding = (row: { accountId: string; assetId: string }) => `${row.accountId}:${row.assetId}`;
  const bonds = new Map(bondAssets.map((asset) => [asset.id, readInternationalBond(asset.fixedIncomeContract)]));
  const interest = new Map<string, { remaining: Prisma.Decimal; usdPerNative: Prisma.Decimal; units: Prisma.Decimal }>();
  const movements = transactions.map((row) => {
    const key = holding(row.position);
    const usdRate = historicalRate(row.occurredOn);
    const movement = { holding: key, kind: row.kind, quantity: row.quantity.toNumber(), amountBrl: row.amountBrl.toNumber(), usdRate, transferId: row.transferId, costRecoveryUsd: 0 };
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
  return portfolioGains(movements, positions.map((row) => ({ holding: holding(row), quantity: readFixedIncomeContract(row.asset?.fixedIncomeContract) && !row.asset.quoteSymbol ? transactions.filter((entry) => holding(entry.position) === holding(row)).reduce((sum, entry) => sum + (entry.kind === "WITHDRAWAL" ? -1 : 1) * entry.quantity.toNumber(), 0) : row.quantity.toNumber(), valueUsd: convertBrl(row.totalBrl.toNumber(), currentUsdRate) })));
}
