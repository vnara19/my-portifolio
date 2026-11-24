/** Both markers use the same scale; values remain the existing risk calculations. */
export function RiskGauge({name,value,market}:{name:string;value:number|null;market:number|null}) {
 const limit=name==="Beta"?2:name==="Sharpe Ratio"?3:5;
 const minimum=Math.min(0,...[value,market].filter((n):n is number=>n!==null).map(Math.floor));
 const maximum=Math.max(limit,...[value,market].filter((n):n is number=>n!==null).map(Math.ceil));
 const left=(n:number)=>(n-minimum)/(maximum-minimum)*100;
 const overlap=value!==null&&market!==null&&Math.abs(left(value)-left(market))<3;
 return <div className="mt-5" role="img" aria-label={`${name}: Portfolio ${value?.toFixed(3)??"unavailable"}; SPX ${market?.toFixed(3)??"unavailable"}`}><div className={`relative h-1.5 rounded-full ${name==="Beta"?"bg-muted-foreground/50":"bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400"}`}>
  {market!==null?<span data-risk-marker="spx" title={`SPX ${market.toFixed(3)}`} className="absolute z-10 size-3 -translate-x-1/2 rounded-full border-2 border-background bg-gray-400" style={{left:`${left(market)}%`,top:overlap?4:-3}}/>:null}
  {value!==null?<span data-risk-marker="portfolio" title={`Portfolio ${value.toFixed(3)}`} className="absolute -top-1 z-20 size-3.5 -translate-x-1/2 rounded-full border-2 border-background bg-white" style={{left:`${left(value)}%`}}/>:null}
 </div><div className="mt-3 flex justify-between font-mono text-[10px] text-muted-foreground" aria-hidden="true"><span>{minimum}</span><span>{maximum}</span></div></div>;
}
