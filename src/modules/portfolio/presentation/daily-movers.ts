import type { MonthPosition } from "../application/get-month-positions";
import type { HoldingAnalytics } from "../application/get-holdings-analytics";

export type DailyMover = { assetId:string; name:string; ticker:string|null; assetType:string|null; quoteSymbol:string|null; label:string; result:number|null; percentage:number|null; totalValue:number|null };

/** Reuse Positions' daily return, converting its native amount to USD for comparisons. */
export function dailyMovers(positions:MonthPosition[],analytics:Record<string,HoldingAnalytics>,labels:Record<string,string>):DailyMover[] {
 const groups=new Map<string,{row:DailyMover;base:number;complete:boolean}>();
 for(const p of positions) {
  if(p.liquidated||p.historicalSold||p.totalBrl<=0)continue;
  const metric=analytics[p.id];
  const factor=p.nativeValue!==null&&p.nativeValue>0&&p.totalUsd!==null?p.totalUsd/p.nativeValue:null;
  const valid=factor!==null&&metric?.daily!=null&&metric.dailyPercent!=null&&Number.isFinite(metric.daily)&&Number.isFinite(metric.dailyPercent);
  const amount=valid?metric.daily!*factor!:0;
  const base=valid?(metric.dailyPercent!==0?amount/metric.dailyPercent!*100:(metric.daily===0?p.totalUsd!:0)):0;
  const previous=groups.get(p.assetId);
  const row:DailyMover=previous?.row??{assetId:p.assetId,name:p.assetName,ticker:p.ticker,assetType:p.assetType,quoteSymbol:p.quoteSymbol,label:labels[p.assetId]??p.ticker??p.assetName,result:0,percentage:null,totalValue:0};
  row.result=(row.result??0)+amount;
  row.totalValue=p.totalUsd===null||row.totalValue===null?null:row.totalValue+p.totalUsd;
  groups.set(p.assetId,{row,base:(previous?.base??0)+base,complete:(previous?.complete??true)&&valid});
 }
 return [...groups.values()].filter(group=>group.complete&&group.base>0).map(({row,base})=>({...row,percentage:row.result!/base*100}));
}
