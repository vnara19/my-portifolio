"use client";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowsDownUpIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSavingsManagerAction } from "@/app/actions/savings";
import { SavingsManager } from "./savings-form";
import { backdropClass, centeredPopupClass, secondaryButtonClass } from "./edit-dialogs";
import type { Savings, SavingsCalculation } from "../domain/savings";

/** Savings movements are entered from Positions, regardless of the month being viewed. */
export function SavingsMovementButton({assetId,name}:{assetId:string;name:string}) {
 const router=useRouter();
 const [open,setOpen]=useState(false);
 const [pending,start]=useTransition();
 const [data,setData]=useState<{terms:Savings;state:SavingsCalculation|null}|null>(null);
 const [message,setMessage]=useState<string|null>(null);
 return <><button type="button" className={secondaryButtonClass} onClick={()=>{setOpen(true);setData(null);setMessage(null);start(async()=>{const result=await getSavingsManagerAction(assetId);if(result.ok)setData(result);else setMessage(result.message);});}}><ArrowsDownUpIcon size={14} aria-hidden="true"/>Add / Withdraw</button>
 <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Backdrop className={backdropClass}/><Dialog.Popup className={`${centeredPopupClass} max-h-[85dvh] overflow-y-auto`}>
 <header className="flex items-start justify-between gap-3"><div><Dialog.Title className="text-base font-semibold">{name}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-muted-foreground">Record a dated Savings movement.</Dialog.Description></div><Dialog.Close aria-label="Close" className={secondaryButtonClass}><XIcon size={16}/></Dialog.Close></header>
 {pending ? <p role="status" className="mt-5 text-sm text-muted-foreground">Loading Savings…</p>:null}
 {message ? <p role="status" className="mt-4 text-sm">{message}</p>:null}
 {data ? <SavingsManager assetId={assetId} {...data} onSaved={result=>{setMessage(result.message);if(result.ok){setOpen(false);router.refresh();}}}/>:null}
 </Dialog.Popup></Dialog.Portal></Dialog.Root></>;
}
