export type MarketPoint={day:string;value:number;high?:number|null;low?:number|null;volume?:number|null};
export type HoldingMarketMetrics={last:number|null;change:number|null;changePercent:number|null;volume:number|null;averageVolume:number|null;marketCap:number|null;exchange:string|null;performance:Record<string,number|null>;beta:Record<string,number|null>;volatility:Record<string,number|null>};
export const PERFORMANCE_PERIODS=[['1w','1 Week'],['1m','1 Month'],['3m','3 Months'],['ytd','Year to Date'],['1y','1 Year'],['5y','5 Years'],['all','All Time']] as const;
const mean=(v:number[])=>v.reduce((a,b)=>a+b,0)/v.length;
const key=(date:Date)=>date.toISOString().slice(0,10);
export function holdingCutoff(asOf:string,period:string){
 const d=new Date(`${asOf}T00:00:00Z`);
 if(period==='all')return null;
 if(period==='ytd')return `${d.getUTCFullYear()-1}-12-31`;
 if(period==='1w')return key(new Date(+d-7*86400000));
 if(period==='1m')return key(new Date(+d-30*86400000));
 const months=period==='1m'?1:period==='3m'?3:period==='1y'?12:60;
 const first=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-months,1));
 return key(new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(d.getUTCDate(),new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate()))));
}
function at(points:MarketPoint[],day:string){const p=points.filter(p=>p.day<=day).at(-1);return p&&Date.parse(day)-Date.parse(p.day)<=7*86400000?p:null;}
/** Monthly covariance beta, matching dates and currencies; incomplete horizons remain unavailable. */
export function holdingBeta(points:MarketPoint[],benchmark:MarketPoint[],asOf:string,years:number){
 const end=new Date(`${asOf}T00:00:00Z`),pairs:number[][]=[];
 for(let i=years*12;i>=0;i--){const day=key(new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-i,0)));const a=at(points,day),b=at(benchmark,day);if(!a||!b)return null;pairs.push([a.value,b.value]);}
 const returns=pairs.slice(1).map((p,i)=>[p[0]/pairs[i][0]-1,p[1]/pairs[i][1]-1]);
 const pm=mean(returns.map(r=>r[0])),bm=mean(returns.map(r=>r[1])),variance=mean(returns.map(r=>(r[1]-bm)**2));
 return variance>1e-14?mean(returns.map(r=>(r[0]-pm)*(r[1]-bm)))/variance:null;
}
export function holdingMarketMetrics(points:MarketPoint[],asOf:string,benchmark:MarketPoint[]=[],volatilitySource:"range"|"close"="range"):HoldingMarketMetrics{
 const history=points.filter(p=>p.day<=asOf),last=at(history,asOf),previous=last?history.filter(p=>p.day<last.day).at(-1):undefined;
 const performance=Object.fromEntries(PERFORMANCE_PERIODS.map(([period])=>{const cutoff=holdingCutoff(asOf,period),base=cutoff?at(history,cutoff):history[0];return [period,last&&base?(last.value/base.value-1)*100:null];}));
 const range=(days:number)=>{if(!last)return null;const window=history.filter(p=>p.day>key(new Date(Date.parse(last.day)-days*86400000)));if(!window.length||!at(history,key(new Date(Date.parse(last.day)-days*86400000)))||window.some(p=>!p.low||p.high==null))return null;return mean(window.map(p=>(p.high!-p.low!)/Math.abs(p.low!)*100));};
 const daily=last?.high!=null&&last.low&&previous?Math.max(last.high-last.low,Math.abs(last.high-previous.value),Math.abs(last.low-previous.value))/Math.abs(last.low)*100:null;
 const closeMovement = (days: number) => {
  if (!last) return null;
  const cutoff = key(new Date(Date.parse(last.day) - days * 86400000));
  const base = days === 1 ? previous : at(history, cutoff);
  if (!base || base.value <= 0) return null;
  const observations = history.filter(point => point.day > base.day);
  if (!observations.length) return null;
  return mean(observations.map((point, index) =>
   Math.abs(point.value / (observations[index - 1] ?? base).value - 1) * 100,
  ));
 };
 const volumes=history.filter(p=>last&&p.day<last.day).slice(-10);
 return {last:last?.value??null,change:last&&previous?last.value-previous.value:null,changePercent:last&&previous?(last.value/previous.value-1)*100:null,volume:last?.volume??null,averageVolume:volumes.length===10&&volumes.every(p=>p.volume!=null)?mean(volumes.map(p=>p.volume!)):null,marketCap:null,exchange:null,performance,beta:Object.fromEntries([1,3,5].map(y=>[String(y),holdingBeta(history,benchmark,asOf,y)])),volatility:volatilitySource==='close'?{'1d':closeMovement(1),'1w':closeMovement(7),'1m':closeMovement(30)}:{'1d':daily,'1w':range(7),'1m':range(30)}};
}
