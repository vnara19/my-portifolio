import { timeWeightedReturns, type TwrObservation } from "./time-weighted-return";
export type DatedCashFlow = { day: string; amount: number };

/** Calendar-day XIRR. Reject ambiguous roots instead of choosing an arbitrary yield. */
export function xirr(flows: DatedCashFlow[]): number | null {
  if (!flows.length || !flows.some(f=>f.amount>0) || !flows.some(f=>f.amount<0) || flows.some(f=>!Number.isFinite(f.amount)||!Number.isFinite(Date.parse(f.day)))) return null;
  const start=Math.min(...flows.map(f=>Date.parse(f.day)));
  const timed=flows.filter(f=>f.amount!==0).map(f=>({amount:f.amount,years:(Date.parse(f.day)-start)/(365*86400000)}));
  if (!timed.some(f=>f.years>0)) return null;
  const npv=(logRate:number)=>{
    const shift=Math.max(...timed.map(f=>-logRate*f.years));
    return timed.reduce((sum,f)=>sum+f.amount*Math.exp(-logRate*f.years-shift),0);
  };
  const brackets:[number,number][]=[];
  let previous=-20,previousValue=npv(previous);
  for(let i=1;i<=400;i++){
    const current=-20+i/10,value=npv(current);
    if(value===0) brackets.push([current,current]);
    else if(previousValue!==0 && Math.sign(value)!==Math.sign(previousValue))brackets.push([previous,current]);
    previous=current;previousValue=value;
  }
  if(brackets.length!==1)return null;
  let [lo,hi]=brackets[0];
  for(let i=0;i<100&&hi-lo>1e-12;i++){
    const mid=(lo+hi)/2,value=npv(mid);
    if(value===0){lo=hi=mid;break;}
    if(Math.sign(value)===Math.sign(npv(lo)))lo=mid;else hi=mid;
  }
  const result=Math.expm1((lo+hi)/2)*100;
  return Number.isFinite(result)?result:null;
}

export function dailyOpenGain(holdings: { units: number; oldUnits: number; currentPrice: number | null; previousPrice: number | null; newUnits: number; newPrincipal: number | null }[]) {
  let amount=0,base=0;
  for(const h of holdings){
    if(h.units<=1e-8)continue;
    const old=Math.max(0,Math.min(h.oldUnits,h.units));
    const bought=Math.max(0,h.units-old);
    if(h.currentPrice===null || (old>0&&h.previousPrice===null) || (bought>0&&(!h.newUnits||h.newPrincipal===null)))return {amount:null,percent:null};
    const principal=bought>0?h.newPrincipal!*bought/h.newUnits:0;
    const start=old*(h.previousPrice??0)+principal;
    amount+=h.units*h.currentPrice-start;base+=start;
  }
  return {amount,percent:base>0?amount/base*100:null};
}

export function overviewPerformanceMetrics(observations:TwrObservation[],asOf:string) {
  const points=observations.filter(p=>p.day<=asOf);
  const last=points.at(-1);
  const twr=timeWeightedReturns(points).at(-1)?.percent??null;
  const flows=points.filter(p=>p.flow!==0).map(p=>({day:p.day,amount:-(p.flow??0)}));
  if(last?.value!==null&&last?.value!==undefined)flows.push({day:last.day,amount:last.value});
  const annualized=last?.value==null||points.some(p=>p.flow===null)?null:xirr(flows);
  return {asOf:last?.day??null,dailyUsd:last?.dailyGainUsd??null,dailyPercent:last?.dailyGainPercent??null,totalPercent:twr,annualizedPercent:annualized};
}
export type OverviewPerformanceMetrics=ReturnType<typeof overviewPerformanceMetrics>;
