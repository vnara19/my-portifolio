import { getUserDb } from "@/lib/user-db";
/** One shared historical FX read; no client-supplied identity or provider requests. */
export async function getOverviewFx(){
 const db=await getUserDb();
 if(!db)return [];
 const rates=await db.dailyQuote.findMany({where:{symbol:{in:["USD","EUR"]}},orderBy:{quoteDate:"asc"},select:{symbol:true,quoteDate:true,valueBrl:true}});
 const dollars=rates.filter(r=>r.symbol==="USD");
 return rates.filter(r=>r.symbol==="EUR").flatMap(e=>{
  const u=dollars.filter(u=>u.quoteDate<=e.quoteDate).at(-1);
  return u&&+e.quoteDate-+u.quoteDate<=7*86400000&&u.valueBrl.gt(0)?[{day:e.quoteDate.toISOString().slice(0,10),value:e.valueBrl.div(u.valueBrl).toNumber()}]:[];
 });
}
