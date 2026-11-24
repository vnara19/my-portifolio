"use client";
import { useId, useState } from "react";
import { AssetIcon } from "./asset-icon";
import { formatCurrency } from "../presentation/portfolio-format";
import { holdingPerformanceScale } from "../presentation/holding-performance-scale";
const percent=(n:number)=>`${n>=0?"+":""}${n.toFixed(2)}%`;

export type PerformanceHolding = { assetId:string; name:string; ticker:string|null; assetType:string|null; quoteSymbol:string|null; label:string; result:number|null; percentage:number|null };

export function HoldingPerformanceRow({holding:r,absolute,scale,totalValue,periodLabel="Total",compact=false}:{holding:PerformanceHolding;absolute:boolean;scale:ReturnType<typeof holdingPerformanceScale>;totalValue:number|null;periodLabel?:"Total"|"Day";compact?:boolean}) {
 const [open,setOpen]=useState(false);
 const tooltipId=useId();
 const v=(absolute?r.result:r.percentage)!;
 return <div data-holding-performance-row tabIndex={0} role="button" aria-label={`${r.label} performance details`} aria-expanded={open} aria-describedby={open?tooltipId:undefined} onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onClick={()=>setOpen(true)} onKeyDown={event=>{if(event.key==="Escape")setOpen(false);if(event.key==="Enter"||event.key===" "){event.preventDefault();setOpen(value=>!value);}}} className={`relative grid cursor-default grid-cols-[minmax(0,1fr)_72px] items-center gap-x-3 gap-y-1 rounded-lg text-xs outline-none hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-ring ${compact?"lg:grid-cols-[140px_minmax(0,1fr)_90px]":"sm:grid-cols-[220px_minmax(0,1fr)_150px]"}`}>
  <span className={`col-span-2 flex min-w-0 items-center gap-2 font-semibold ${compact?"lg:col-span-1":"sm:col-span-1"}`}><AssetIcon symbol={r.ticker??r.label} name={r.name} assetType={r.assetType} quoteSymbol={r.quoteSymbol}/><span className="line-clamp-2 break-words">{r.label}</span></span>
  <div className="relative flex h-8 items-center"><div aria-hidden="true" className="pointer-events-none absolute -inset-y-2 inset-x-0">{scale.ticks.map((tick,index)=><span key={index} className="absolute inset-y-0 border-l border-dashed border-muted-foreground/30" style={{left:`${tick/scale.maximum*100}%`}}/>)}</div><div className="relative h-2 w-full rounded-full bg-muted/50"><div className={`h-full rounded-full ${v<0?"bg-destructive":"bg-primary"}`} style={{width:`${Math.abs(v)/scale.maximum*100}%`}}/></div></div>
  <span className={`text-right font-mono text-[11px] sm:text-xs ${v<0?"text-destructive":"text-primary"}`}>{absolute?formatCurrency(v,"USD",true):percent(v)}</span>
  {open?<div id={tooltipId} role="tooltip" className={`pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-full max-w-[430px] rounded-xl border border-border bg-card px-4 py-3 text-xs shadow-xl ${compact?"":"sm:left-[220px] sm:w-[min(430px,calc(100%_-_220px))]"}`}>
    <p className="mb-2 font-medium leading-snug break-words">{r.name||r.label}</p>
    <dl className="space-y-1.5">{[{label:`${periodLabel} Gain %`,value:r.percentage===null?"—":percent(r.percentage),gain:r.result},{label:`${periodLabel} Gain`,value:r.result===null?"—":formatCurrency(r.result,"USD",true),gain:r.result},{label:"Total Value",value:totalValue===null?"—":formatCurrency(totalValue,"USD"),gain:null}].map(item=><div key={item.label} className="flex items-baseline justify-between gap-4"><dt className="text-muted-foreground">{item.label}</dt><dd className={`font-mono whitespace-nowrap ${item.gain===null?"text-foreground":item.gain<0?"text-destructive":"text-primary"}`}>{item.value}</dd></div>)}</dl>
  </div>:null}
 </div>;
}

export function PerformanceScale({scale,absolute,compact=false}:{scale:ReturnType<typeof holdingPerformanceScale>;absolute:boolean;compact?:boolean}) {
 const label=(value:number)=>absolute?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:2}).format(value):`${Number(value.toPrecision(6))}%`;
 return <div className={`grid grid-cols-[minmax(0,1fr)_72px] gap-x-3 ${compact?"lg:grid-cols-[140px_minmax(0,1fr)_90px]":"sm:grid-cols-[220px_minmax(0,1fr)_150px]"}`}><span className={compact?"hidden lg:block":"hidden sm:block"}/><div aria-label={absolute?"Absolute gain scale in USD":"Absolute return percentage scale"} className="relative h-4 font-mono text-[9px] text-muted-foreground sm:text-[10px]">{scale.ticks.map((tick,index)=><span key={index} className="absolute whitespace-nowrap" style={{left:`${tick/scale.maximum*100}%`,transform:index===0?undefined:index===scale.ticks.length-1?"translateX(-100%)":"translateX(-50%)"}}>{label(tick)}</span>)}</div></div>;
}
