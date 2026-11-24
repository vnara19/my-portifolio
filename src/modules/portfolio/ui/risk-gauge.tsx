/** Values are anchored to their markers; both markers share the same scale. */
export function RiskGauge({name,value,market}:{name:string;value:number|null;market:number|null}) {
 const limit=name==="Beta"?2:name==="Sharpe Ratio"?3:5;
 const minimum=Math.min(0,...[value,market].filter((n):n is number=>n!==null).map(Math.floor));
 const maximum=Math.max(limit,...[value,market].filter((n):n is number=>n!==null).map(Math.ceil));
 const left=(n:number)=>(n-minimum)/(maximum-minimum)*100;
 const overlap=value!==null&&market!==null&&Math.abs(left(value)-left(market))<3;
 const labelPosition=(n:number)=>({left:`${left(n)}%`,transform:"translateX(-50%)"});
 return <div className="relative mt-5 pt-12 pb-12" role="img" aria-label={`${name}: Portfolio ${value?.toFixed(3)??"unavailable"}; SPX ${market?.toFixed(3)??"unavailable"}`}>
  <div className="absolute inset-x-0 top-0 h-12">
   {value!==null?<span data-risk-label="portfolio" className="absolute bottom-2 rounded-md bg-foreground px-2 py-1 font-mono text-lg font-semibold leading-none text-background" style={labelPosition(value)}>{value.toFixed(3)}</span>:<span className="font-mono text-lg text-muted-foreground">—</span>}
  </div>
  <div className={`relative h-1.5 rounded-full ${name==="Beta"?"bg-muted-foreground/50":"bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400"}`}>
   {market!==null?<span data-risk-marker="spx" title={`SPX ${market.toFixed(3)}`} className="absolute z-10 size-3 -translate-x-1/2 rounded-full border-2 border-background bg-gray-400" style={{left:`${left(market)}%`,top:overlap?4:-3}}/>:null}
   {value!==null?<span data-risk-marker="portfolio" title={`Portfolio ${value.toFixed(3)}`} className="absolute -top-1 z-20 size-3.5 -translate-x-1/2 rounded-full border-2 border-background bg-white" style={{left:`${left(value)}%`}}/>:null}
   {market!==null?<span data-risk-label="spx" className="absolute top-4 whitespace-nowrap rounded-md bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground" style={labelPosition(market)}>SPX {market.toFixed(3)}</span>:null}
  </div>
  <div className="pointer-events-none absolute inset-x-0 top-8 flex justify-between font-mono text-[10px] text-muted-foreground" aria-hidden="true"><span>{minimum}</span><span>{maximum}</span></div>
 </div>;
}
