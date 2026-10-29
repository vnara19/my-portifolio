
/** Verify the server-side session before exposing user-scoped investment data. */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { consumeRateLimit } from "@/lib/rate-limit";
import { getAuth } from "@/modules/auth/auth";

export type SessionUser = { id: string; name: string; email: string };


export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    return session ? { id: session.user.id, name: session.user.name, email: session.user.email } : null;
  } catch (error) {
    console.error("Could not read the session", { name: error instanceof Error ? error.name : "Unknown" });
    return null;
  }
});


export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect("/entrar");
  }

  return user;
}


export async function rejectWithoutSession(limit:{bucket:string;max:number;windowSeconds?:number}={bucket:"api",max:120}):Promise<Response|null>{
  const user=await getSessionUser();
  if(!user)return Response.json({message:"Sign in to continue."},{status:401});
  try {const result=await consumeRateLimit(user.id,limit.bucket,limit.max,limit.windowSeconds);return result.allowed?null:Response.json({message:"Too many requests. Please try again shortly."},{status:429,headers:{"Retry-After":String(result.retryAfter)}});}
  catch{return Response.json({message:"The service is temporarily unavailable."},{status:503});}
}
export async function requireMutationUser(){
  const user=await requireSessionUser();
  const result=await consumeRateLimit(user.id,"mutations",90);
  if(!result.allowed)throw new Error("Too many changes. Please wait a moment and try again.");
  return user;
}
