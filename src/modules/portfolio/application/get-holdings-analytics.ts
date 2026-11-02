import { fetchCoinGeckoMarketCap, resolveCoinGeckoCoin } from "@/modules/quotes/infrastructure/coingecko";
import { fetchYahooHoldingHistory } from '@/modules/quotes/infrastructure/yahoo';
import { portfolioGains } from '../domain/portfolio-gains';
import { timeWeightedReturns, type TwrObservation } from '../domain/time-weighted-return';
import { xirr } from '../domain/overview-performance-metrics';
import { holdingMarketMetrics, type HoldingMarketMetrics, type MarketPoint } from '../domain/holding-market-metrics';
import { getMonthPositions, type MonthPositions } from './get-month-positions';
import type { PortfolioLedger } from './get-portfolio-ledger';
export type HoldingAnalytics=HoldingMarketMetrics&{invested:number|null;average:number|null;unrealized:number|null;unrealizedPercent:number|null;daily:number|null;dailyPercent:number|null;totalGain:number|null;totalPercent:number|null;annualized:number|null};
const capCache=new Map<string,{until:number;value:Promise<number|null>}>();
function cryptoCap(symbol:string,currency:"USD"|"EUR"|"BRL"){const key=`${symbol}:${currency}`,cached=capCache.get(key);if(cached&&cached.until>Date.now())return cached.value;const value=resolveCoinGeckoCoin(symbol).then(coin=>coin?fetchCoinGeckoMarketCap(coin.id,currency):null).catch(()=>null);if(capCache.size>100)capCache.delete(capCache.keys().next().value!);capCache.set(key,{until:Date.now()+300000,value});return value;}
type Listing=Awaited<ReturnType<typeof fetchYahooHoldingHistory>>;
const cache=new Map<string,{until:number;value:Promise<Listing|null>}>();
function listing(symbol:string){const cached=cache.get(symbol);if(cached&&cached.until>Date.now())return cached.value;const value=fetchYahooHoldingHistory(symbol).catch(()=>null);if(cache.size>100)cache.delete(cache.keys().next().value!);cache.set(symbol,{until:Date.now()+300000,value});return value;}
/** Read-only enrichment. Public requests contain listing symbols only, never balances or trades. */
export async function getHoldingsAnalytics(month:MonthPositions,ledger:PortfolioLedger|null){
 const asOf=month.referenceDay;
 const symbolFor=(p:MonthPositions["positions"][number])=>p.assetType==='crypto'?`${(p.ticker??p.quoteSymbol??'').replace(/(?:-?USD|-?EUR|-?BRL)$/,'')}-${p.valueCurrency}`:p.quoteSymbol;
 const positions=[...month.positions];
 if(ledger){
  const current=new Set(positions.map(p=>`${p.accountId}:${p.assetId}`));
  const groups=new Map<string,typeof ledger.originals>();
  for(const t of ledger.originals.filter(t=>t.occurredOn<=asOf)){const id=`${t.accountId}:${t.assetId}`;groups.set(id,[...(groups.get(id)??[]),t]);}
  const missing=[...groups].filter(([id,entries])=>!current.has(id)&&entries.some(t=>t.kind==='WITHDRAWAL')&&Math.abs(entries.reduce((q,t)=>q+(t.kind==='WITHDRAWAL'?-1:1)*t.quantity,0))<1e-8);
  const dates=[...new Set(missing.map(([,entries])=>entries.map(t=>t.month).sort().at(-1)!))];
  for(const date of dates){const old=await getMonthPositions(new Date(`${date}-01T00:00:00Z`));for(const [id] of missing){const p=old?.positions.find(p=>`${p.accountId}:${p.assetId}`===id);if(p&&!positions.some(row=>row.accountId===p.accountId&&row.assetId===p.assetId))positions.push({...p,historicalSold:true,liquidated:true,quantity:0,quantityText:'0',securityQuantity:p.securityQuantity===null?null:'0',nativeValue:0,totalBrl:0,totalUsd:0,share:0});}}
 }
 const symbols=[...new Set(positions.flatMap(p=>p.quoteSymbol?[symbolFor(p)!]:[]))];
 const results=new Map<string,Listing|null>();
 for(let i=0;i<symbols.length;i+=4){const batch=symbols.slice(i,i+4);await Promise.all(batch.map(async symbol=>results.set(symbol,await listing(symbol))));}
 const [benchmark,eurUsd,usdBrl]=await Promise.all([listing('^GSPC'),listing('EURUSD=X'),listing('BRL=X')]);
 const rateAt=(rows:MarketPoint[],day:string)=>{let lo=0,hi=rows.length-1,index=-1;while(lo<=hi){const mid=(lo+hi)>>>1;if(rows[mid].day<=day){index=mid;lo=mid+1;}else hi=mid-1;}const p=rows[index];return p&&Date.parse(day)-Date.parse(p.day)<=7*86400000?p.value:null;};
 const data:Record<string,HoldingAnalytics>={};
 for(const p of positions){
  const source=p.quoteSymbol?results.get(symbolFor(p)!):null;
  const history=source?.currency===p.valueCurrency?source.points.filter(point=>point.day<=asOf):[];
  // Reuse the app's current native quote, so price changes and held value share one terminal price.
  if(!p.liquidated&&p.unitPriceNative!=null&&history.length){const index=history.length-1;history[index]={...history[index],value:p.unitPriceNative};}
  const nativeBenchmark=(benchmark?.points??[]).flatMap(point=>{const u=rateAt(usdBrl?.points??[],point.day),e=rateAt(eurUsd?.points??[],point.day);const factor=p.valueCurrency==='USD'?1:p.valueCurrency==='BRL'?u:e?1/e:null;return factor?[{day:point.day,value:point.value*factor}]:[];});
  const market=holdingMarketMetrics(history,asOf,nativeBenchmark);
  if(!source?.allTimeAvailable)market.performance.all=null;
  market.exchange=source?.exchange??null;
  market.marketCap=month.isCurrent&&source?.currency===p.valueCurrency?source.marketCap??null:null;
  if(month.isCurrent&&p.assetType==='crypto'&&market.marketCap===null&&p.ticker)market.marketCap=await cryptoCap(p.ticker,p.valueCurrency);
  // Native cost and income use the same recorded transaction amounts as the existing asset pages.
  const entries=(ledger?.editEntries??[]).filter(t=>t.accountId===p.accountId&&t.assetId===p.assetId&&t.occurredOn<=asOf).sort((a,b)=>a.occurredOn.localeCompare(b.occurredOn));
  const valid=entries.length>0&&entries.every(t=>!t.moneyUnavailable&&!t.transferId);
  const gains=valid?portfolioGains(entries.map(t=>({holding:p.id,kind:t.kind,quantity:t.quantity,amountBrl:t.amountBrl,usdRate:1,transferId:t.transferId,feeBrl:t.kind==='CONTRIBUTION'?Number(/commission (?:USD|EUR|BRL) (\d+(?:\.\d+)?);/.exec(t.note??'')?.[1]??0):0})),p.liquidated?[]:[{holding:p.id,quantity:p.quantity,valueUsd:p.nativeValue}]):null;
  const invested=gains?.unrealizedUsd!=null&&p.nativeValue!==null?p.nativeValue-gains.unrealizedUsd:null;
  const lastDay=history.at(-1)?.day,previous=history.filter(t=>lastDay&&t.day<lastDay).at(-1);
  const same=entries.filter(t=>t.occurredOn===lastDay);
  const todayUnits=same.reduce((q,t)=>q+(t.kind==='WITHDRAWAL'?-t.quantity:t.quantity),0);
  const todayFlow=same.reduce((q,t)=>q+(t.kind==='WITHDRAWAL'?-t.amountBrl:t.kind==='INCOME'?0:t.amountBrl),0);
  const daily=valid&&gains?.unrealizedUsd!=null&&!p.liquidated&&previous&&p.nativeValue!==null?p.nativeValue-(p.quantity-todayUnits)*previous.value-todayFlow:null;
  const dailyBase=previous?(p.quantity-todayUnits)*previous.value+same.filter(t=>t.kind==='CONTRIBUTION').reduce((s,t)=>s+t.amountBrl,0):0;
  const flows=entries.filter(t=>t.kind!=='INCOME'||t.quantity===0).map(t=>({day:t.occurredOn,amount:t.kind==='WITHDRAWAL'||t.kind==='INCOME'?t.amountBrl:-t.amountBrl}));
  const observations:TwrObservation[]=[];let quantity=0,index=0;
  const days=[...new Set([...history.map(t=>t.day),...entries.map(t=>t.occurredOn)])].filter(day=>day>=entries[0]?.occurredOn&&day<=asOf).sort();
  for(const day of days){let inflow=0,outflow=0;while(index<entries.length&&entries[index].occurredOn<=day){const t=entries[index++];quantity+=(t.kind==='WITHDRAWAL'?-1:1)*t.quantity;if(t.kind==='CONTRIBUTION'||t.kind==='OPENING')inflow+=t.amountBrl;else if(t.kind==='WITHDRAWAL'||t.kind==='INCOME'&&t.quantity===0)outflow+=t.amountBrl;}const price=rateAt(history,day);observations.push({day,value:Math.abs(quantity)<1e-8?0:price===null?null:quantity*price,flow:inflow-outflow,inflow,outflow});}
  data[p.id]={...market,invested,average:invested!==null&&p.quantity>0?invested/p.quantity:null,unrealized:gains?.unrealizedUsd??null,unrealizedPercent:gains?.unrealizedPercent??null,daily,dailyPercent:daily!==null&&dailyBase>0?daily/dailyBase*100:null,totalGain:gains?.totalUsd??null,totalPercent:valid&&gains?.unrealizedUsd!=null&&history.length?timeWeightedReturns(observations).at(-1)?.percent??null:null,annualized:valid&&gains?.unrealizedUsd!=null&&p.nativeValue!==null?xirr([...flows,{day:asOf,amount:p.nativeValue}]):null};
 }
 return {positions,data};
}
