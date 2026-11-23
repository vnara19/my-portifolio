import { fixedIncomeDailyGain } from "../domain/fixed-income-daily-gain";
import { indexerOfSubclass } from "../domain/fixed-income-policy";
import { isAutomaticAccrualNote } from "@/lib/transaction-notes";
import { readTreasuryBook } from "@/modules/quotes/infrastructure/treasury";
import { unstable_cache } from "next/cache";
import { getUserDb } from "@/lib/user-db";
import { getPortfolioGains } from "./get-portfolio-gains";
import { fetchCoinGeckoMarketCap, resolveCoinGeckoCoin } from "@/modules/quotes/infrastructure/coingecko";
import { fetchYahooHoldingHistory } from '@/modules/quotes/infrastructure/yahoo';
import { portfolioGains } from '../domain/portfolio-gains';
import { timeWeightedReturns, type TwrObservation } from '../domain/time-weighted-return';
import { xirr } from '../domain/overview-performance-metrics';
import { allTimePriceChange, holdingMarketMetrics, type HoldingMarketMetrics, type MarketPoint } from '../domain/holding-market-metrics';
import { getMonthPositions, type MonthPositions } from './get-month-positions';
import type { PortfolioLedger } from './get-portfolio-ledger';
export type HoldingAnalytics=HoldingMarketMetrics&{invested:number|null;average:number|null;unrealized:number|null;unrealizedPercent:number|null;daily:number|null;dailyPercent:number|null;dailyDate?:string;totalGain:number|null;totalPercent:number|null;annualized:number|null};
const capCache=new Map<string,{until:number;value:Promise<number|null>}>();
function cryptoCap(symbol:string,currency:"USD"|"EUR"|"BRL"){const key=`${symbol}:${currency}`,cached=capCache.get(key);if(cached&&cached.until>Date.now())return cached.value;const value=resolveCoinGeckoCoin(symbol).then(coin=>coin?fetchCoinGeckoMarketCap(coin.id,currency):null).catch(()=>null);if(capCache.size>100)capCache.delete(capCache.keys().next().value!);capCache.set(key,{until:Date.now()+300000,value});return value;}
type Listing=Awaited<ReturnType<typeof fetchYahooHoldingHistory>>;
const cachedListing = unstable_cache(fetchYahooHoldingHistory, ["public-holding-history-v1"], { revalidate: 300 });
const cache=new Map<string,{until:number;value:Promise<Listing|null>}>();
function listing(symbol:string){
 const saved=cache.get(symbol);
 if(saved&&saved.until>Date.now())return saved.value;
 const value=(process.env.NEXT_RUNTIME ? cachedListing(symbol) : fetchYahooHoldingHistory(symbol)).catch(()=>null);
 if(cache.size>100)cache.delete(cache.keys().next().value!);
 cache.set(symbol,{until:Date.now()+300000,value});
 return value;
}

// Cache only public security origins, without portfolio identifiers or private balances.
async function loadTreasuryOrigins(): Promise<Record<string, MarketPoint>> {
 const book = await readTreasuryBook();
 return Object.fromEntries([...book.series.values()].flatMap(series => series.points[0] ? [[series.symbol, series.points[0]]] : []));
}
const cachedTreasuryOrigins = unstable_cache(loadTreasuryOrigins, ["public-treasury-origins-v1"], { revalidate: 3600 });
async function readTreasuryOrigins(): Promise<Record<string, MarketPoint> | null> {
 let timer: ReturnType<typeof setTimeout> | undefined;
 try {
  const load = process.env.NEXT_RUNTIME ? cachedTreasuryOrigins() : loadTreasuryOrigins();
  return await Promise.race([
   load.catch(() => null),
   new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 8_000); }),
  ]);
 } finally {
  clearTimeout(timer);
 }
}
/** Read-only enrichment. Public requests contain listing symbols only, never balances or trades. */
export async function getHoldingsAnalytics(month:MonthPositions,ledger:PortfolioLedger|null){
 const asOf=month.referenceDay;
 const reportingGains = getPortfolioGains(month.referenceDate, month.usdRate);
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
 const accrualPositions = positions.filter(p => p.autoIncome && p.fixedIncomeBasis && p.appliedOn &&
  p.incomeCalculatedThrough && !p.incomeCalculationError && !p.liquidated);
 const accrualRates = (async () => {
  if (!accrualPositions.length) return { rates: [], ipcaRates: [], verifiedCoverage: [] };
  const db = await getUserDb();
  if (!db) return { rates: [], ipcaRates: [], verifiedCoverage: [] };
  const earliest = accrualPositions.map(p => p.appliedOn!).sort()[0];
  const [rates, coverage] = await Promise.all([
   db.rateObservation.findMany({
    where: { indexer: { in: ["CDI", "IPCA"] }, date: { gte: new Date(earliest.slice(0, 7) + "-01"), lte: new Date(asOf) } },
    select: { indexer: true, date: true, dailyPercent: true },
   }),
   db.rateCoverage.findMany({ where: { indexer: "CDI" }, select: { fromDate: true, throughDate: true } }),
  ]);
  const key = (date: Date) => date.toISOString().slice(0, 10);
  const series = (indexer: string) => rates.filter(r => r.indexer === indexer)
   .map(r => ({ date: key(r.date), dailyPercent: r.dailyPercent.toString() }));
  return { rates: series("CDI"), ipcaRates: series("IPCA"),
   verifiedCoverage: coverage.map(w => ({ from: key(w.fromDate), through: key(w.throughDate) })) };
 })();
 const treasurySymbols = [...new Set(positions.flatMap(p =>
  p.quoteSymbol?.startsWith("TD:") ? [p.quoteSymbol] : [],
 ))];
 const treasuryOrigins = treasurySymbols.length ? readTreasuryOrigins() : null;
 const treasuryHistory = new Map<string, MarketPoint[]>();
 const db = treasurySymbols.length ? await getUserDb() : null;
 const treasuryFilter = { symbol: { in: treasurySymbols }, baseCurrency: "BRL", instrumentType: "TESOURO" };
 const [treasuryQuotes, latestTreasuryQuotes] = db ? await Promise.all([
  db.dailyQuote.findMany({
   where: { ...treasuryFilter, quoteDate: { lte: new Date(asOf) } },
   orderBy: { quoteDate: "asc" },
   select: { symbol: true, quoteDate: true, valueBrl: true },
  }),
  month.isCurrent ? db.marketQuote.findMany({
   where: { ...treasuryFilter, referenceDate: month.referenceDate, carriedFrom: null, quoteDate: { lte: new Date(asOf) } },
   select: { symbol: true, quoteDate: true, valueBrl: true },
  }) : [],
 ]) : [[], []];
 for (const quote of [...treasuryQuotes, ...latestTreasuryQuotes]) {
  const points = treasuryHistory.get(quote.symbol) ?? [];
  const value = quote.valueBrl.toNumber();
  if (!quote.quoteDate || value <= 0) continue;
  const day = quote.quoteDate.toISOString().slice(0, 10);
  const existing = points.findIndex(point => point.day === day);
  if (existing === -1) points.push({ day, value });
  else points[existing] = { day, value };
  treasuryHistory.set(quote.symbol, points);
 }
 for (const points of treasuryHistory.values()) points.sort((a, b) => a.day.localeCompare(b.day));
 const symbols=[...new Set(positions.flatMap(p=>p.quoteSymbol&&!p.quoteSymbol.startsWith("TD:")?[symbolFor(p)!]:[]))];
 const results=new Map<string,Listing|null>();
 const publicSymbols = [...new Set([...symbols, "^GSPC", "EURUSD=X", "BRL=X"])];
 for (let index = 0; index < publicSymbols.length; index += 4) {
  await Promise.all(publicSymbols.slice(index, index + 4).map(async symbol => {
   results.set(symbol, await listing(symbol));
  }));
 }
 const benchmark = results.get("^GSPC");
 const eurUsd = results.get("EURUSD=X");
 const usdBrl = results.get("BRL=X");
 const treasuryBook = await treasuryOrigins;
 const rateAt=(rows:MarketPoint[],day:string)=>{let lo=0,hi=rows.length-1,index=-1;while(lo<=hi){const mid=(lo+hi)>>>1;if(rows[mid].day<=day){index=mid;lo=mid+1;}else hi=mid-1;}const p=rows[index];return p&&Date.parse(day)-Date.parse(p.day)<=7*86400000?p.value:null;};
 const [{ byHolding }, accrualInputs] = await Promise.all([reportingGains, accrualRates]);
 const data:Record<string,HoldingAnalytics>={};
 for(const p of positions){
  const source=p.quoteSymbol?results.get(symbolFor(p)!):null;
  const treasury = p.quoteSymbol?.startsWith("TD:") ?? false;
  const history = treasury && p.valueCurrency === "BRL"
   ? treasuryHistory.get(p.quoteSymbol!) ?? []
   : source?.currency===p.valueCurrency?source.points.filter(point=>point.day<=asOf):[];
  // Reuse the app's current native quote, so price changes and held value share one terminal price.
  if(!treasury&&!p.liquidated&&p.unitPriceNative!=null&&history.length){const index=history.length-1;history[index]={...history[index],value:p.unitPriceNative};}
  const nativeBenchmark=(benchmark?.points??[]).flatMap(point=>{const u=rateAt(usdBrl?.points??[],point.day),e=rateAt(eurUsd?.points??[],point.day);const factor=p.valueCurrency==='USD'?1:p.valueCurrency==='BRL'?u:e?1/e:null;return factor?[{day:point.day,value:point.value*factor}]:[];});
  const market=holdingMarketMetrics(history,asOf,nativeBenchmark,treasury ? "close" : "range");
  if (treasury) {
   const firstQuote = treasuryBook?.[p.quoteSymbol!];
   market.performance.all = allTimePriceChange(firstQuote, history.at(-1), market.last);
  } else if (!source?.allTimeAvailable) {
   market.performance.all = null;
  }
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
  const treasuryDailyAvailable = !treasury || (
   market.last !== null && market.last === p.unitPriceNative &&
   lastDay !== undefined && entries.every(entry => entry.occurredOn <= lastDay) &&
   previous !== undefined && entries.every(entry => entry.occurredOn <= previous.day || entry.occurredOn === lastDay)
  );
  const todayUnits=same.reduce((q,t)=>q+(t.kind==='WITHDRAWAL'?-t.quantity:t.quantity),0);
  const todayFlow=same.reduce((q,t)=>q+(t.kind==='WITHDRAWAL'?-t.amountBrl:t.kind==='INCOME'?0:t.amountBrl),0);
  const daily=treasuryDailyAvailable&&valid&&gains?.unrealizedUsd!=null&&!p.liquidated&&previous&&p.nativeValue!==null?p.nativeValue-(p.quantity-todayUnits)*previous.value-todayFlow:null;
  const dailyBase=previous?(p.quantity-todayUnits)*previous.value+same.filter(t=>t.kind==='CONTRIBUTION').reduce((s,t)=>s+t.amountBrl,0):0;
  const flows=entries.filter(t=>t.kind!=='INCOME'||t.quantity===0).map(t=>({day:t.occurredOn,amount:t.kind==='WITHDRAWAL'||t.kind==='INCOME'?t.amountBrl:-t.amountBrl}));
  const observations:TwrObservation[]=[];let quantity=0,index=0;
  const days=[...new Set([...history.map(t=>t.day),...entries.map(t=>t.occurredOn)])].filter(day=>day>=entries[0]?.occurredOn&&day<=asOf).sort();
  for(const day of days){let inflow=0,outflow=0;while(index<entries.length&&entries[index].occurredOn<=day){const t=entries[index++];quantity+=(t.kind==='WITHDRAWAL'?-1:1)*t.quantity;if(t.kind==='CONTRIBUTION'||t.kind==='OPENING')inflow+=t.amountBrl;else if(t.kind==='WITHDRAWAL'||t.kind==='INCOME'&&t.quantity===0)outflow+=t.amountBrl;}const price=rateAt(history,day);observations.push({day,value:Math.abs(quantity)<1e-8?0:price===null?null:quantity*price,flow:inflow-outflow,inflow,outflow});}
  const accrualEntries = entries.filter(t => !t.automatic && !isAutomaticAccrualNote(t.note));
  const parts = p.allocations.flatMap(a => {
   const indexer = indexerOfSubclass(a.subclass);
   return indexer && a.ratePercent != null ? [{ indexer, weight: String(a.weight), ratePercent: String(a.ratePercent) }] : [];
  });
  const accrual = accrualPositions.includes(p) && p.valueCurrency === "BRL" && p.nativeValue !== null &&
   accrualEntries.length > 0 && accrualEntries.every(t => !t.moneyUnavailable && !t.transferId) &&
   parts.length === p.allocations.length
   ? fixedIncomeDailyGain({
    ...accrualInputs, startDate: p.appliedOn!, maturityDate: p.maturityDate, annualBasis: p.fixedIncomeBasis, parts,
    movements: accrualEntries.map(t => ({ date: t.occurredOn, kind: t.kind, amount: String(t.amountBrl) })),
   }, p.incomeCalculatedThrough!, asOf, p.nativeValue)
   : null;
  const units = Number(p.securityQuantity ?? p.quantity);
  const reporting = byHolding.get(`${p.accountId}:${p.assetId}`);
  data[p.id]={...market,invested,average:invested!==null&&units>0&&p.securityQuantity!==null?invested/units:null,unrealized:reporting?.unrealizedUsd??null,unrealizedPercent:reporting?.unrealizedPercent??null,daily:accrual?.amount??daily,dailyPercent:accrual?.percent??(daily!==null&&dailyBase>0?daily/dailyBase*100:null),dailyDate:accrual?.amount!=null?p.incomeCalculatedThrough!:undefined,totalGain:reporting?.totalUsd??null,totalPercent:valid&&gains?.unrealizedUsd!=null&&history.length?timeWeightedReturns(observations).at(-1)?.percent??null:null,annualized:valid&&gains?.unrealizedUsd!=null&&p.nativeValue!==null?xirr([...flows,{day:asOf,amount:p.nativeValue}]):null};
 }
 return {positions,data};
}
