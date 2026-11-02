import { BankIcon, ChartLineIcon, CurrencyBtcIcon, CurrencyDollarIcon, CurrencyEurIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import type { OverviewData } from "@/modules/portfolio/application/get-overview-data";
import { formatBrl, formatCurrency } from "@/modules/portfolio/presentation/portfolio-format";
import type { SelicMonthView } from "@/modules/quotes/application/selic-reference";
import type { OverviewMarketStrip } from "@/modules/quotes/application/overview-market-strip";
import { describeSelic, formatSelic } from "@/modules/quotes/presentation/selic-format";

export function OverviewQuotes({ overview, selic, market }: { overview: OverviewData; selic: SelicMonthView | null; market:OverviewMarketStrip }) {
 const btcUsd=overview.btcRate!==null&&overview.usdRate!==null&&overview.usdRate>0?overview.btcRate/overview.usdRate:null;
 const index=(value:number|null)=>value===null?"—":new Intl.NumberFormat("en-GB",{maximumFractionDigits:2,minimumFractionDigits:2}).format(value);
 return <div className="metric-card rounded-2xl p-4 sm:p-5"><div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">
  <QuoteBadge icon={<CurrencyDollarIcon aria-hidden size={16} weight="duotone"/>} label="US Dollar" value={overview.usdRate===null?"—":formatBrl(overview.usdRate)} change={market.USD}/>
  <QuoteBadge icon={<CurrencyEurIcon aria-hidden size={16} weight="duotone"/>} label="Euro" testId="eur-month" value={overview.eurRate===null?"—":formatBrl(overview.eurRate)} change={market.EUR}/>
  <QuoteBadge icon={<CurrencyBtcIcon aria-hidden size={16} weight="duotone"/>} label="Bitcoin" testId="btc-usd-month" value={btcUsd===null?"—":formatCurrency(btcUsd,"USD")} change={market.BTC}/>
  <QuoteBadge icon={<BankIcon aria-hidden size={16} weight="duotone"/>} label="Selic Rate" value={formatSelic(selic).replace(/\s*p\.a\.$/,"")} detail={describeSelic(selic)} change={market.selic} comparison="Since Previous Rate" testId="selic-month"/>
  <QuoteBadge icon={<ChartLineIcon aria-hidden size={16}/>} label="SPX" value={index(market.spx.price)} detail={`S&P 500 Price Index · ${market.spx.asOf??"Unavailable"}`} change={market.spx.change}/>
  <QuoteBadge icon={<ChartLineIcon aria-hidden size={16}/>} label="SXXP" value={index(market.sxxp.price)} detail={`STOXX Europe 600 Price Index · ${market.sxxp.asOf??"Unavailable"}`} change={market.sxxp.change}/>
 </div></div>;
}
function QuoteBadge({icon,label,value,detail,testId,change,comparison="Previous Available Close"}:{icon:ReactNode;label:string;value:string;detail?:string;testId?:string;change:number|null;comparison?:string}){
 return <div className="flex min-w-0 items-center gap-2" title={detail} data-testid={testId}>
  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">{icon}</span>
  <div className="min-w-0"><p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">{label}</p><p className="mt-0.5 break-words font-mono text-xs text-foreground sm:text-sm">{value}</p><p title={comparison} aria-label={`${label}: change versus ${comparison}`} className={`mt-0.5 font-mono text-[11px] ${change===null||change===0?"text-muted-foreground":change>0?"text-primary":"text-destructive"}`}>{change===null?"—":`${change>0?"+":""}${change.toFixed(2)}%`}</p></div>
 </div>;
}
