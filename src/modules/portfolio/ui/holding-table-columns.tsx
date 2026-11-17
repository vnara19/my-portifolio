import type { MonthPosition } from '../application/get-month-positions';
import type { HoldingAnalytics } from '../application/get-holdings-analytics';
import { formatCurrency } from '../presentation/portfolio-format';
export type HoldingView='position'|'price'|'performance'|'risk';
export type HoldingColumn={id:string;label:string;format:'money'|'percent'|'number'|'text';get:(p:MonthPosition,m:HoldingAnalytics|undefined)=>number|string|null;description?:string};
const metric=(id:string,label:string,field:keyof HoldingAnalytics,format:HoldingColumn['format']='money',description?:string):HoldingColumn=>({id,label,format,get:(_p,m)=>typeof m?.[field]==='number'||typeof m?.[field]==='string'?m[field] as number|string:null,description});
export const POSITION_COLUMNS:HoldingColumn[]=[
 metric('exchange','Exchange','exchange','text'),
 {id:'share',label:'Allocation',format:'percent',get:p=>p.share},
 {id:'quantity',label:'Quantity',format:'number',get:p=>p.securityQuantity===null?null:Number(p.securityQuantity)},
 metric('average','Average Price','average'),
 {id:'last',label:'Last Price',format:'money',get:(p,m)=>p.bondAtCost?null:p.liquidated?m?.last??null:p.unitPriceNative??null},
 metric('invested','Invested','invested'),
 {id:'totalBrl',label:'Value',format:'money',get:p=>p.nativeValue},
 metric('unrealized','Unrealized Gain (USD)','unrealized'),metric('unrealizedPercent','Unrealized Gain %','unrealizedPercent','percent'),
 metric('daily','Daily Gain','daily'),metric('dailyPercent','Daily Gain %','dailyPercent','percent'),
 metric('totalGain','Total Gain (USD)','totalGain'),metric('totalPercent','Total Gain %','totalPercent','percent','Time-weighted return from your recorded investments; external flows excluded.'),metric('annualized','Annualized Yield','annualized','percent','XIRR from dated investments and redemptions.'),
 {id:'maturityDate',label:'Maturity Date',format:'text',get:p=>p.maturityDate},
];
export const DEFAULT_POSITION_COLUMNS=['share','quantity','totalBrl','unrealized','unrealizedPercent','daily','dailyPercent'];
export const VIEW_COLUMNS:Record<HoldingView,HoldingColumn[]>={
 position:POSITION_COLUMNS,
 price:[{id:'last',label:'Last Price',format:'money',get:(p,m)=>p.bondAtCost?null:p.liquidated?m?.last??null:p.unitPriceNative??null},metric('changePercent','Price Change %','changePercent','percent'),metric('change','Price Change','change'),metric('volume','Volume','volume','number'),metric('averageVolume','Average Volume (10 Days)','averageVolume','number'),metric('marketCap','Market Capitalization','marketCap','money')],
 performance:[['1w','1 Week'],['1m','1 Month'],['3m','3 Months'],['ytd','Year to Date'],['1y','1 Year'],['5y','5 Years'],['all','All Time']].map(([key,label])=>({id:`perf-${key}`,label,format:'percent',get:(_p,m)=>m?.performance[key]??null})),
 risk:[...[1,3,5].map(y=>({id:`beta-${y}`,label:`Beta (${y} ${y===1?"Year":"Years"})`,format:'number' as const,get:(_p:MonthPosition,m:HoldingAnalytics|undefined)=>m?.beta[String(y)]??null,description:`${y} years of completed monthly returns against S&P 500 in the same currency.`})),...[['1d','1 Day'],['1w','1 Week'],['1m','1 Month']].map(([key,label])=>({id:`vol-${key}`,label:`Volatility ${label}`,format:'percent' as const,get:(_p:MonthPosition,m:HoldingAnalytics|undefined)=>m?.volatility[key]??null,description:key==='1d'?'Daily true range divided by the low.':'Average daily high–low range divided by the low, over this period.'}))],
};
export function holdingMetricDescription(column: HoldingColumn, position: MonthPosition, value: number | string | null, analytics?: HoldingAnalytics) {
 if (["daily", "dailyPercent"].includes(column.id) && analytics?.dailyDate) {
  return `Gross accrual on ${new Intl.DateTimeFormat("en-GB", {timeZone:"UTC"}).format(new Date(analytics.dailyDate))}.`;
 }
 if (value === null && position.bondAtCost && ["daily", "dailyPercent", "last", "change", "changePercent", "volume", "averageVolume", "marketCap", "exchange"].includes(column.id)) {
  return "This bond is held at cost and has no market quote.";
 }
 if (value === null && position.fixedIncomeBasis && !position.quoteSymbol && ["daily", "dailyPercent"].includes(column.id)) {
  return "The latest daily accrual could not be reconciled with the recorded balance.";
 }
 if (value === null && position.fixedIncomeBasis && !position.quoteSymbol && (column.id.startsWith("perf-") || column.id.startsWith("vol-") || column.id.startsWith("beta-") || ["last", "change", "changePercent", "volume", "averageVolume", "marketCap", "exchange"].includes(column.id))) {
  return "This instrument accrues at its contracted rate and has no market price series.";
 }
 if (value === null && column.id.startsWith("perf-")) return "Price history is insufficient for this period.";
 if (value === null && column.id.startsWith("vol-")) return "Insufficient pricing observations for this period.";
 if (value === null && ["volume", "averageVolume"].includes(column.id) && !position.quoteSymbol?.startsWith("TD:")) {
  return "The quote source does not provide enough volume observations.";
 }
 const treasury = position.quoteSymbol?.startsWith("TD:");
 if (treasury && column.id.startsWith("vol-")) {
  return column.id === "vol-1d" ? "Absolute change between the last two published redemption prices."
   : "Average absolute change between consecutive published redemption prices over this period.";
 }
 if (treasury && ["volume", "averageVolume", "marketCap"].includes(column.id)) {
  return "Tesouro Direto price history does not provide this exchange-trading metric.";
 }
 if (value === null && column.id === "marketCap" && /^(ETF|ETC|ETN)$/.test(position.productType ?? "")) {
  return "Market capitalization is unavailable for this listing. Fund net assets are a separate metric.";
 }
 if (value === null) {
  if (column.id === "maturityDate") return "No maturity date is recorded for this asset.";
  if (column.id === "exchange") return "The source did not identify a listing exchange.";
  if (column.id === "quantity") return "No security quantity is recorded for this position.";
  if (column.id === "marketCap") return "The source does not provide market capitalization for this valuation date.";
  if (["last", "change", "changePercent", "daily", "dailyPercent"].includes(column.id)) return "Comparable valuation or price observations are unavailable.";
  if (["average", "invested", "unrealized", "unrealizedPercent", "totalGain"].includes(column.id)) return "The recorded cost or valuation could not be established for this metric.";
 }
 if (column.description) return column.description;
 if (["volume", "averageVolume", "marketCap"].includes(column.id) && typeof value === "number") {
  return value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
 }
}
export function holdingCellText(column:HoldingColumn,p:MonthPosition,m:HoldingAnalytics|undefined){const value=holdingDisplayValue(column,p,m);if(value===null)return '—';if(typeof value==='string'){if(column.id==='maturityDate')return new Intl.DateTimeFormat('en-GB',{timeZone:'UTC'}).format(new Date(value));return value;}if(column.id==='marketCap'&&Math.abs(value)>=1000)return `${p.valueCurrency} ${compactHoldingNumber(value)}`;if(column.format==='money')return formatCurrency(value,column.id==='unrealized'||column.id==='totalGain'?'USD':p.valueCurrency,['unrealized','daily','totalGain','change'].includes(column.id));if(['volume','averageVolume'].includes(column.id)&&Math.abs(value)>=10000)return compactHoldingNumber(value);if(column.format==='percent')return `${value>0&&column.id!=='share'&&!column.id.startsWith('vol-')?'+':''}${value.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}%`;return (Math.abs(value)<0.005&&column.id.startsWith('beta-')?0:value).toLocaleString('en-GB',{minimumFractionDigits:column.id.startsWith('beta-')?2:0,maximumFractionDigits:column.id==='quantity'?8:2});}

/** Compact only display text; numeric values remain unchanged for sorting and calculations. */
export function compactHoldingNumber(value:number){return new Intl.NumberFormat('en-US',{notation:'compact',compactDisplay:'short',maximumFractionDigits:2}).format(value);}

export function holdingDisplayValue(column: HoldingColumn, position: MonthPosition, analytics?: HoldingAnalytics) {
 const value = column.get(position, analytics);
 return typeof value === "number" && (column.id === "unrealized" || column.id === "unrealizedPercent")
  && Math.abs(value) < 0.005 ? 0 : value;
}
