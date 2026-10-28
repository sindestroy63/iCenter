import { NextResponse } from "next/server";
import { authCookieOptions, authCookies, csrfMatches, getSession, revokeCurrentSession, sameOrigin } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !sameOrigin(request) || !csrfMatches(request, session.csrfToken)) return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
  await revokeCurrentSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookies.SESSION_COOKIE, "", authCookieOptions(0));
  response.cookies.set(authCookies.CSRF_COOKIE, "", { ...authCookieOptions(0), httpOnly: false });
  return response;
}
