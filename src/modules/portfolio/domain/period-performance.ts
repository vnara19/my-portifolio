import { periodStart, type ChartPeriod } from "./chart-period";
import { returnBaselineDay, timeWeightedReturns, type TwrObservation } from "./time-weighted-return";
export type PeriodChange = { usd:number|null; eur:number|null; percent:number|null };
const unavailable:PeriodChange={usd:null,eur:null,percent:null};

/** Investment result excludes external funding; the percentage links daily TWR factors. */
export function periodChange(points:TwrObservation[],startExclusive:string,through:string,eurUsd:number|null,allowInitialFunding=false):PeriodChange {
  const before=points.filter(p=>p.day<=startExclusive).at(-1);
  const window=points.filter(p=>p.day>startExclusive&&p.day<=through);
  if(!window.length || (!before && (!allowInitialFunding || (window[0].inflow??window[0].flow??0)<=0)))return {...unavailable};
  if(window.some(p=>p.value===null||p.flow===null)||before?.value===null)return {...unavailable};
  const initial=before?.value??0, last=window.at(-1)!;
  const series=before?[{...before,flow:0,inflow:0,outflow:0},...window]:window;
  const percent=timeWeightedReturns(series).at(-1)?.percent??null;
  if(percent===null)return {...unavailable};
  const eur=last.value!-initial-window.reduce((sum,p)=>sum+p.flow!,0);
  return {eur,usd:eurUsd!==null&&Number.isFinite(eurUsd)&&eurUsd>0?eur*eurUsd:null,percent};
}
export function overviewPeriodChanges(points:TwrObservation[],asOf:string,eurUsd:number|null){
  const end=new Date(`${asOf}T00:00:00Z`);
  const monthStart=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),0)).toISOString().slice(0,10);
  const year=end.getUTCFullYear()-1, month=end.getUTCMonth();
  const anniversary=new Date(Date.UTC(year,month,Math.min(end.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate()))).toISOString().slice(0,10);
  return {month:periodChange(points,monthStart,asOf,eurUsd,true),year:periodChange(points,anniversary,asOf,eurUsd)};
}

/** Overview 1M is exactly 30 trailing days; other ranges retain calendar boundaries. */
export function portfolioPeriodStart(end:number,period:ChartPeriod):number {
  return period==="1m"?end-30*86400000:periodStart(end,period);
}

/** Monetary profit excludes funding; percentages link the same daily TWR factors. */
export function chartPeriodChange(points:TwrObservation[],through:string,period:ChartPeriod,eurUsd:number|null):PeriodChange {
  const history=points.filter(point=>point.day<=through);
  if(!history.length)return {...unavailable};
  const cutoff=portfolioPeriodStart(Date.parse(through),period);
  const baseline=period==="all"?returnBaselineDay(history)!:new Date(cutoff-(period==="ytd"?86400000:0)).toISOString().slice(0,10);
  if(period==="all"&&history.length===1&&baseline===history[0].day){
    const percent=timeWeightedReturns(history)[0].percent;
    return percent===null?{...unavailable}:{eur:0,usd:eurUsd!==null&&Number.isFinite(eurUsd)&&eurUsd>0?0:null,percent};
  }
  return periodChange(history,baseline,through,eurUsd,period==="all"||period==="ytd");
}

export function chartPeriodReturn(points:TwrObservation[],through:string,period:ChartPeriod):number|null {
  return chartPeriodChange(points,through,period,null).percent;
}
