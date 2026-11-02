"use client";
import { useState } from "react";
import { Area, Bar, BarChart, Cell, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, usePlotArea, type RectangleProps } from "recharts";
import { monthlyProfitability, profitHistory, riskMetrics } from "../domain/overview-analytics";
import { CHART_PERIODS, periodStart, type ChartPeriod } from "../domain/chart-period";
import type { TwrObservation } from "../domain/time-weighted-return";
import type { Sp500Benchmark } from "@/modules/quotes/application/sp500-benchmark";
import type { OverviewData } from "../application/get-overview-data";
import { formatCurrency } from "../presentation/portfolio-format";
import { RiskHelp } from "./risk-help";
import { AssetIcon } from "./asset-icon";
import { useTouchTooltip } from "./use-touch-tooltip";

const percent=(n:number)=>`${n>=0?"+":""}${n.toFixed(2)}%`;
const number=(n:number|null)=>n===null?"—":n.toFixed(3);
const button="rounded-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary";
const selected=" bg-primary/15 text-primary";
const panel="premium-panel mt-6 min-w-0 rounded-[24px] p-5 sm:p-7";

export function OverviewAnalytics({overview,observations,usd,benchmark,rate,labels,asOf,fxHistory,currentFx}:{overview:OverviewData;observations:TwrObservation[];usd:TwrObservation[];benchmark:Sp500Benchmark;rate:number|null;labels:Record<string,string>;asOf:string;currentFx:number|null;fxHistory:{day:string;value:number}[]}){
 const [profitSeries,setProfitSeries]=useState<"both"|"profit"|"realized">("both");
 const [year,setYear]=useState("all");
 const [period,setPeriod]=useState<ChartPeriod>("all");
 const [filter,setFilter]=useState("all");
 const [sold,setSold]=useState(false);
 const [absolute,setAbsolute]=useState(false);
 const touch=useTouchTooltip();
 const rows=monthlyProfitability(observations,benchmark.points,asOf);
 const risks=riskMetrics(rows,rate);
 const years=[...new Set(rows.map(p=>p.month.slice(0,4)))].reverse();
 const ttm=new Date(`${asOf.slice(0,7)}-01T00:00:00Z`);ttm.setUTCMonth(ttm.getUTCMonth()-11);
 const months=rows.filter(r=>year==="all"||year==="ttm"&&r.month>=ttm.toISOString().slice(0,7)||r.month.startsWith(year));
 const bars=months.flatMap(row=>[{...row,slot:`${row.month}:portfolio`,value:row.portfolio,name:"Portfolio %",color:"#4086ff"},{...row,slot:`${row.month}:benchmark`,value:row.benchmark,name:"SPX %",color:"#48c9db"}]);
 const start=periodStart(Date.parse(asOf),period);
 const profits=overview.gainsEur?.totalUsd===null?[]:profitHistory(observations,usd,overview.realizedHistory,fxHistory).filter(p=>Date.parse(p.day)>=start&&p.day<=asOf);
 const fx=currentFx;
 const holdings=overview.holdingResults.filter(r=>sold||!r.sold).map(r=>({...r,label:labels[r.assetId]??overview.distribution.assets.find(a=>a.key===r.assetId)?.label??"Asset",result:r.totalUsd===null||fx===null?null:r.totalUsd*fx,percentage:r.totalUsd===null||r.principal<=0?null:r.totalUsd/r.principal*100})).filter(r=>filter==="all"||filter==="gainers"&&r.totalUsd!==null&&r.totalUsd>0||filter==="losers"&&r.totalUsd!==null&&r.totalUsd<0).sort((a,b)=>(absolute?b.result??-Infinity:b.percentage??-Infinity)-(absolute?a.result??-Infinity:a.percentage??-Infinity));
 const max=Math.max(1,...holdings.map(r=>Math.abs((absolute?r.result:r.percentage)??0)));
 return <>
  <section className={panel} aria-label="Portfolio Profitability">
   <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Portfolio Profitability</h2><div className="flex max-w-full flex-wrap gap-1" aria-label="Profitability year">{["all","ttm",...years].map(y=><button key={y} type="button" aria-pressed={year===y} title={y==="ttm"?"Trailing 12 Months":undefined} className={button+(year===y?selected:"")} onClick={()=>setYear(y)}>{y==="all"?"All":y==="ttm"?"TTM":y}</button>)}</div></div>
   <div className="h-[300px] w-full min-w-0" {...touch.containerProps}><ResponsiveContainer width="100%" height="100%"><BarChart data={bars} margin={{left:0,right:8,top:10,bottom:0}}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="slot" ticks={months.map(row=>`${row.month}:portfolio`)} tick={{fontSize:11}} tickFormatter={v=>new Intl.DateTimeFormat("en-GB",{month:"short",year:"2-digit",timeZone:"UTC"}).format(new Date(`${String(v).split(":")[0]}-01`))}/><YAxis width={48} tick={{fontSize:11}} tickFormatter={v=>`${v}%`}/><Tooltip shared cursor={<ProfitabilityCursor/>} content={({active,payload})=>{
 const entry=payload?.[0];if(!active||!entry)return null;
 const month=entry.payload?.month;
 const label=typeof month==="string"&&/^\d{4}-\d{2}$/.test(month)?new Intl.DateTimeFormat("en-GB",{month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${month}-01`)):"";
 return <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs leading-5 shadow-xl"><p className="text-muted-foreground">{label}</p><p className="flex items-center gap-2"><span className="size-2 rounded-full" style={{backgroundColor:entry.payload?.color??entry.color}}/>{entry.payload?.name??entry.name}<span className="font-mono">{typeof entry.value==="number"?percent(entry.value):"—"}</span></p></div>;
 }}/><Legend content={()=><div className="mt-2 flex justify-center gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><span className="size-2 bg-[#4086ff]"/>Portfolio %</span><span className="flex items-center gap-1.5"><span className="size-2 bg-[#48c9db]"/>SPX %</span></div>}/><Bar dataKey="value" activeBar={false} isAnimationActive={false} radius={[3,3,0,0]}>{bars.map(row=><Cell key={row.slot} fill={row.color}/>)}</Bar></BarChart></ResponsiveContainer></div>
  </section>
  <section className={panel} aria-label="Profit">
   <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Profit</h2><div className="flex flex-wrap" aria-label="Profit period">{CHART_PERIODS.map(p=><button key={p.key} type="button" aria-pressed={period===p.key} className={button+(period===p.key?selected:"")} onClick={()=>setPeriod(p.key)}>{p.label}</button>)}</div></div>
   <div className="h-[320px] min-w-0" {...touch.containerProps}>{profits.length?<ResponsiveContainer width="100%" height="100%"><ComposedChart data={profits} margin={{left:0,right:12,top:10,bottom:0}}><defs><linearGradient id="profit-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a66bd4" stopOpacity={0.25}/><stop offset="100%" stopColor="#a66bd4" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 5" stroke="var(--border)"/><XAxis dataKey="day" minTickGap={45} tick={{fontSize:11}} tickFormatter={v=>new Intl.DateTimeFormat("en-GB",{month:"short",year:"2-digit",timeZone:"UTC"}).format(new Date(v))}/><YAxis width={70} tick={{fontSize:11}} tickFormatter={v=>`$${Intl.NumberFormat("en",{notation:"compact"}).format(v)}`}/><Tooltip formatter={v=>typeof v==="number"?formatCurrency(v,"USD",true):"—"} contentStyle={{background:"var(--card)",borderColor:"var(--border)",borderRadius:12,fontSize:12,lineHeight:"18px",padding:"8px 10px"}}/><Legend content={()=><div className="mt-2 flex flex-wrap justify-center gap-4 text-xs">{[{key:"realized",label:"Realized P&L",color:"#a1a1aa"},{key:"profit",label:"Total Profit",color:"#a66bd4"}].map(item=><button key={item.key} type="button" aria-pressed={profitSeries==="both"||profitSeries===item.key} className="flex items-center gap-1.5 rounded px-1 py-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary" onClick={()=>setProfitSeries(previous=>previous==="both"?(item.key as "realized"|"profit"):"both")}><span className="h-0.5 w-3" style={{backgroundColor:item.color}}/>{item.label}</button>)}</div>}/><Area hide={profitSeries==="realized"} type="linear" dataKey="profit" name="Total Profit" stroke="#a66bd4" fill="url(#profit-fill)" strokeWidth={2} isAnimationActive={false}/><Line hide={profitSeries==="profit"} type="stepAfter" strokeWidth={2} dataKey="realized" name="Realized Profit And Loss" stroke="#a1a1aa" strokeDasharray="4 4" dot={false} isAnimationActive={false}/></ComposedChart></ResponsiveContainer>:<p className="text-sm text-muted-foreground">Complete purchase history is needed.</p>}</div>
  </section>
  <section className={panel} aria-label="Risks"><h2 className="text-base font-semibold">Risks</h2><div className="mt-5 grid gap-6 md:grid-cols-3">{[
   {name:"Beta",value:risks.beta,market:1,help:"How strongly your portfolio moves with SPX. 1 = similar sensitivity; above 1 = larger swings."},
   {name:"Sharpe Ratio",value:risks.sharpe,market:risks.benchmarkSharpe,help:"Return above the risk-free rate for the volatility taken. Higher is better."},
   {name:"Sortino Ratio",value:risks.sortino,market:risks.benchmarkSortino,help:"Like Sharpe, but focuses on downside movements. Higher is better."}
  ].map(r=><article key={r.name} className="min-w-0"><div className="flex items-center gap-2"><h3 className="text-sm font-semibold">{r.name}</h3><RiskHelp name={r.name}>{r.help}</RiskHelp></div><p className="mt-3 font-mono text-2xl">{number(r.value)}</p><p className="mt-2 text-xs text-muted-foreground">SPX {number(r.value===null?null:r.market)}</p><div className={`relative mt-3 h-1.5 rounded-full ${r.name==="Beta"?"bg-muted-foreground/50":"bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400"}`} aria-hidden="true">{r.value!==null?<span className="absolute -top-1 size-3.5 -translate-x-1/2 rounded-full border-2 border-background bg-foreground" style={{left:`${Math.max(0,Math.min(100,r.value/(r.name==="Beta"?2:r.name==="Sharpe Ratio"?3:5)*100))}%`}}/>:null}</div></article>)}</div><p className="mt-5 text-xs text-muted-foreground">{risks.months} Completed Months · Risk-Free Rate {rate===null?"—":`${rate}%`} Per Year · <a className="text-primary underline" href="/configuracao">Edit Rate</a></p></section>
  <section className={panel} aria-label="Holdings Performance"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Holdings Performance</h2><details className="relative"><summary aria-label="Holdings Performance settings" className="flex size-9 cursor-pointer list-none items-center justify-center rounded-xl border border-border focus-visible:outline-2 focus-visible:outline-primary">⚙</summary><fieldset className="absolute right-0 top-11 z-20 w-56 space-y-3 rounded-xl border border-border bg-card p-4 text-sm shadow-xl"><legend className="sr-only">Holdings Display</legend><label className="flex items-center justify-between gap-3">Display Sold<input type="checkbox" checked={sold} onChange={e=>setSold(e.target.checked)}/></label><hr className="border-border"/>{[{label:"Absolute",value:true},{label:"Percentage",value:false}].map(m=><label key={m.label} className="flex items-center gap-2"><input type="radio" name="holdings-value" checked={absolute===m.value} onChange={()=>setAbsolute(m.value)}/>{m.label}</label>)}</fieldset></details></div><div className="mt-4 flex gap-1">{["all","gainers","losers"].map(f=><button key={f} type="button" className={button+(filter===f?selected:"")} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f[0].toUpperCase()+f.slice(1)}</button>)}</div><div className="mt-5 space-y-4">{holdings.map(r=>{const v=absolute?r.result:r.percentage;return <div key={r.assetId} className="grid grid-cols-[90px_minmax(0,1fr)_100px] items-center gap-3 text-xs sm:grid-cols-[135px_minmax(0,1fr)_150px]"><span className="flex min-w-0 items-center gap-2 font-semibold" title={r.label}><AssetIcon symbol={r.ticker??r.label} name={r.name} assetType={r.assetType} quoteSymbol={r.quoteSymbol}/><span className="truncate">{r.label}</span></span><div className="h-2 rounded-full bg-muted/50"><div className={`h-full rounded-full ${v!==null&&v<0?"bg-destructive":"bg-primary"}`} style={{width:`${Math.abs(v??0)/max*100}%`}}/></div><span className={`text-right font-mono ${v===null?"text-muted-foreground":v<0?"text-destructive":"text-primary"}`}>{v===null?"—":absolute?formatCurrency(v,"USD",true):percent(v)}</span></div>})}{!holdings.length?<p className="text-sm text-muted-foreground">No matching holdings.</p>:null}</div></section>
 </>;
}

function ProfitabilityCursor(props:RectangleProps){
 const plot=usePlotArea();
 const x=Number(props.x??0),width=Number(props.width??0);
 return <line x1={x+width/2} x2={x+width/2} y1={plot?.y??0} y2={(plot?.y??0)+(plot?.height??0)} stroke="var(--muted-foreground)" strokeWidth={1} pointerEvents="none"/>;
}
