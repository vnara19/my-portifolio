"use client";
import { useCallback, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { removeTransactionAction, undoChangeAction, type EditActionResult } from "@/app/actions/edit-month";
import type { PortfolioLedger } from "../application/get-portfolio-ledger";
import type { PositionTransactionView } from "../application/get-position-history";
import type { MoneyCurrency } from "../domain/position-money";
import { CollapsibleSection } from "./collapsible-section";
import { PositionMoneyProvider, usePositionMoney } from "./position-money-context";
import { PositionTransactions } from "./position-transactions";
import { TradeCorrectionDialog } from "./trade-correction-dialog";
import { PositionTransactionDialog, transactionMonthOf } from "./position-transaction-dialog";
import { EditToast, type EditToastState } from "./edit-toast";
import { monthLabel } from "../presentation/position-page";
import { formatPercent } from "../presentation/portfolio-format";
import { cn } from "@/lib/utils";

export function PortfolioLedgerPanel(props:{ledger:PortfolioLedger;selectedMonth:string}){
 return <PositionMoneyProvider currency="USD"><PortfolioLedgerContent {...props}/></PositionMoneyProvider>;
}
function PortfolioLedgerContent({ledger,selectedMonth}:{ledger:PortfolioLedger;selectedMonth:string}){
 const router=useRouter();const params=useSearchParams();
 const {formatBrl,formatSignedBrl}=usePositionMoney();
 const [selected,setSelected]=useState<PositionTransactionView|null>(null);
 const [toast,setToast]=useState<EditToastState|null>(null);
 const [removing,startRemove]=useTransition();const [undoing,startUndo]=useTransition();const seq=useRef(0);
 const dismiss=useCallback(()=>setToast(null),[]);
 const notify=(result:EditActionResult)=>{setToast({id:++seq.current,tone:result.ok?"success":"error",message:result.message,undoToken:result.ok?result.undoToken:undefined});if(result.ok)router.refresh();};
 const original=selected?ledger.originals.find(t=>t.id===selected.id):null;
 const native=selected?ledger.editEntries.find(t=>t.id===selected.id):null;
 const target=selected?.positionId?ledger.targets[selected.positionId]:null;
 const currency:MoneyCurrency=selected?.assetType==="crypto"?"USD":selected?.baseCurrency==="EUR"?"EUR":selected?.baseCurrency==="USD"?"USD":"BRL";
 const trade=Boolean(selected?.quoteSymbol && selected.quoteSymbol!=="USD" && (selected.kind==="CONTRIBUTION"||selected.kind==="WITHDRAWAL"));
 const cash=(value:number|null,signed=false)=>value===null?"\u2014":signed?formatSignedBrl(value):formatBrl(value);
 return <>
 <CollapsibleSection id="portfolio-months" title="Month By Month" summary={`${ledger.rows.length} ${ledger.rows.length === 1 ? "month" : "months"}`} testId="portfolio-months-section">
 <div className="overflow-x-auto"><table className="w-full min-w-[700px] border-collapse text-left" data-testid="portfolio-months"><thead><tr className="border-b border-border/60 text-[9px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
 <th className="px-5 py-3">Reporting Month</th><th className="px-4 py-3 text-right">Value (USD)</th><th className="px-4 py-3 text-right">Change</th><th className="px-4 py-3 text-right" title="Change in value excluding contributions, withdrawals and opening balance adjustments. Includes prices, interest and currency movements.">Investment Change</th><th className="px-5 py-3 text-right">Contributions and Redemptions</th>
 </tr></thead><tbody>{[...ledger.rows].reverse().map(row=>{const query=new URLSearchParams(params.toString());query.set("mes",row.month);return <tr key={row.month} aria-current={row.month===selectedMonth?"date":undefined} className={cn("border-b border-border/55 align-top text-xs",row.month===selectedMonth?"bg-primary/5":"hover:bg-white/[0.018]")}>
 <td className="px-5 py-3"><Link scroll={false} className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-primary" href={`/posicoes?${query}`}>{monthLabel(row.month)}</Link></td>
 <td className="px-4 py-3 text-right font-mono" title={row.estimated?"Some historical movements use monthly exchange rates or inferred funding.":undefined}>{cash(row.value)}</td>
 <td className="px-4 py-3 text-right font-mono"><p>{cash(row.change,true)}</p>{row.changePercent!==null?<p className="mt-1 text-[10px] text-muted-foreground">{formatPercent(row.changePercent)}</p>:null}</td>
 <td className={cn("px-4 py-3 text-right font-mono",row.investmentChange!==null&&row.investmentChange>0?"text-primary":row.investmentChange!==null&&row.investmentChange<0?"text-destructive":"text-muted-foreground")} title={row.investmentChange===null?"The transaction or exchange-rate history is incomplete.":undefined}>{cash(row.investmentChange,true)}</td>
 <td className="px-5 py-3 text-right font-mono"><p>{cash(row.flow,true)}</p>{row.opening!==null&&Math.abs(row.opening)>0.005?<p className="mt-1 text-[10px] text-muted-foreground">Opening Balance {cash(row.opening,true)}</p>:null}</td>
 </tr>;})}</tbody></table></div>
 </CollapsibleSection>
 <PositionTransactions transactions={ledger.transactions} selectedMonth={selectedMonth} defaultPeriod={params.has("mes")?"month":"all"} quoted dollars={false} editableMonthId="all" editableAccountId={null} showAssets removing={removing} onEdit={entry=>{const edit=ledger.editEntries.find(t=>t.id===entry.id);if(edit?.moneyUnavailable){notify({ok:false,message:"The historical exchange rate for this transaction is unavailable."});return;}setSelected(entry);}} onRemove={entry=>startRemove(async()=>notify(await removeTransactionAction({monthId:entry.monthId,transactionId:entry.id})))}/>
 {selected&&original&&native&&target?(trade?<PositionMoneyProvider currency={currency}><TradeCorrectionDialog key={selected.id} entry={native} original={original} onClose={()=>setSelected(null)} onSaved={notify}/></PositionMoneyProvider>:<PositionTransactionDialog open onOpenChange={open=>{if(!open)setSelected(null);}} target={target} edit={original} formKey={0} month={transactionMonthOf(original.monthId,new Date(`${original.month}-01T00:00:00Z`))} onSaved={notify}/>):null}
 <EditToast toast={toast} onDismiss={dismiss} onUndo={token=>startUndo(async()=>notify(await undoChangeAction(token)))} undoing={undoing}/>
 </>;
}
