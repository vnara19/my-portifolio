"use client";

import { useState } from "react";
import type { PortfolioDistribution, DistributionRow } from "../domain/portfolio-distribution";
import { formatCurrency } from "../presentation/portfolio-format";
import { cn } from "@/lib/utils";

const VIEWS = [{key:"assets",label:"Assets",column:"Asset"},{key:"types",label:"Asset Types",column:"Asset Type"},{key:"currencies",label:"Currency",column:"Currency"}] as const;
const formatSharePercent=(value:number)=>`${value.toFixed(2)}%`;
const point=(angle:number,radius:number)=>({x:260+Math.cos(angle)*radius,y:260+Math.sin(angle)*radius});

const LABEL_HEIGHT = 68;
const LABEL_GAP = 6;
const LABEL_WIDTH = 144;
const CHART_LEFT = -132;
const CHART_WIDTH = 784;

function placeLabels(slices: { row: DistributionRow; middle: number }[]) {
  const labels = slices.filter(({ row }) => row.share >= 4).map(({ row, middle }) => ({
    row,
    anchor: point(middle, 235),
    left: Math.cos(middle) < 0,
  }));
  const sides = [labels.filter(label => label.left), labels.filter(label => !label.left)];
  const spacing = LABEL_HEIGHT + LABEL_GAP;
  const height = Math.max(520, Math.max(...sides.map(side => side.length)) * spacing);
  const top = (520 - height) / 2;
  const first = top + spacing / 2;
  const last = top + height - spacing / 2;
  const placed = sides.flatMap(side => {
    let previous = first - spacing;
    return side.sort((a, b) => a.anchor.y - b.anchor.y).map((label, index) => {
      const y = Math.min(last - (side.length - 1 - index) * spacing, Math.max(previous + spacing, label.anchor.y));
      previous = y;
      return { ...label, y };
    });
  });
  return { placed, top, height };
}

export function PortfolioDistributionPanel({data}:{data:PortfolioDistribution}) {
  const [view,setView]=useState<typeof VIEWS[number]["key"]>("assets");
  const [hover,setHover]=useState<string|null>(null);
  const rows=data[view], active=rows.find(row=>row.key===hover);
  const selected=VIEWS.find(item=>item.key===view)!;
  const slices=rows.map((row,index)=>{const start=-Math.PI/2+rows.slice(0,index).reduce((sum,item)=>sum+item.share,0)/100*Math.PI*2;return {row,start,middle:start+row.share/100*Math.PI};});
  const labels = placeLabels(slices);
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
        <svg viewBox={`${CHART_LEFT} ${labels.top} ${CHART_WIDTH} ${labels.height}`} className="block h-auto w-full overflow-hidden" role="group" aria-label={`${selected.label} distribution`}>
          <text x="260" y="251" textAnchor="middle" fill="currentColor" fontSize="29" fontWeight="600">{data.assetCount}</text>
          <text x="260" y="280" textAnchor="middle" fill="var(--muted-foreground)" fontSize="16" fontWeight="500">Total Assets</text>
          {slices.map(({row,start,middle})=>{
            const circumference=2*Math.PI*190, length=row.share/100*circumference;
            const percentage=point(middle,190);
            return <g key={row.key}>
              {hover===row.key?<circle cx="260" cy="260" r="190" fill="none" stroke={row.color} strokeWidth="90" strokeOpacity="0.22" strokeDasharray={`${length} ${circumference-length}`} transform={`rotate(${start*180/Math.PI} 260 260)`}/>:null}
              <circle data-distribution-slice={row.key} cx="260" cy="260" r="190" fill="none" stroke={row.color} strokeWidth="64" strokeDasharray={`${length} ${circumference-length}`} transform={`rotate(${start*180/Math.PI} 260 260)`} tabIndex={0} role="img" aria-label={`${row.label}: ${formatCurrency(row.valueUsd,"USD")}, ${formatSharePercent(row.share)}`} onMouseEnter={()=>activate(row)} onFocus={()=>activate(row)} onBlur={()=>setHover(null)} className="outline-none"/>
              {row.share>=6?<text x={percentage.x} y={percentage.y} dy="0.35em" textAnchor="middle" fill="white" fontSize="16" fontWeight="500" pointerEvents="none">{Math.round(row.share)}%</text>:null}
            </g>;
          })}
          {labels.placed.map(label => <DistributionLabel key={label.row.key} {...label} />)}
        </svg>
        {active&&tooltipAnchor?<div role="tooltip" style={{left:`${(tooltipAnchor.x-CHART_LEFT)/CHART_WIDTH*100}%`,top:`${(tooltipAnchor.y-labels.top)/labels.height*100}%`,transform:`translate(${tooltipAnchor.x>260?"-100%":"0"}, -100%)`}} className="pointer-events-none absolute z-10 w-max max-w-[80%] rounded-md border border-white/10 bg-[#292929] px-3 py-2.5 text-xs shadow-xl">
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

function DistributionLabel({ row, anchor, left, y }: ReturnType<typeof placeLabels>["placed"][number]) {
  const elbow = left ? 24 : 496;
  const edge = left ? 12 : 508;
  return (
    <g pointerEvents="none" aria-hidden="true">
      <path d={`M ${anchor.x} ${anchor.y} H ${elbow} L ${edge} ${y}`} fill="none" stroke={row.color} strokeOpacity="0.55" />
      <foreignObject x={left ? edge - LABEL_WIDTH : edge} y={y - LABEL_HEIGHT / 2} width={LABEL_WIDTH} height={LABEL_HEIGHT}>
        <div className={cn("flex h-full items-center px-1.5 text-[13px] leading-tight font-semibold text-muted-foreground [overflow-wrap:anywhere]", left ? "justify-end text-right" : "text-left")}>
          <span className="min-w-0">{row.label}</span>
        </div>
      </foreignObject>
    </g>
  );
}
