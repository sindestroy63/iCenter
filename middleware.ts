import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (!path.startsWith("/admin")) return NextResponse.next();
  const isLogin = path === "/admin/login";
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("x-icenter-admin-login", isLogin ? "1" : "0");
  forwardedHeaders.set("x-icenter-admin-change-password", path === "/admin/change-password" ? "1" : "0");
  forwardedHeaders.set("x-icenter-admin-path", path);
  if (!request.cookies.get("icenter_session")) {
    if (isLogin) return NextResponse.next({ request: { headers: forwardedHeaders } });
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  return NextResponse.next({ request: { headers: forwardedHeaders } });
}

export const config = { matcher: ["/admin/:path*"] };
