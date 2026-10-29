import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { BACKUP_FORMAT, BACKUP_TABLES, BACKUP_VERSION, type BackupFile } from "@/modules/backup/domain/backup-format";
import { monthsBetween } from "@/modules/quotes/domain/history-backfill";
import { purchaseCost, purchaseNote } from "./purchase-cost";
export type ImportedTrade={symbol:string;side:"Buy"|"Sell";quantity:string;price:string;commission:string;day:string;sourceTime:string;row:number};
export type ImportListing={source:string;symbol:string;ticker:string;name:string;currency:"EUR"|"USD";kind:"crypto"|"eu-market";instrument:string;assetClass:string;subclass:string};
export type ImportMarket={prices:Record<string,{day:string;value:number}[]>;fx:Record<"USD"|"EUR",{day:string;value:number}[]>};
/** RFC4180 quoting, strict known columns, decimals kept as source strings. No deduplication of legitimate equal trades. */
export function parseTradeCsv(csv:string){
 const rows:string[][]=[];let row:string[]=[],field="",quoted=false;
 for(let i=0;i<csv.length;i++){const c=csv[i];if(c==='"'){if(quoted&&csv[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field="";}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field="";}else field+=c;}
 if(quoted)throw new Error("Unclosed CSV quote");if(field||row.length){row.push(field);rows.push(row);}
 if(rows.shift()?.map(s=>s.replace(/^\uFEFF/,"")).join("|")!=="Symbol|Side|Qty|Fill Price|Commission|Closing Time")throw new Error("Unsupported CSV columns");
 let cashRows=0;const trades:ImportedTrade[]=[];
 rows.forEach((r,index)=>{
  if(r.length!==6)throw new Error(`Invalid CSV row ${index+2}`);
  if(r[0]==="$CASH"){if(!["Deposit","Withdrawal"].includes(r[1]))throw new Error("Unknown cash operation");cashRows++;return;}
  if(r[1]!=="Buy"&&r[1]!=="Sell")throw new Error(`Unsupported trade side at row ${index+2}`);
  for(const v of [r[2],r[3],r[4]||"0"])if(!/^\d+(?:\.\d+)?$/.test(v))throw new Error(`Invalid decimal at row ${index+2}`);
  const day=r[5].slice(0,10);if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r[5])||new Date(day).toISOString().slice(0,10)!==day)throw new Error(`Invalid date at row ${index+2}`);
  if(new Prisma.Decimal(r[2]).lte(0)||new Prisma.Decimal(r[3]).lte(0))throw new Error("Trade quantity and price must be positive");
  trades.push({symbol:r[0],side:r[1],quantity:r[2],price:r[3],commission:r[4]||"0",day,sourceTime:r[5],row:index+2});
 });
 return {trades:trades.sort((a,b)=>a.sourceTime.localeCompare(b.sourceTime)||a.row-b.row),cashRows};
}
export function marketPoint(points:{day:string;value:number}[],day:string){
 const p=[...points].reverse().find(p=>p.day<=day&&Date.parse(day)-Date.parse(p.day)<=7*86400000);
 if(!p||!(p.value>0))throw new Error(`Missing dated market observation for ${day}`);return p;
}
/** A complete replacement file is built and validated before any database write. */
export function compileTradeImport(trades:ImportedTrade[],listings:ImportListing[],market:ImportMarket,asOf:string):BackupFile{
 if(!trades.length||trades.some(t=>t.day>asOf))throw new Error("Empty import or future transactions");
 const tables=Object.fromEntries(BACKUP_TABLES.map(t=>[t.key,[]])) as unknown as BackupFile["tables"];
 const stamp=new Date().toISOString();const date=(day:string)=>`${day}T00:00:00.000Z`;
 const institution=randomUUID(),account=randomUUID();
 tables.institutions.push({id:institution,name:"Portfolio",normalizedName:"portfolio",createdAt:stamp});
 tables.accounts.push({id:account,institutionId:institution,name:"Main",createdAt:stamp});
 const assetIds=new Map<string,string>();
 const used=listings.filter(l=>trades.some(t=>t.symbol===l.source));
 if(used.length!==new Set(trades.map(t=>t.symbol)).size)throw new Error("Every source ticker needs a verified listing and currency");
 for(const l of used){const id=randomUUID();assetIds.set(l.source,id);tables.assets.push({id,normalizedKey:`${l.kind}|${l.symbol}`,name:l.name,ticker:l.ticker,quoteSymbol:l.symbol,baseCurrency:l.kind==="crypto"?"BTC":l.currency,assetType:l.kind,maturityDate:null,liquidity:l.kind==="crypto"?"Same Day":"D+1",cashAccount:false,autoIncome:false,createdAt:stamp});}
 const after=new Date(`${asOf.slice(0,7)}-01`);after.setUTCMonth(after.getUTCMonth()+1);
 const months=monthsBetween(trades[0].day.slice(0,7),after.toISOString().slice(0,7));
 const quantity=new Map<string,Prisma.Decimal>();
 for(const month of months){
  const monthId=randomUUID(),monthDate=date(`${month}-01`);tables.portfolioMonths.push({id:monthId,referenceDate:monthDate,status:"REVIEWED",createdAt:stamp});
  const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
  const day=end<asOf?end:asOf;
  for(const currency of ["USD","EUR"] as const){const fx=marketPoint(market.fx[currency],day);tables.marketQuotes.push({id:randomUUID(),referenceDate:monthDate,symbol:currency,instrumentType:"FIAT",baseCurrency:currency,valueBrl:String(fx.value),quoteDate:date(fx.day),carriedFrom:null,createdAt:stamp});}
  for(const l of used){
   const own=trades.filter(t=>t.symbol===l.source&&t.day.slice(0,7)===month);
   const opening=quantity.get(l.source)??new Prisma.Decimal(0);let closing=opening;
   for(const t of own){closing=closing.plus(new Prisma.Decimal(t.quantity).mul(t.side==="Sell"?-1:1));if(closing.lt(0))throw new Error(`Sale exceeds held units: ${l.ticker}`);}
   quantity.set(l.source,closing);if(closing.eq(0)&&!own.length)continue;
   const close=marketPoint(market.prices[l.symbol]??[],day);const fx=marketPoint(market.fx[l.currency],day);
   const priceBrl=new Prisma.Decimal(close.value).mul(fx.value).toDecimalPlaces(8);
   tables.marketQuotes.push({id:randomUUID(),referenceDate:monthDate,symbol:l.symbol,instrumentType:l.instrument,baseCurrency:l.currency,valueBrl:priceBrl.toString(),quoteDate:date(close.day),carriedFrom:null,createdAt:stamp});
   const positionId=randomUUID();tables.positions.push({id:positionId,portfolioMonthId:monthId,accountId:account,assetId:assetIds.get(l.source)!,quantity:closing.toString(),openingQuantity:opening.toString(),unitPriceBrl:priceBrl.toString(),exchangeRateBrl:String(fx.value),totalBrl:closing.mul(priceBrl).toDecimalPlaces(2).toString(),strategy:null,createdAt:stamp,updatedAt:stamp});
   tables.positionAllocations.push({id:randomUUID(),positionId,assetClass:l.assetClass,subclass:l.subclass,duration:"-",weight:"1",createdAt:stamp,updatedAt:stamp});
   for(const trade of own){const fx=marketPoint(market.fx[l.currency],trade.day);const cost=purchaseCost(trade.quantity,trade.price,trade.commission,fx.value,trade.side==="Sell"?"SELL":"BUY");tables.positionTransactions.push({id:randomUUID(),positionId,kind:trade.side==="Sell"?"WITHDRAWAL":"CONTRIBUTION",occurredOn:date(trade.day),quantity:trade.quantity,unitPriceBrl:cost.unitPriceBrl.toString(),amountBrl:cost.amountBrl.toString(),note:purchaseNote({price:trade.price,commission:trade.commission,currency:l.currency,occurredOn:trade.day,side:trade.side==="Sell"?"SELL":"BUY"},trade.quantity,String(fx.value))+` Imported execution ${trade.sourceTime}; source row ${trade.row}.`,transferId:null,createdAt:stamp});}
  }
 }
 for(const currency of ["USD","EUR"] as const)for(const p of market.fx[currency].filter(p=>p.day>=trades[0].day&&p.day<=asOf))tables.dailyQuotes.push({id:randomUUID(),symbol:currency,instrumentType:"FIAT",baseCurrency:currency,quoteDate:date(p.day),valueBrl:String(p.value),provider:"frankfurter-ecb",fetchedAt:stamp,createdAt:stamp});
 for(const l of used)for(const p of (market.prices[l.symbol]??[]).filter(p=>p.day>=trades[0].day&&p.day<=asOf)){const fx=marketPoint(market.fx[l.currency],p.day);tables.dailyQuotes.push({id:randomUUID(),symbol:l.symbol,instrumentType:l.instrument,baseCurrency:l.currency,quoteDate:date(p.day),valueBrl:new Prisma.Decimal(p.value).mul(fx.value).toDecimalPlaces(8).toString(),provider:"yahoo",fetchedAt:stamp,createdAt:stamp});}
 return {format:BACKUP_FORMAT,version:BACKUP_VERSION,exportedAt:stamp,tables};
}
