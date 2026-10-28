"use client";
import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { useState, useTransition } from "react";
import { updateTransactionAction, type EditActionResult } from "@/app/actions/edit-month";
import { DatePicker } from "@/components/ui/date-picker";
import type { PositionTransactionView } from "../application/get-position-history";
import { normalizeLocaleNumberInput } from "../presentation/portfolio-format";
import { usePositionMoney } from "./position-money-context";
import { backdropClass, centeredPopupClass, Field, inputClass, primaryButtonClass, secondaryButtonClass } from "./edit-dialogs";

/** Trade corrections retain commissions and the explicitly recorded exchange rate. */
export function TradeCorrectionDialog({entry,original,onClose,onSaved}:{entry:PositionTransactionView;original:PositionTransactionView;onClose:()=>void;onSaved:(result:EditActionResult)=>void}) {
 const {currency,formatBrl}=usePositionMoney();
 const recordedFx=new RegExp(`FX (\\d+(?:\\.\\d+)?) BRL/${currency}\\.`).exec(original.note??"")?.[1];
 const [fx,setFx]=useState(currency==="BRL"?"1":recordedFx??String(original.amountBrl/entry.amountBrl));
 const [quantity,setQuantity]=useState(String(entry.quantity));
 const nativePrice=new RegExp(`(?:Purchase|Sale): [\\d.]+ × ${currency} (\\d+(?:\\.\\d+)?);`).exec(original.note??"")?.[1];
 const [price,setPrice]=useState(nativePrice??String(Number((entry.unitPriceBrl??entry.amountBrl/entry.quantity).toFixed(8))));
 const [commission,setCommission]=useState(new RegExp(`commission ${currency} (\\d+(?:\\.\\d+)?)`).exec(original.note??"")?.[1]??"0");
 const [day,setDay]=useState(entry.occurredOn);
 const [error,setError]=useState<string|null>(null);
 const [pending,start]=useTransition();
 const number=(s:string)=>normalizeLocaleNumberInput(s)??s;
 const total=Number(number(quantity))*Number(number(price))+(entry.kind==="WITHDRAWAL"?-1:1)*Number(number(commission));
 const save=()=>start(async()=>{
  setError(null);
  const result=await updateTransactionAction({monthId:entry.monthId,transactionId:entry.id,transaction:{positionId:entry.positionId,kind:entry.kind,occurredOn:day,quantity:number(quantity),unitPriceBrl:null,amountBrl:String(original.amountBrl),note:original.note},nativeTrade:{currency,price:number(price),commission:number(commission),fxBrl:number(fx)}});
  if(result.ok){onSaved(result);onClose();}else setError(result.message);
 });
 const last=new Date(Date.UTC(Number(entry.month.slice(0,4)),Number(entry.month.slice(5,7)),0)).toISOString().slice(0,10);
 return <Dialog.Root open onOpenChange={open=>{if(!open&&!pending)onClose();}}><Dialog.Portal><Dialog.Backdrop className={backdropClass}/><Dialog.Popup className={`${centeredPopupClass} max-h-[85dvh] overflow-y-auto`}>
 <div className="flex items-start justify-between gap-3"><div><Dialog.Title className="text-base font-semibold">Edit {entry.kind==="WITHDRAWAL"?"Sale":"Purchase"}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-muted-foreground">Correct the recorded transaction.</Dialog.Description></div><Dialog.Close aria-label="Close" disabled={pending} className={secondaryButtonClass}><XIcon size={16}/></Dialog.Close></div>
 <form className="mt-5 space-y-4" onSubmit={e=>{e.preventDefault();save();}}>
 <Field label="Trade Date"><DatePicker aria-label="Trade Date" value={day} min={`${entry.month}-01`} max={last} onChange={setDay}/></Field>
 <div className="grid gap-4 sm:grid-cols-2"><Field label="Quantity"><input aria-label="Quantity" className={inputClass} inputMode="decimal" value={quantity} onChange={e=>setQuantity(e.target.value)} required/></Field><Field label={`${entry.kind==="WITHDRAWAL"?"Sale":"Purchase"} Price (${currency})`}><input aria-label="Execution Price" className={inputClass} inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)} required/></Field></div>
 <Field label={`Commission (${currency})`}><input aria-label="Commission" className={inputClass} inputMode="decimal" value={commission} onChange={e=>setCommission(e.target.value)} required/></Field>
 {currency!=="BRL"?<Field label={`Exchange Rate (BRL per ${currency})`}><input aria-label="Exchange Rate" title={recordedFx?"Exchange rate recorded with this transaction.":"Historical conversion rate. Confirm the actual transaction rate if available."} className={inputClass} inputMode="decimal" value={fx} onChange={e=>setFx(e.target.value)} required/></Field>:null}
 <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-sm"><span className="text-muted-foreground">{entry.kind==="WITHDRAWAL"?"Total Received":"Total Paid"}</span><span className="font-mono">{Number.isFinite(total)?formatBrl(total):"—"}</span></div>
 {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
 <div className="flex justify-end gap-2"><Dialog.Close className={secondaryButtonClass} disabled={pending}>Cancel</Dialog.Close><button type="submit" className={primaryButtonClass} disabled={pending||!Number.isFinite(total)||total<=0}>{pending?"Saving…":"Save Changes"}</button></div>
 </form></Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
