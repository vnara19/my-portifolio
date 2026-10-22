import { readFixedIncomeContract } from "@/modules/portfolio/domain/brazilian-fixed-income";
import { getUserDb } from "@/lib/user-db";
import { portfolioGains, unavailableGains } from "@/modules/portfolio/domain/portfolio-gains";
import { convertBrl } from "@/modules/portfolio/domain/reporting-currency";

/** Read only the selected user's ledger, including closed holdings, through the selected month. */
export async function getPortfolioGains(referenceDate: Date, currentUsdRate: number | null) {
  const db = await getUserDb();
  if (!db) return unavailableGains();
  const end = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1));
  const [transactions, positions, rates] = await Promise.all([
    db.positionTransaction.findMany({
      where: { occurredOn: { lt: end }, position: { portfolioMonth: { referenceDate: { lte: referenceDate } } } },
      orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { kind: true, occurredOn: true, quantity: true, amountBrl: true, transferId: true, position: { select: { accountId: true, assetId: true } } },
    }),
    db.position.findMany({ where: { portfolioMonth: { referenceDate }, quantity: { gt: 0 } }, select: { accountId: true, assetId: true, quantity: true, totalBrl: true, asset: { select: { fixedIncomeContract: true, quoteSymbol: true } } } }),
    db.dailyQuote.findMany({ where: { symbol: "USD", quoteDate: { lt: end } }, orderBy: { quoteDate: "asc" }, select: { quoteDate: true, valueBrl: true } }),
  ]);
  const historicalRate = (date: Date) => {
    // Weekend/holiday trades may use the previous published business-day observation.
    const rate = rates.findLast((entry) => entry.quoteDate <= date);
    return rate && date.getTime() - rate.quoteDate.getTime() <= 7 * 86400000 ? rate.valueBrl.toNumber() : null;
  };
  const holding = (row: { accountId: string; assetId: string }) => `${row.accountId}:${row.assetId}`;
  return portfolioGains(transactions.map((row) => ({
    holding: holding(row.position), kind: row.kind, quantity: row.quantity.toNumber(), amountBrl: row.amountBrl.toNumber(), usdRate: historicalRate(row.occurredOn), transferId: row.transferId,
  })), positions.map((row) => ({ holding: holding(row), quantity: readFixedIncomeContract(row.asset?.fixedIncomeContract) && !row.asset.quoteSymbol ? transactions.filter((entry) => holding(entry.position) === holding(row)).reduce((sum, entry) => sum + (entry.kind === "WITHDRAWAL" ? -1 : 1) * entry.quantity.toNumber(), 0) : row.quantity.toNumber(), valueUsd: convertBrl(row.totalBrl.toNumber(), currentUsdRate) })));
}
