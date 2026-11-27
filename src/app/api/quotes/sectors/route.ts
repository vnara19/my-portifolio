import { z } from "zod";
import { limitedJson } from "@/lib/request-body";
import { rejectForeignRequest } from "@/lib/same-origin-request";
import { rejectWithoutSession } from "@/modules/auth/session";
import { getFundSectors } from "@/modules/quotes/infrastructure/yahoo-fund-sectors";
export const runtime="nodejs";
export const maxDuration=60;
const schema=z.object({symbols:z.array(z.string().regex(/^[A-Z0-9^][A-Z0-9.^=-]{0,29}$/)).max(40)});
export async function POST(request:Request){
 const rejected=rejectForeignRequest(request)??await rejectWithoutSession({bucket:"fund-sectors",max:30});if(rejected)return rejected;
 let input;try{input=schema.safeParse(await limitedJson(request,8192));}catch{return Response.json({message:"Invalid request."},{status:400});}
 if(!input.success)return Response.json({message:"Invalid symbols."},{status:400});
 const symbols=[...new Set(input.data.symbols)];
 const results:Record<string,Awaited<ReturnType<typeof getFundSectors>>>={};
 // Bound concurrency and tolerate missing symbols without dropping other funds.
 for(let i=0;i<symbols.length;i+=8)await Promise.all(symbols.slice(i,i+8).map(async symbol=>{try{results[symbol]=await getFundSectors(symbol);}catch{results[symbol]=null;}}));
 return Response.json({exposures:results},{headers:{"Cache-Control":"private, no-store"}});
}
