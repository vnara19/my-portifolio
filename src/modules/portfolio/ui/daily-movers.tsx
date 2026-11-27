"use client";
import { useState } from "react";
import type { DailyMover } from "../presentation/daily-movers";
import { hasDisplayedHoldingGain, holdingPerformanceScale } from "../presentation/holding-performance-scale";
import { HoldingPerformanceRow, PerformanceScale } from "./performance-bars";

export function DailyMovers({rows}:{rows:DailyMover[]}) {
 return <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2"><MoversPanel rows={rows} positive/><MoversPanel rows={rows} positive={false}/></div>;
}
function MoversPanel({rows,positive}:{rows:DailyMover[];positive:boolean}) {
 const [absolute,setAbsolute]=useState(false);
 const title=positive?"Daily Gainers":"Daily Losers";
 const shown=rows.filter(row=>hasDisplayedHoldingGain(absolute?row.result:row.percentage)&&(positive?row.result!>0:row.result!<0)).sort((a,b)=>Math.abs((absolute?b.result:b.percentage)??0)-Math.abs((absolute?a.result:a.percentage)??0));
 const scale=holdingPerformanceScale(shown.map(row=>(absolute?row.result:row.percentage)??0));
 return <section aria-label={title} className="premium-panel min-w-0 rounded-[24px] p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">{title}</h2><details className="relative"><summary aria-label={`${title} settings`} className="flex size-9 cursor-pointer list-none items-center justify-center rounded-xl border border-border focus-visible:outline-2 focus-visible:outline-primary">⚙</summary><fieldset className="absolute right-0 top-11 z-40 w-44 space-y-3 rounded-xl border border-border bg-card p-4 text-xs shadow-xl"><legend className="sr-only">{title} display</legend>{[{label:"Absolute",value:true},{label:"Percentage",value:false}].map(option=><label key={option.label} className="flex items-center gap-2"><input type="radio" name={title} checked={absolute===option.value} onChange={()=>setAbsolute(option.value)}/>{option.label}</label>)}</fieldset></details></div><div className="mt-5 space-y-4">{shown.map(row=><HoldingPerformanceRow key={row.assetId} holding={row} absolute={absolute} scale={scale} totalValue={row.totalValue} periodLabel="Day" compact/>)}{shown.length?<PerformanceScale scale={scale} absolute={absolute} compact/>:<p className="py-12 text-center text-sm text-muted-foreground">No {positive?"gainers":"losers"} for this reporting day.</p>}</div></section>;
}
