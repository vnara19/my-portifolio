"use client";
import NumberFlow from "@number-flow/react";
import { KpiCard } from "@/components/product/kpi-card";
import type { OverviewData } from "../application/get-overview-data";
import type { OverviewPerformanceMetrics } from "../domain/overview-performance-metrics";
import { formatCurrency } from "../presentation/portfolio-format";
const percent=(value:number|null)=>value===null?"—":new Intl.NumberFormat("en-GB",{style:"percent",minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:"exceptZero"}).format(value/100);
const money=(value:number|null,currency:"USD"|"EUR"="USD",signed=true)=>value===null?"—":formatCurrency(value,currency,signed);
export function OverviewKpis({overview,metrics}:{overview:OverviewData;metrics:OverviewPerformanceMetrics}){
 const total=overview.reporting.total,gains=overview.gains;
 const reason=gains.issue==="historical-fx"?"Historical exchange rates are missing.":gains.issue==="ledger-mismatch"?"Transactions do not reconcile with current holdings.":"Complete purchase history is needed.";
 const annualizedReason = {
  "insufficient-data": "More dated cash flows and a terminal valuation are needed.",
  "no-solution": "No annualized return satisfies these cash flows.",
  "multiple-solutions": "The cash flows have multiple annualized returns.",
  unresolved: "The annualized return could not be determined reliably.",
  unique: "XIRR from dated whole-portfolio funding and value in USD.",
 }[metrics.annualizedStatus];
 return <section aria-label="Portfolio summary" className="grid auto-rows-fr gap-3 min-[520px]:grid-cols-2 min-[960px]:grid-cols-4 [&>article]:h-full [&>article]:min-h-[132px] [&>article]:min-w-0">
  <KpiCard compact valueClassName="text-xl" label="Portfolio Value" testId="portfolio-total" valueText={money(total.USD,"USD",false)} value={total.USD===null?"—":<NumberFlow value={total.USD} format={{style:"currency",currency:"USD",currencyDisplay:"code",maximumFractionDigits:2}} locales="en-GB"/>} detail={<span className="flex flex-wrap gap-x-3 gap-y-1 font-mono"><span data-currency="EUR">{money(total.EUR,"EUR",false)}</span><span data-currency="BRL">{formatCurrency(total.BRL,"BRL")}</span></span>}/>
  <GainCard label="Unrealized Gain" testId="unrealized-gain" value={gains.unrealizedUsd} percentage={gains.unrealizedPercent} percentageTitle="Unrealized return in the USD reference currency." detail={gains.unrealizedUsd===null?reason:<span className="mt-1 block">Last Day <span className="font-mono">{money(metrics.dailyUsd)} · {percent(metrics.dailyPercent)}</span></span>}/>
  <GainCard label="Realized Gain" testId="realized-gain" value={gains.realizedUsd} percentage={gains.realizedPercent} percentageTitle="Realized return, including commissions, in the USD reference currency." detail={gains.realizedUsd===null?reason:null}/>
  <GainCard label="Total Gain" testId="total-gain" value={gains.totalUsd} percentage={metrics.totalPercent}
   percentageTitle="Portfolio time-weighted return (TWR) in the USD reference currency. purchases and redemptions are not gains or losses."
   detail={gains.totalUsd===null?reason:<span className="mt-1 block" title={annualizedReason}>Annualized Yield <span className="font-mono">{percent(metrics.annualizedPercent)}</span>{metrics.annualizedStatus !== "unique" && <span className="sr-only"> {annualizedReason}</span>}</span>}/>

 </section>;
}
function GainCard({label,testId,value,percentage,percentageTitle,detail}:{label:string;testId:string;value:number|null;percentage?:number|null;percentageTitle:string;detail:React.ReactNode}){
 return <KpiCard compact label={label} testId={testId} tone={value===null||value===0?"neutral":value>0?"up":"down"} valueText={money(value)} valueClassName="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xl" value={<><span>{money(value)}</span>{percentage!=null?<span className="text-sm" title={percentageTitle} aria-label={`Portfolio return ${percent(percentage)}`}>{percent(percentage)}</span>:null}</>} detail={detail}/>;
}
