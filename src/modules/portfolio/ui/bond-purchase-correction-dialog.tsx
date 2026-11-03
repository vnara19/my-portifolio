"use client";
import { Dialog } from "@base-ui/react/dialog";
import { useState, useTransition } from "react";
import { correctBondPurchaseAction } from "@/app/actions/international-bonds";
import type { EditActionResult } from "@/app/actions/edit-month";
import type { PositionTransactionView } from "../application/get-position-history";
import { normalizeLocaleNumberInput } from "../presentation/portfolio-format";
import { DatePicker } from "@/components/ui/date-picker";
import { backdropClass, centeredPopupClass, Field, inputClass, primaryButtonClass, secondaryButtonClass } from "./edit-dialogs";
export function BondPurchaseCorrectionDialog({ entry, onClose, onSaved }: { entry: PositionTransactionView; onClose: () => void; onSaved: (result: EditActionResult) => void }) {
 const bond = entry.bondPurchase!;
 const [units,setUnits] = useState(String(Number(bond.faceAmount) / Number(bond.faceValuePerBond)));
 const [paid,setPaid] = useState(bond.totalPaid);
 const [interest,setInterest] = useState(String(Number(bond.accruedInterestPaid) / (Number(bond.faceAmount) / Number(bond.faceValuePerBond))));
 const [day,setDay] = useState(bond.settlementDate);
 const [error,setError] = useState<string|null>(null);
 const [pending,start] = useTransition();
 const field = (label:string,value:string,set:(value:string)=>void) => <Field label={label}><input aria-label={label} className={inputClass} inputMode="decimal" value={value} onChange={e=>set(e.target.value)} required/></Field>;
 return <Dialog.Root open onOpenChange={open=>{if(!open&&!pending)onClose();}}><Dialog.Portal><Dialog.Backdrop className={backdropClass}/><Dialog.Popup className={centeredPopupClass}>
 <Dialog.Title className="text-base font-semibold">Edit Bond Purchase</Dialog.Title><Dialog.Description className="mt-1 text-xs text-muted-foreground">{bond.issuer}</Dialog.Description>
 <form className="mt-5 space-y-4" onSubmit={e=>{e.preventDefault();start(async()=>{setError(null);const result=await correctBondPurchaseAction({monthId:entry.monthId,transactionId:entry.id,date:day,units:normalizeLocaleNumberInput(units)??units,totalPaid:normalizeLocaleNumberInput(paid)??paid,accruedPerBond:normalizeLocaleNumberInput(interest)??interest});if(result.ok){onSaved(result);onClose();}else setError(result.message);});}}>
 <Field label="Purchase Date"><DatePicker aria-label="Purchase Date" value={day} onChange={setDay}/></Field>
 {field("Number of Bonds",units,setUnits)}{field(`Total Paid, Including Fees (${bond.currency})`,paid,setPaid)}{field(`Interest Paid at Purchase / Bond (${bond.currency})`,interest,setInterest)}
 {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
 <div className="flex justify-end gap-2"><button type="button" disabled={pending} className={secondaryButtonClass} onClick={onClose}>Cancel</button><button type="submit" disabled={pending} className={primaryButtonClass}>{pending?"Saving…":"Save Changes"}</button></div>
 </form></Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
