"use client";

import { useQueryState } from "nuqs";
import { useState, useTransition } from "react";
import { Area, Bar, Brush, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { englishLabel } from "@/lib/english-labels";
import { cn } from "@/lib/utils";
import type { OverviewHistoryPoint } from "../application/get-overview-data";
import { CHART_PERIODS, periodStart, type ChartPeriod } from "../domain/chart-period";
import { timeWeightedReturns, type TwrObservation } from "../domain/time-weighted-return";
import { categoryColor } from "../presentation/category-colors";
import { formatCurrency, formatMonthCompact } from "../presentation/portfolio-format";
import type { Sp500Benchmark } from "@/modules/quotes/application/sp500-benchmark";
import { useTouchTooltip } from "./use-touch-tooltip";

type Mode = "value" | "performance" | "total" | "class" | "currency";
const MODES: {key:Mode;label:string}[] = [
  {key:"value",label:"Value"},{key:"performance",label:"Performance"},{key:"total",label:"Monthly Value"},
  {key:"class",label:"Class"},{key:"currency",label:"Currency"},
];
const PURPLE="#a66bd4";
const TEAL="#12b5a5";
const dateLabel=(day:string)=>new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(day));

export function PortfolioEvolutionChart({history,selectedMonth,classLabels,currencyLabels,observations=[],benchmark={points:[],source:"S&P 500",available:false}}:{
  history:OverviewHistoryPoint[];selectedMonth:string;classLabels:string[];currencyLabels:string[];
  observations?:TwrObservation[];benchmark?:Sp500Benchmark;
}) {
  const [, startTransition] = useTransition();
  const [, setMonth] = useQueryState("mes", { shallow: false, startTransition });
  const [mode,setMode]=useState<Mode>("value");
  const [period,setPeriod]=useState<ChartPeriod>("all");
  const touch=useTouchTooltip();
  const end=Date.parse(history.at(-1)?.day??`${history.at(-1)?.month}-01`);
  const start=periodStart(end,period);
  const visible=history.filter(p=>Date.parse(p.day??`${p.month}-01`)>=start);
  const lineRows = observations.filter(p=>Date.parse(p.day)>=start&&p.day<=history.at(-1)!.day!);
  const firstDay=lineRows[0]?.day??visible[0]?.day??`${visible[0]?.month}-01`;
  const performance=new Map(timeWeightedReturns(observations).map(p=>[p.day,p.percent]));
  const indexAt=(day:string)=>{
    let lo=0,hi=benchmark.points.length-1,index=-1;
    while(lo<=hi){const mid=Math.floor((lo+hi)/2);if(benchmark.points[mid].day<=day){index=mid;lo=mid+1;}else hi=mid-1;}
    const point=benchmark.points[index];return point && Date.parse(day)-Date.parse(point.day)<=7*86400000?point.value:null;
  };
  const initialIndex=indexAt(observations[0]?.day??history[0]?.day??firstDay);
  const monthlyData=visible.map(p=>{
    const day=p.day??`${p.month}-01`;
    const index=indexAt(day);
    return {month:p.month,day,label:formatMonthCompact(p.date),total:p.totalUsd??null,
      portfolio:performance.get(day)??null,spx:initialIndex!==null&&index!==null?(index/initialIndex-1)*100:null,
      ...p.byClassUsd,...p.byCurrencyUsd};
  });
  const dailyData=lineRows.map(p=>{
    const index=indexAt(p.day);
    return {day:p.day,month:p.day.slice(0,7),label:new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",timeZone:"UTC"}).format(new Date(p.day)),total:p.value,portfolio:performance.get(p.day)??null,spx:initialIndex!==null&&index!==null?(index/initialIndex-1)*100:null};
  });
  const hasDailyValues=dailyData.some(p=>p.total!==null);
  const benchmarkDays=new Set(benchmark.points.map(p=>p.day));
  const plottedDaily=mode==="performance"&&benchmark.available?dailyData.filter(p=>benchmarkDays.has(p.day)):dailyData;
  const data=(mode==="value"||mode==="performance")&&hasDailyValues ? plottedDaily : monthlyData;
  const isPerformance=mode==="performance";
  const isLine=mode==="value"||isPerformance;
  const series=mode==="class"?classLabels:mode==="currency"?currencyLabels:["total"];
  const unavailable=isPerformance&&data.some(p=>p.portfolio===null);
  const format=(value:number)=>isPerformance?`${value.toLocaleString("en-GB",{maximumFractionDigits:2})}%`:formatCurrency(value,"USD");
  return <div data-testid="portfolio-change-chart">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Portfolio chart view" className="flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-card/60 p-1">
        {MODES.map(m=><button key={m.key} type="button" aria-pressed={mode===m.key} onClick={()=>setMode(m.key)} className={cn("rounded-lg px-3 py-1.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",mode===m.key?"bg-primary text-primary-foreground":"text-muted-foreground hover:text-foreground")}>{m.label}</button>)}
      </div>
      <div role="group" aria-label="Chart period" className="flex flex-wrap gap-1 rounded-xl border border-border p-1">
        {CHART_PERIODS.map(p=><button key={p.key} type="button" aria-pressed={period===p.key} onClick={()=>setPeriod(p.key)} className={cn("rounded-lg px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",period===p.key?"bg-white/10 text-foreground":"text-muted-foreground hover:text-foreground")}>{p.label}</button>)}
      </div>
    </div>
    {isPerformance?<div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
      <span><span className="mr-2 inline-block size-2 rounded-full" style={{backgroundColor:TEAL}}/>Portfolio · TWR</span>
      <span title={benchmark.source}><span className="mr-2 inline-block size-2 rounded-full bg-neutral-400"/>S&amp;P 500 · Total Return</span>
    </div>:null}
    <div className="h-[310px] w-full sm:h-[360px]" {...touch.containerProps}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{top:12,right:6,bottom:0,left:0}} onClick={state=>{
          if(isLine||touch.isTouch())return;
          const row=data.find(p=>p.day===String(state?.activeLabel??""));
          if(row)void setMonth(row.month);
        }}>
          <defs><linearGradient id="portfolio-value-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={isPerformance?TEAL:PURPLE} stopOpacity={0.25}/><stop offset="100%" stopColor={isPerformance?TEAL:PURPLE} stopOpacity={0.01}/></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4"/>
          <XAxis dataKey="day" tickFormatter={day=>new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"2-digit",timeZone:"UTC"}).format(new Date(day))} axisLine={false} tickLine={false} minTickGap={28} tick={{fill:"var(--muted-foreground)",fontSize:10}}/>
          <YAxis orientation="right" width={70} axisLine={false} tickLine={false} tick={{fill:"var(--muted-foreground)",fontSize:10}} tickFormatter={v=>isPerformance?`${v}%`:new Intl.NumberFormat("en-GB",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:0}).format(v)}/>
          <Tooltip cursor={{stroke:"var(--muted-foreground)",strokeDasharray:"3 3"}} content={({active,payload})=>{
            if(!active||!payload?.length)return null;
            const point=payload[0]?.payload as typeof data[number];
            return <div className="rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur"><p className="mb-2 text-xs text-muted-foreground">{dateLabel(point.day)}</p>{payload.filter(p=>typeof p.value==="number").map(p=><p key={String(p.dataKey)} className="flex gap-4 text-xs"><span style={{color:p.color}}>{englishLabel(String(p.name))}</span><span className="ml-auto font-mono">{format(Number(p.value))}</span></p>)}</div>;
          }}/>
          {isLine?<Area type="linear" dataKey={isPerformance?"portfolio":"total"} name="Portfolio" stroke={isPerformance?TEAL:PURPLE} fill="url(#portfolio-value-fill)" strokeWidth={2.2} dot={false} activeDot={{r:4}} connectNulls={false} isAnimationActive={false}/>:series.map(key=><Bar key={key} dataKey={key} name={key==="total"?"Portfolio":englishLabel(key)} stackId="portfolio" maxBarSize={65} isAnimationActive={false}>{data.map(row=><Cell key={row.month} fill={key==="total"?"var(--primary)":categoryColor(key)} fillOpacity={row.month===selectedMonth?1:0.5}/>)}</Bar>)}
          {!isLine?<Brush key={`${mode}:${period}`} dataKey="label" height={26} fill="oklch(1 0 0 / 0.02)" stroke="var(--border)" travellerWidth={8}/>:null}
          {isPerformance?<Line type="linear" dataKey="spx" name="S&P 500 TR" stroke="#9ca3af" strokeDasharray="3 3" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false}/>:null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    {unavailable?<p role="status" className="mt-2 text-xs text-muted-foreground">Portfolio TWR requires complete valuations on transaction dates. Missing periods are not estimated.</p>:null}
    {isPerformance&&!benchmark.available?<p role="status" className="mt-2 text-xs text-muted-foreground">S&amp;P 500 history is temporarily unavailable.</p>:null}
  </div>;
}
