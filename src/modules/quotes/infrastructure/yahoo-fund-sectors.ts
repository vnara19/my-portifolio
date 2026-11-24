import { unstable_cache } from "next/cache";
import { limitedBytes } from "@/lib/request-body";
import { parseFundSectors } from "../domain/fund-sectors";
import { fetchProvider } from "./http";
const headers={"user-agent":"Mozilla/5.0 (compatible; my-portfolio/1.0)"};
type ProviderSession={cookie:string;crumb:string};
let session:Promise<ProviderSession>|null=null;
let sessionUntil=0;
async function read(url:string,extra:Record<string,string>={}) {
 const response=await fetchProvider(url,{headers:{...headers,...extra},cache:"no-store",signal:AbortSignal.timeout(6000)});
 return response;
}
async function getSession():Promise<ProviderSession>{
 if(session&&sessionUntil>Date.now())return session;
 sessionUntil=Date.now()+30*60_000;
 session=(async()=>{
  const response=await read("https://fc.yahoo.com");
  const cookie=response.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
  await response.body?.cancel();if(!cookie)throw new Error("Fund provider session unavailable");
  const crumbResponse=await read("https://query1.finance.yahoo.com/v1/test/getcrumb",{cookie});
  const crumb=new TextDecoder().decode(await limitedBytes(crumbResponse.body,4096));
  if(!crumbResponse.ok||!crumb||crumb.length>256||crumb.includes("<"))throw new Error("Fund provider session refused");
  return {cookie,crumb};
 })().catch(error=>{session=null;sessionUntil=0;throw error;});
 return session;
}
/** Cache contains public composition only, never accounts, balances or credentials. */
export const getFundSectors=unstable_cache(async(symbol:string)=>{
 const credentials=await getSession();
 const url=`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=topHoldings&crumb=${encodeURIComponent(credentials.crumb)}`;
 const response=await read(url,{cookie:credentials.cookie});
 if(response.status===401||response.status===403){session=null;sessionUntil=0;}
 if(!response.ok){await response.body?.cancel();throw new Error("Fund composition unavailable");}
 const payload=JSON.parse(new TextDecoder().decode(await limitedBytes(response.body,2_000_000)));
 return parseFundSectors(payload,symbol,new Date().toISOString());
},["fund-sector-composition-v2"],{revalidate:86400});
