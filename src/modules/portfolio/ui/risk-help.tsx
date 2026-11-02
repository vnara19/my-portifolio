"use client";
import { useEffect, useRef, useState } from "react";
/** Click, keyboard and touch friendly; leaving the help or clicking elsewhere dismisses it. */
export function RiskHelp({name,children}:{name:string;children:React.ReactNode}){
 const [open,setOpen]=useState(false);
 const root=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false);};
  document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
  return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};
 },[open]);
 return <span ref={root} className="relative" onMouseLeave={()=>setOpen(false)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}>
  <button type="button" aria-label={`About ${name}`} aria-expanded={open} onClick={()=>setOpen(!open)} className="flex size-6 items-center justify-center rounded-full border border-border text-xs font-bold focus-visible:outline-2 focus-visible:outline-primary">!</button>
  {open?<span role="tooltip" className="absolute top-full -left-12 z-50 block w-56 max-w-[75vw] pt-2"><span className="block rounded-xl border border-border bg-card p-3 text-xs leading-5 text-foreground shadow-xl">{children}</span></span>:null}
 </span>;
}
