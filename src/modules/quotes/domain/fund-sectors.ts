import { z } from "zod";
import type { SectorExposure } from "@/modules/portfolio/domain/sector-exposure";
const fraction=z.object({raw:z.number().finite().min(0).max(1)});
const schema=z.object({quoteSummary:z.object({result:z.array(z.object({topHoldings:z.object({sectorWeightings:z.array(z.record(z.string(),fraction)),stockPosition:fraction,cashPosition:fraction.optional(),bondPosition:fraction.optional(),otherPosition:fraction.optional(),preferredPosition:fraction.optional(),convertiblePosition:fraction.optional()})})).min(1)})});
const names:Record<string,string>={realestate:"Real Estate",consumer_cyclical:"Consumer Discretionary",basic_materials:"Materials",consumer_defensive:"Consumer Staples",technology:"Information Technology",communication_services:"Communication Services",financial_services:"Financials",utilities:"Utilities",industrials:"Industrials",energy:"Energy",healthcare:"Health Care"};
/** Yahoo reports equity-sector weights separately from the fund's asset mix. */
export function parseFundSectors(payload:unknown,symbol:string,retrievedAt:string):SectorExposure|null {
 const parsed=schema.safeParse(payload);if(!parsed.success)return null;
 const top=parsed.data.quoteSummary.result[0].topHoldings;
 if(top.stockPosition.raw<=0)return null;
 const entries=top.sectorWeightings.flatMap(row=>Object.entries(row));
 if(new Set(entries.map(([key])=>key)).size!==entries.length||entries.some(([key])=>!names[key]))return null;
 const sum=entries.reduce((s,[,v])=>s+v.raw,0);
 if(sum<0.98||sum>1.02)return null;
 const equity=top.stockPosition.raw*100;
 const weights=entries.filter(([,v])=>v.raw>0).map(([key,v])=>({sector:names[key],weight:v.raw/sum*equity}));
 const cash=(top.cashPosition?.raw??0)*100,bonds=(top.bondPosition?.raw??0)*100;
 if(cash>0)weights.push({sector:"Cash & Savings",weight:cash});
 if(bonds>0)weights.push({sector:"Bonds",weight:bonds});
 const known=weights.reduce((s,w)=>s+w.weight,0);
 if(known>100.1)return null;
 if(known<100)weights.push({sector:"Sector Unavailable",weight:100-known});
 if(known>100)for(const weight of weights)weight.weight=weight.weight/known*100;
 return {weights,sources:[{label:`${symbol} · Yahoo Finance fund composition`,url:`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/holdings/`,retrievedAt,note:"Provider-reported fund sectors, mapped to common sector labels. Retrieval date is not the holdings publication date, which the provider does not supply. Equity weights are applied only to the equity portion; cash, bonds and unclassified exposure remain separate."}]};
}
