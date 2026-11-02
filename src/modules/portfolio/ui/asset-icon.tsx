"use client";
import { useState } from "react";
import { assetIcon } from "../domain/asset-icon";

export function AssetIcon({symbol,name="",assetType=null,quoteSymbol=null}:{symbol:string;name?:string;assetType?:string|null;quoteSymbol?:string|null}){
 const source=assetIcon(symbol,name,assetType,quoteSymbol);
 const [failed,setFailed]=useState<string|null>(null);
 return <span className={`flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold ${source&&failed!==source?"bg-white":"bg-muted"}`} aria-hidden="true">
  {source&&failed!==source?/* eslint-disable-next-line @next/next/no-img-element -- Small local issuer icons and explicitly selected public image endpoints. */
   <img src={source} alt="" width={28} height={28} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(source)} className="size-7 rounded-full object-contain"/>:symbol.replace(/[^a-z0-9]/gi,"").slice(0,2)}
 </span>;
}
