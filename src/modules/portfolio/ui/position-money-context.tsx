"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { MoneyCurrency } from "../domain/position-money";
const CurrencyContext=createContext<MoneyCurrency>("BRL");
export function PositionMoneyProvider({currency,children}:{currency:MoneyCurrency;children:ReactNode}){return <CurrencyContext.Provider value={currency}>{children}</CurrencyContext.Provider>;}
export function usePositionMoney(){
 const currency=useContext(CurrencyContext);
 const formatBrl=(value:number,options?:{compact?:boolean})=>new Intl.NumberFormat("en-GB",{style:"currency",currency,notation:options?.compact?"compact":"standard",maximumFractionDigits:options?.compact?1:2}).format(value);
 const formatPriceBrl=(value:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:Math.abs(value)>=100?2:Math.abs(value)>=1?4:8}).format(value);
 const formatSignedBrl=(value:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency,maximumFractionDigits:2,signDisplay:"exceptZero"}).format(value);
 return {currency,formatBrl,formatPriceBrl,formatSignedBrl,formatEstimatedPrice:formatPriceBrl};
}
