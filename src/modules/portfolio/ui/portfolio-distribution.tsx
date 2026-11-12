"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { PortfolioDistribution, DistributionRow } from "../domain/portfolio-distribution";
import { formatCurrency } from "../presentation/portfolio-format";
import { cn } from "@/lib/utils";

const VIEWS = [{key:"assets",label:"Assets",column:"Asset"},{key:"types",label:"Asset Types",column:"Asset Type"},{key:"currencies",label:"Currency",column:"Currency"}] as const;
const formatSharePercent=(value:number)=>`${value.toFixed(2)}%`;
const point=(angle:number,radius:number)=>({x:260+Math.cos(angle)*radius,y:260+Math.sin(angle)*radius});

const CHART_LEFT = -118;
const CHART_TOP = -32;
const CHART_WIDTH = 756;
const CHART_HEIGHT = 584;

export function PortfolioDistributionPanel({data}:{data:PortfolioDistribution}) {
  const [view,setView]=useState<typeof VIEWS[number]["key"]>("assets");
  const [hover,setHover]=useState<string|null>(null);
  const rows=data[view], active=rows.find(row=>row.key===hover);
  const selected=VIEWS.find(item=>item.key===view)!;
  const slices=rows.map((row,index)=>{const start=-Math.PI/2+rows.slice(0,index).reduce((sum,item)=>sum+item.share,0)/100*Math.PI*2;return {row,start,middle:start+row.share/100*Math.PI};});
  const chartRef = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const measure = () => {
      const occupied: DOMRect[] = [];
      for (const label of chart.querySelectorAll<SVGForeignObjectElement>("[data-slice-label]")) {
        const box = label.getBoundingClientRect();
        const name = label.querySelector("span")!.getBoundingClientRect();
        const fits = name.height <= box.height && name.width <= box.width &&
          !occupied.some(other => name.left < other.right + 3 && name.right + 3 > other.left &&
            name.top < other.bottom + 3 && name.bottom + 3 > other.top);
        label.style.visibility = fits ? "visible" : "hidden";
        if (fits) occupied.push(name);
      }
    };
    measure();
    let active = true;
    void document.fonts.ready.then(() => { if (active) measure(); });
    return () => { active = false; };
  }, [rows]);
  const activeSlice=slices.find(slice=>slice.row.key===hover);
  const tooltipAnchor=activeSlice?point(activeSlice.middle,165):null;
  const activate=(row:DistributionRow)=>setHover(row.key);
  return <section id="alocacao" aria-labelledby="distribution-title" className="premium-panel mt-6 scroll-mt-32 rounded-[24px] p-5 sm:p-7">
    <h2 id="distribution-title" className="text-base font-semibold tracking-[-0.025em]">Portfolio Distribution</h2>
    <div role="group" aria-label="Distribution view" className="mt-5 flex gap-1">
      {VIEWS.map(item=><button key={item.key} type="button" aria-pressed={view===item.key} onClick={()=>{setView(item.key);setHover(null);}} className={cn("rounded-lg px-3 py-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",view===item.key?"bg-white/10 text-foreground":"text-muted-foreground hover:bg-white/5 hover:text-foreground")}>{item.label}</button>)}
    </div>
    {rows.length===0?<p className="py-12 text-center text-sm text-muted-foreground">No Holdings</p>:<div className="mt-4 grid min-w-0 items-center gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)]">
      <div className="relative mx-auto w-full" onMouseLeave={()=>setHover(null)}>
        <svg ref={chartRef} viewBox={`${CHART_LEFT} ${CHART_TOP} ${CHART_WIDTH} ${CHART_HEIGHT}`} className="block h-auto w-full overflow-hidden" role="group" aria-label={`${selected.label} distribution`}>
          <text x="260" y="251" textAnchor="middle" fill="currentColor" fontSize="29" fontWeight="600">{data.assetCount}</text>
          <text x="260" y="280" textAnchor="middle" fill="var(--muted-foreground)" fontSize="16" fontWeight="500">Total Assets</text>
          {slices.map(({row,start})=>{
            const circumference=2*Math.PI*190, length=row.share/100*circumference;
            return <g key={row.key}>
              {hover===row.key?<circle cx="260" cy="260" r="190" fill="none" stroke={row.color} strokeWidth="90" strokeOpacity="0.22" strokeDasharray={`${length} ${circumference-length}`} transform={`rotate(${start*180/Math.PI} 260 260)`}/>:null}
              <circle data-distribution-slice={row.key} cx="260" cy="260" r="190" fill="none" stroke={row.color} strokeWidth="64" strokeDasharray={`${length} ${circumference-length}`} transform={`rotate(${start*180/Math.PI} 260 260)`} tabIndex={0} role="img" aria-label={`${row.label}: ${formatCurrency(row.valueUsd,"USD")}, ${formatSharePercent(row.share)}`} onMouseEnter={()=>activate(row)} onFocus={()=>activate(row)} onBlur={()=>setHover(null)} className="outline-none"/>
            </g>;
          })}
          {[...slices].sort((a, b) => b.row.share - a.row.share).map(({ row, middle }) => <DistributionLabel key={row.key} row={row} angle={middle} />)}
        </svg>
        {active&&tooltipAnchor?<div role="tooltip" style={{left:`${(tooltipAnchor.x-CHART_LEFT)/CHART_WIDTH*100}%`,top:`${(tooltipAnchor.y-CHART_TOP)/CHART_HEIGHT*100}%`,transform:`translate(${tooltipAnchor.x>260?"-100%":"0"}, -100%)`}} className="pointer-events-none absolute z-10 w-max max-w-[80%] rounded-md border border-white/10 bg-[#292929] px-3 py-2.5 text-xs shadow-xl">
          <div className="flex items-center gap-2"><span className="size-2 shrink-0 rounded-full" style={{backgroundColor:active.color}}/><span className="min-w-0 break-words">{active.label}</span></div>
          <div className="mt-1 pl-4 font-mono whitespace-nowrap">{formatCurrency(active.valueUsd,"USD")} ({formatSharePercent(active.share)})</div>
        </div>:null}
      </div>
      <div className="min-w-0 overflow-x-auto rounded-lg [scrollbar-width:thin]">
        <table className="w-full min-w-[490px] text-left text-xs" aria-label={`${selected.label} distribution table`}>
          <thead className="text-[11px] font-normal text-muted-foreground"><tr className="border-b border-border"><th scope="col" className="py-3 pr-4 font-normal">{selected.column}</th><th scope="col" className="px-3 py-3 text-right font-normal whitespace-nowrap">Holding Value</th><th scope="col" className="px-3 py-3 text-right font-normal">Allocation</th><th scope="col" className="py-3 pl-3 text-right font-normal whitespace-nowrap">Unrealized Gain</th></tr></thead>
          <tbody>{rows.map(row=><tr key={row.key} onMouseEnter={()=>activate(row)} onMouseLeave={()=>setHover(null)} className={cn("border-b border-border/60 last:border-0",hover===row.key&&"bg-white/[0.035]")}>
            <th scope="row" className="py-3 pr-4 font-medium"><button type="button" onFocus={()=>activate(row)} onBlur={()=>setHover(null)} onClick={()=>activate(row)} className="flex items-center gap-2 whitespace-nowrap rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="size-2 shrink-0 rounded-full" style={{backgroundColor:row.color}}/><span className={cn(view==="assets"&&"max-w-[240px] whitespace-normal rounded-md bg-white/[0.07] px-2 py-1 text-left")}>{row.label}</span></button></th>
            <td className="px-3 py-3 text-right font-mono whitespace-nowrap">{formatCurrency(row.valueUsd,"USD")}</td>
            <td className="px-3 py-3 text-right font-mono whitespace-nowrap text-muted-foreground">{formatSharePercent(row.share)}</td>
            <td className={cn("py-3 pl-3 text-right font-mono whitespace-nowrap",row.unrealizedGainUsd===null||row.unrealizedGainUsd===0?"text-muted-foreground":row.unrealizedGainUsd>0?"text-primary":"text-destructive")}>{row.unrealizedGainUsd===null?"—":`${row.unrealizedGainUsd>0?"+":""}${formatCurrency(row.unrealizedGainUsd,"USD")}`}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>}
  </section>;
}

function DistributionLabel({ row, angle }: { row: DistributionRow; angle: number }) {
  const percentage = point(angle, 190);
  const anchor = point(angle, 243);
  const nearVertical = Math.abs(Math.cos(angle)) < 0.35;
  const left = anchor.x < 260;
  const width = 128;
  const height = 52;
  const closestY = Math.max(0, Math.abs(anchor.y - 260) - height / 2);
  const outsideRing = Math.sqrt(237 ** 2 - closestY ** 2);
  const x = nearVertical ? anchor.x - width / 2 : 260 + (left ? -outsideRing - width : outsideRing);
  const y = nearVertical ? (anchor.y < 260 ? 22 - height : 498) : anchor.y - height / 2;

  return (
    <g pointerEvents="none" aria-hidden="true">
      {row.share >= 4 ? (
        <text x={percentage.x} y={percentage.y} dy="0.35em" textAnchor="middle" fill="white" fontSize="16" fontWeight="500">{Math.round(row.share)}%</text>
      ) : null}
      <foreignObject data-slice-label="" x={x} y={y} width={width} height={height} visibility="hidden">
        <div className={cn("flex h-full text-[13px] leading-tight font-semibold text-muted-foreground [overflow-wrap:anywhere]",
          nearVertical ? cn("justify-center text-center", anchor.y < 260 ? "items-end" : "items-start") :
            cn("items-center", left ? "justify-end text-right" : "text-left"))}>
          <span className="min-w-0">{row.label}</span>
        </div>
      </foreignObject>
    </g>
  );
}
