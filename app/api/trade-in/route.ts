import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/same-origin";
import { createTradeInLead } from "@/lib/trade-in-service";

export const dynamic = "force-dynamic";
const schema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(10).max(40).regex(/^[+()\d\s-]+$/),
  device: z.string().trim().min(1).max(180),
  condition: z.string().trim().max(80).optional().default(""),
  comment: z.string().trim().max(1000).optional().default(""),
  city: z.enum(["samara", "moscow", "saint-petersburg", "orenburg"]),
  productId: z.string().max(120).optional(),
  productSlug: z.string().max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/).optional(),
  consent: z.literal(true),
}).superRefine((value, context) => {
  const digits = value.phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) context.addIssue({ code: "custom", path: ["phone"], message: "invalid" });
});
const rateWindowMs = 15 * 60 * 1000;
const rateWindow = new Map<string, { start: number; count: number }>();

function isRateLimited(request: Request) {
  const ip = request.headers.get("x-real-ip")?.slice(0,80) ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0,80) ?? "unknown";
  const now = Date.now();
  const current = rateWindow.get(ip);
  if (!current || now - current.start >= rateWindowMs) {
    rateWindow.set(ip,{ start: now,count: 1 });
    if (rateWindow.size > 10000) for (const [key,value] of Array.from(rateWindow.entries())) if (now - value.start >= rateWindowMs) rateWindow.delete(key);
    return false;
  }
  current.count += 1;
  return current.count > 5;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "ORIGIN_REJECTED" }, { status: 403 });
  if (isRateLimited(request)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": "900" } });
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 12000) return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const result = await createTradeInLead(parsed.data,request.headers.get("idempotency-key") ?? "");
    return NextResponse.json(result,{ status: result.replayed ? 200 : 201,headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (["INVALID_IDEMPOTENCY_KEY", "CITY_UNAVAILABLE", "PRODUCT_UNAVAILABLE", "IDEMPOTENCY_CONFLICT"].includes(message)) {
      const status = message === "IDEMPOTENCY_CONFLICT" ? 409 : 400;
      return NextResponse.json({ error: message },{ status });
    }
    if (message.startsWith("REQUEST_PII_KEY")) console.error("trade-in request disabled: encryption key configuration is invalid");
    else console.error("trade-in request save failed",{ name: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "TRADE_IN_UNAVAILABLE" },{ status: 503 });
  }
}
