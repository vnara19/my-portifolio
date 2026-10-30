"use client";
import NumberFlow from "@number-flow/react";
import { KpiCard } from "@/components/product/kpi-card";
import type { OverviewData } from "../application/get-overview-data";
import type { OverviewPerformanceMetrics } from "../domain/overview-performance-metrics";
import { formatCurrency } from "../presentation/portfolio-format";
const percent=(value:number|null)=>value===null?"—":new Intl.NumberFormat("en-GB",{style:"percent",minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:"exceptZero"}).format(value/100);
const money=(value:number|null,currency:"USD"|"EUR"="USD",signed=true)=>value===null?"—":formatCurrency(value,currency,signed);
export function OverviewKpis({overview,metrics}:{overview:OverviewData;metrics:OverviewPerformanceMetrics}){
 const total=overview.reporting.total,gains=overview.gains,eur=overview.gainsEur;
 const reason=gains.issue==="historical-fx"?"Historical exchange rates are missing.":gains.issue==="ledger-mismatch"?"Transactions do not reconcile with current holdings.":"Complete purchase history is needed.";
 const secondary=(value:number|null|undefined,explanation:string)=>value==null?null:<span className="flex flex-wrap gap-x-2 font-mono" data-currency="EUR" title={explanation}><span>{money(value,"EUR")}</span></span>;
 return <section aria-label="Portfolio summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
  <KpiCard compact label="Portfolio Value" testId="portfolio-total" valueText={money(total.USD,"USD",false)} value={total.USD===null?"—":<NumberFlow value={total.USD} format={{style:"currency",currency:"USD",currencyDisplay:"code",maximumFractionDigits:2}} locales="en-GB"/>} detail={<span className="flex flex-wrap gap-x-3 gap-y-1 font-mono"><span data-currency="EUR">{money(total.EUR,"EUR",false)}</span><span data-currency="BRL">{formatCurrency(total.BRL,"BRL")}</span></span>}/>
  <GainCard label="Unrealized Gain" testId="unrealized-gain" value={gains.unrealizedUsd} percentage={gains.unrealizedPercent}
   percentageTitle="Whole-portfolio gain divided by remaining purchase principal in the EUR reference currency. The amount is displayed as its current USD equivalent."
   detail={gains.unrealizedUsd===null?reason:<>{secondary(eur?.unrealizedUsd,"The same whole-portfolio gain in EUR. The USD line is its current-rate equivalent; the percentage is shared.")}<span className="mt-1 block" title={metrics.asOf?`Whole portfolio · ${metrics.asOf} · EUR-reference daily result expressed in USD` :undefined}>Last Day <span className="font-mono">{money(metrics.dailyUsd)} · {percent(metrics.dailyPercent)}</span></span></>}/>
  <GainCard label="Realized Gain" testId="realized-gain" value={gains.realizedUsd} percentage={gains.realizedPercent}
   percentageTitle="Whole-portfolio realized result including commissions divided by cumulative purchase payments, in EUR. The amount is displayed as its current USD equivalent. This ratio is not TWR."
   detail={gains.realizedUsd===null?reason:secondary(eur?.realizedUsd,"The same whole-portfolio realized result in EUR. Both displayed currencies share one return percentage.")}/>
  <GainCard label="Total Gain" testId="total-gain" value={gains.totalUsd} percentage={metrics.totalPercent}
   percentageTitle="Portfolio time-weighted return (TWR) in the common EUR reference currency. USD is the display equivalent; purchases and redemptions are not gains or losses."
   detail={gains.totalUsd===null?reason:<>{secondary(eur?.totalUsd,"The same total portfolio gain in EUR. TWR is measured once in the EUR reference and is shared by both displayed currencies.")}<span className="mt-1 block" title="XIRR from dated whole-portfolio funding and value in the common EUR reference currency.">Annualized Yield <span className="font-mono">{percent(metrics.annualizedPercent)}</span></span></>}/>
 </section>;
}
function GainCard({label,testId,value,percentage,percentageTitle,detail}:{label:string;testId:string;value:number|null;percentage?:number|null;percentageTitle:string;detail:React.ReactNode}){
 return <KpiCard compact label={label} testId={testId} tone={value===null||value===0?"neutral":value>0?"up":"down"} valueText={money(value)} valueClassName="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xl" value={<><span>{money(value)}</span>{percentage!=null?<span className="text-sm" title={percentageTitle} aria-label={`Portfolio return ${percent(percentage)}`}>{percent(percentage)}</span>:null}</>} detail={detail}/>;
}
