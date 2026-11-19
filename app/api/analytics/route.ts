import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/admin-db";
import { sameOrigin } from "@/lib/same-origin";

export const dynamic = "force-dynamic";

type RateEntry = { windowStarted: number; count: number; lastSignature: string; lastAt: number };
declare global {
  var analyticsRate: Map<string, RateEntry> | undefined;
  var analyticsLastCleanupAt: number | undefined;
}

const eventSchema = z.object({
  visitorId: z.string().uuid(),
  pathname: z.string().min(1).max(300).refine((value) => value.startsWith("/") && !/[?#\u0000-\u001f]/.test(value)),
  productId: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/).nullable().optional(),
}).strict();

function limited(visitorId: string, signature: string) {
  const now = Date.now();
  const rates = globalThis.analyticsRate ??= new Map<string, RateEntry>();
  if (rates.size > 5000) {
    rates.forEach((entry, key) => { if (now - entry.windowStarted > 120000) rates.delete(key); });
  }
  const current = rates.get(visitorId);
  if (!current || now - current.windowStarted >= 60000) {
    rates.set(visitorId, { windowStarted: now, count: 1, lastSignature: signature, lastAt: now });
    return false;
  }
  if (current.lastSignature === signature && now - current.lastAt < 2000) return true;
  current.count += 1;
  current.lastSignature = signature;
  current.lastAt = now;
  return current.count > 30;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2048) return NextResponse.json({ error: "INVALID_EVENT" }, { status: 413 });
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_EVENT" }, { status: 400 });
  const event = parsed.data;
  if (event.pathname.startsWith("/admin") || event.pathname.startsWith("/api") || event.pathname.startsWith("/_next")) return NextResponse.json({ error: "INVALID_EVENT" }, { status: 400 });
  if (event.productId && !event.pathname.startsWith("/product/")) return NextResponse.json({ error: "INVALID_EVENT" }, { status: 400 });
  const signature = `${event.pathname}\u0000${event.productId ?? ""}`;
  if (limited(event.visitorId, signature)) return new NextResponse(null, { status: 204 });

  try {
    const db = adminDb();
    const table = await db.$queryRaw<Array<{ relation: string | null }>>`SELECT to_regclass('public.analytics_events')::text AS relation`;
    if (!table[0]?.relation) return NextResponse.json({ error: "ANALYTICS_UNAVAILABLE" }, { status: 503 });
    if (event.productId) {
      const product = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM products WHERE id=${event.productId} LIMIT 1`;
      if (!product.length) return NextResponse.json({ error: "INVALID_EVENT" }, { status: 400 });
    }
    await db.$executeRaw`INSERT INTO analytics_events ("visitorId",pathname,"productId","createdAt") VALUES (${event.visitorId}::uuid,${event.pathname},${event.productId ?? null},NOW())`;
    const now = Date.now();
    if (!globalThis.analyticsLastCleanupAt || now - globalThis.analyticsLastCleanupAt > 6 * 60 * 60 * 1000) {
      globalThis.analyticsLastCleanupAt = now;
      await db.$executeRaw`DELETE FROM analytics_events WHERE "createdAt" < NOW() - INTERVAL '90 days'`;
    }
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "ANALYTICS_UNAVAILABLE" }, { status: 503 });
  }
}
