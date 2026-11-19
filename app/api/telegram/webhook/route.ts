import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processTelegramOrderUpdate } from "@/lib/telegram/order-callbacks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validSecret(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  if (!validSecret(request.headers.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = await request.json().catch(() => null);
  if (!update || typeof update !== "object") return NextResponse.json({ ok: false }, { status: 400 });
  const outcome = await processTelegramOrderUpdate(update);
  if (outcome === "sync-failed" || outcome === "telegram-unavailable") {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
