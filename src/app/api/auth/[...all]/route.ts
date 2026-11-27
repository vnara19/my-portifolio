import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/modules/auth/auth";
import { limitedBytes, BodyLimitError } from "@/lib/request-body";
const handlers=toNextJsHandler((request)=>getAuth().handler(request));
export const GET=handlers.GET;
export async function POST(request:Request){
 try {
  const bytes=await limitedBytes(request.body,16_384,request.headers.get("content-length"));
  const headers=new Headers(request.headers);headers.delete("content-length");
  return handlers.POST(new Request(request.url,{method:"POST",headers,body:bytes.buffer as ArrayBuffer}));
 }catch(error){if(error instanceof BodyLimitError)return Response.json({message:"Request is too large."},{status:413});throw error;}
}
