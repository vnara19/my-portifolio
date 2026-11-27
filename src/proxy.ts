
/** Protect investment pages with application authentication while preserving safe internal redirects. */
import { contentSecurityPolicy } from "@/lib/security-policy";
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";


export function proxy(request: NextRequest) {
  const {pathname,search}=request.nextUrl;
  const publicPage=pathname === "/entrar";
  const nonce=Buffer.from(crypto.randomUUID()).toString("base64");
  const policy=contentSecurityPolicy(nonce,process.env.NODE_ENV === "development");
  const requestHeaders=new Headers(request.headers);
  requestHeaders.set("x-nonce",nonce);
  requestHeaders.set("Content-Security-Policy",policy);
  let response:NextResponse;
  if(publicPage || getSessionCookie(request))response=NextResponse.next({request:{headers:requestHeaders}});
  else if(pathname.startsWith("/api/"))response=NextResponse.json({message:"Sign in to continue."},{status:401});
  else {const target=request.nextUrl.clone();target.pathname="/entrar";target.search="";if(pathname!=="/"||search)target.searchParams.set("para",`${pathname}${search}`);response=NextResponse.redirect(target);}
  response.headers.set("Content-Security-Policy",policy);
  response.headers.set("Cache-Control","private, no-store");
  return response;
}

export const config = {


  matcher: ["/((?!api/auth|api/health|_next/static|_next/image|icon\\.svg|favicon\\.ico).*)"],
};
