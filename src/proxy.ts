
/** Protect investment pages with application authentication while preserving safe internal redirects. */
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";


export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ message: "Sign in to continue." }, { status: 401 });
  }

  const target = request.nextUrl.clone();
  target.pathname = "/entrar";
  target.search = "";

  if (pathname !== "/" || search) {
    target.searchParams.set("para", `${pathname}${search}`);
  }

  return NextResponse.redirect(target);
}

export const config = {


  matcher: ["/((?!api/auth|api/health|entrar|_next/static|_next/image|icon\\.svg|favicon\\.ico).*)"],
};
