import { getUserDb } from "@/lib/user-db";
import { datedFx } from "../domain/position-money";

/** Read confirmed closes for completed months, retaining observed-price FX before conversion. */
export async function historicalClosingValues(referenceDate: Date, symbols: string[]) {
  const end = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth()+1, 0));
  const day = end.toISOString().slice(0,10);
  const result = new Map<string, number>();
  if (day >= new Date().toISOString().slice(0,10)) return result;
  const db = await getUserDb();
  if (!db || !symbols.length) return result;
  const quotes = await db.dailyQuote.findMany({where:{symbol:{in:[...new Set([...symbols,"USD","EUR"])]},quoteDate:{gte:new Date(end.getTime()-14*86400000),lte:end}},orderBy:{quoteDate:"asc"},select:{symbol:true,quoteDate:true,valueBrl:true,baseCurrency:true}});
  const rates = (currency:string) => quotes.filter(q=>q.symbol===currency).map(q=>({day:q.quoteDate.toISOString().slice(0,10),rate:q.valueBrl.toNumber()}));
  for (const symbol of symbols) {
    const quote = quotes.filter(q=>q.symbol===symbol).at(-1);
    if (!quote || end.getTime()-quote.quoteDate.getTime()>7*86400000) continue;
    const native = quote.baseCurrency;
    if (native!=="BRL" && native!=="USD" && native!=="EUR") continue;
    const fx = rates(native);
    const observed = datedFx(quote.quoteDate.toISOString().slice(0,10),null,native,fx,new Map());
    const closing = datedFx(day,null,native,fx,new Map());
    if (observed && closing) result.set(symbol,quote.valueBrl.toNumber()/observed.rate*closing.rate);
  }
  return result;
}
