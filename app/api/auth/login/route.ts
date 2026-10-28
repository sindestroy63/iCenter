import { NextResponse } from "next/server";
import { authenticate, authCookieOptions, authCookies, csrfCookieOptions, sameOrigin } from "@/lib/auth";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW = 15 * 60 * 1000;
const LIMIT = 8;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origin validation failed" }, { status: 403 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) return NextResponse.json({ error: "Неверные данные входа." }, { status: 413 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const state = attempts.get(ip);
  if (state && state.resetAt > now && state.count >= LIMIT) return NextResponse.json({ error: "Слишком много попыток. Повторите позже." }, { status: 429 });
  try {
    const body = await request.json() as { email?: unknown; password?: unknown };
    if (typeof body.email !== "string" || typeof body.password !== "string" || body.email.length > 320 || body.password.length > 1024) return NextResponse.json({ error: "Неверные данные входа." }, { status: 400 });
    const result = await authenticate(body.email, body.password, request);
    if (!result) {
      const next = state && state.resetAt > now ? { count: state.count + 1, resetAt: state.resetAt } : { count: 1, resetAt: now + WINDOW };
      attempts.set(ip, next);
      return NextResponse.json({ error: "Неверные данные входа." }, { status: 401 });
    }
    attempts.delete(ip);
    const response = NextResponse.json({ user: result.user });
    response.headers.set("cache-control", "no-store");
    response.cookies.set(authCookies.SESSION_COOKIE, result.sessionToken, authCookieOptions());
    response.cookies.set(authCookies.CSRF_COOKIE, result.csrfToken, csrfCookieOptions());
    return response;
  } catch { return NextResponse.json({ error: "Сервис входа временно недоступен." }, { status: 503 }); }
}
