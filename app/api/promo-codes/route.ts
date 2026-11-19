import { NextResponse } from "next/server";
import { z } from "zod";
import { validatePromo } from "@/lib/promo-codes";

export const dynamic = "force-dynamic";
const schema = z.object({ code: z.string().trim().min(1).max(64), city: z.enum(["samara", "moscow", "saint-petersburg", "orenburg"]), items: z.array(z.object({ variantId: z.string().min(1).max(120), quantity: z.number().int().min(1).max(25) })).min(1).max(30) });

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  try {
    const result = await validatePromo(body.data.code, body.data.city, body.data.items);
    return NextResponse.json({ code: result.code, discount: Number(result.discount), subtotal: Number(result.subtotal), total: Number(result.total) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROMO_UNAVAILABLE";
    const status = code === "CITY_UNAVAILABLE" ? 400 : 422;
    return NextResponse.json({ error: code.startsWith("PROMO_") ? code : "PROMO_UNAVAILABLE" }, { status });
  }
}
