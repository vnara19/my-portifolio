"use client";
import NumberFlow from "@number-flow/react";
import { KpiCard } from "@/components/product/kpi-card";
import type { OverviewData } from "../application/get-overview-data";
import type { OverviewPerformanceMetrics } from "../domain/overview-performance-metrics";
import { formatCurrency } from "../presentation/portfolio-format";
const percent=(value:number|null)=>value===null?"—":new Intl.NumberFormat("en-GB",{style:"percent",maximumFractionDigits:2,signDisplay:"exceptZero"}).format(value/100);
const money=(value:number|null,currency:"USD"|"EUR"="USD",signed=true)=>value===null?"—":formatCurrency(value,currency,signed);
export function OverviewKpis({overview,metrics,metricsEur}:{overview:OverviewData;metrics:OverviewPerformanceMetrics;metricsEur:OverviewPerformanceMetrics}){
 const total=overview.reporting.total,gains=overview.gains,eur=overview.gainsEur;
 const reason=gains.issue==="historical-fx"?"Historical exchange rates are missing.":gains.issue==="ledger-mismatch"?"Transactions do not reconcile with current holdings.":"Complete purchase history is needed.";
 const secondary=(value:number|null|undefined,percentage:number|null|undefined,explanation:string)=>value==null?null:<span className="flex flex-wrap gap-x-2 font-mono" data-currency="EUR" title={explanation}><span>{money(value,"EUR")}</span>{percentage!=null?<span aria-label={`EUR return ${percent(percentage)}`}>{percent(percentage)}</span>:null}</span>;
 return <section aria-label="Portfolio summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
  <KpiCard compact label="Portfolio Value" testId="portfolio-total" valueText={money(total.USD,"USD",false)} value={total.USD===null?"—":<NumberFlow value={total.USD} format={{style:"currency",currency:"USD",currencyDisplay:"code",maximumFractionDigits:2}} locales="en-GB"/>} detail={<span className="flex flex-wrap gap-x-3 gap-y-1 font-mono"><span data-currency="EUR">{money(total.EUR,"EUR",false)}</span><span data-currency="BRL">{formatCurrency(total.BRL,"BRL")}</span></span>}/>
  <GainCard label="Unrealized Gain" testId="unrealized-gain" value={gains.unrealizedUsd} percentage={gains.unrealizedPercent}
   percentageTitle="USD gain divided by remaining USD purchase principal, using acquisition-date exchange rates."
   detail={gains.unrealizedUsd===null?reason:<>{secondary(eur?.unrealizedUsd,eur?.unrealizedPercent,"EUR gain divided by remaining EUR purchase principal. This is an independently measured EUR return using acquisition-date exchange rates.")}<span className="mt-1 block" title={metrics.asOf?`Open positions · ${metrics.asOf}`:undefined}>Last Day (USD) <span className="font-mono">{money(metrics.dailyUsd)} · {percent(metrics.dailyPercent)}</span></span></>}/>
  <GainCard label="Realized Gain" testId="realized-gain" value={gains.realizedUsd} percentage={gains.realizedPercent}
   percentageTitle="Realized result including commissions, divided by all recorded purchase amounts including fees, measured in USD. This ratio is not TWR."
   detail={gains.realizedUsd===null?reason:secondary(eur?.realizedUsd,eur?.realizedPercent,"Realized result divided by all recorded purchase amounts including fees, measured in EUR. This ratio is not TWR.")}/>
  <GainCard label="Total Gain" testId="total-gain" value={gains.totalUsd} percentage={metrics.totalPercent}
   percentageTitle="USD time-weighted return (TWR): purchases and redemptions are external cash flows, not investment gains or losses."
   detail={gains.totalUsd===null?reason:<>{secondary(eur?.totalUsd,metricsEur.totalPercent,"EUR time-weighted return (TWR), using EUR values and dated EUR cash flows.")}<span className="mt-1 block" title="XIRR based on dated investment funding and current value, independently measured in each currency.">Annualized Yield <span className="block font-mono">USD {percent(metrics.annualizedPercent)} · EUR {percent(metricsEur.annualizedPercent)}</span></span></>}/>
 </section>;
}
function GainCard({label,testId,value,percentage,percentageTitle,detail}:{label:string;testId:string;value:number|null;percentage?:number|null;percentageTitle:string;detail:React.ReactNode}){
 return <KpiCard compact label={label} testId={testId} tone={value===null||value===0?"neutral":value>0?"up":"down"} valueText={money(value)} valueClassName="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xl" value={<><span>{money(value)}</span>{percentage!=null?<span className="text-sm" title={percentageTitle} aria-label={`USD return ${percent(percentage)}`}>{percent(percentage)}</span>:null}</>} detail={detail}/>;
}
