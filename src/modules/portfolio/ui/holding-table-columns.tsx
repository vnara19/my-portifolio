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
 {id:'last',label:'Last Price',format:'money',get:p=>p.unitPriceNative??null},
 metric('invested','Invested','invested'),
 {id:'totalBrl',label:'Value',format:'money',get:p=>p.nativeValue},
 metric('unrealized','Unrealized Gain','unrealized'),metric('unrealizedPercent','Unrealized Gain %','unrealizedPercent','percent'),
 metric('daily','Daily Gain','daily'),metric('dailyPercent','Daily Gain %','dailyPercent','percent'),
 metric('totalGain','Total Gain','totalGain'),metric('totalPercent','Total Gain %','totalPercent','percent','Time-weighted return from your recorded investments; external flows excluded.'),metric('annualized','Annualized Yield','annualized','percent','XIRR from dated investments and redemptions.'),
 {id:'maturityDate',label:'Maturity Date',format:'text',get:p=>p.maturityDate},
];
export const DEFAULT_POSITION_COLUMNS=['share','quantity','totalBrl','unrealized','unrealizedPercent','daily','dailyPercent'];
export const VIEW_COLUMNS:Record<HoldingView,HoldingColumn[]>={
 position:POSITION_COLUMNS,
 price:[{id:'last',label:'Last Price',format:'money',get:p=>p.unitPriceNative??null},metric('changePercent','Price Change %','changePercent','percent'),metric('change','Price Change','change'),metric('volume','Volume','volume','number'),metric('averageVolume','Average Volume (10 Days)','averageVolume','number'),metric('marketCap','Market Capitalization','marketCap','money')],
 performance:[['1w','1 Week'],['1m','1 Month'],['3m','3 Months'],['ytd','Year to Date'],['1y','1 Year'],['5y','5 Years'],['all','All Time']].map(([key,label])=>({id:`perf-${key}`,label,format:'percent',get:(_p,m)=>m?.performance[key]??null,description:'Market price performance in the listing currency, independent of your purchases.'})),
 risk:[...[1,3,5].map(y=>({id:`beta-${y}`,label:`Beta (${y} ${y===1?"Year":"Years"})`,format:'number' as const,get:(_p:MonthPosition,m:HoldingAnalytics|undefined)=>m?.beta[String(y)]??null,description:`${y} years of completed monthly returns against S&P 500 in the same currency.`})),...[['1d','1 Day'],['1w','1 Week'],['1m','1 Month']].map(([key,label])=>({id:`vol-${key}`,label:`Volatility ${label}`,format:'percent' as const,get:(_p:MonthPosition,m:HoldingAnalytics|undefined)=>m?.volatility[key]??null,description:key==='1d'?'Daily true range divided by the low.':'Average daily high–low range divided by the low, over this period.'}))],
};
export function holdingCellText(column:HoldingColumn,p:MonthPosition,m:HoldingAnalytics|undefined){const value=column.get(p,m);if(value===null)return '—';if(typeof value==='string'){if(column.id==='maturityDate')return new Intl.DateTimeFormat('en-GB',{timeZone:'UTC'}).format(new Date(value));return value;}if(column.format==='money')return formatCurrency(value,p.valueCurrency,['unrealized','daily','totalGain','change'].includes(column.id));if(column.format==='percent')return `${value>0&&column.id!=='share'?'+':''}${value.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}%`;return value.toLocaleString('en-GB',{maximumFractionDigits:column.id==='quantity'?8:2});}
