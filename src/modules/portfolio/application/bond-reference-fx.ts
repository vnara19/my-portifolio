import { getUserDb } from '@/lib/user-db';
import { fetchReferenceFxLatest } from '@/modules/quotes/infrastructure/frankfurter';

/** Reuse dated daily FX observations; never substitute today's FX for an old purchase. */
export async function bondReferenceFx(currency: 'USD' | 'EUR', day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  const db = await getUserDb();
  const saved = await db?.dailyQuote.findFirst({
    where: { symbol: currency, instrumentType: 'FIAT', baseCurrency: currency, valueBrl: { gt: 0 }, quoteDate: { lte: date, gte: new Date(date.getTime() - 7 * 86400000) } },
    orderBy: { quoteDate: 'desc' }, select: { quoteDate: true, valueBrl: true },
  });
  if (saved) return { day: saved.quoteDate.toISOString().slice(0, 10), value: saved.valueBrl.toNumber() };
  const point = await fetchReferenceFxLatest(currency, day);
  if (date.getTime() - Date.parse(point.day) > 7 * 86400000) throw new Error('No recent dated exchange rate is available.');
  return point;
}
