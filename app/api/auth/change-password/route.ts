import { NextResponse } from "next/server";
import { changeOwnPassword, sameOrigin } from "@/lib/auth";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "ORIGIN_INVALID" }, { status: 403 });
  try {
    const body = await request.json() as { currentPassword?: unknown; newPassword?: unknown };
    if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
      return NextResponse.json({ error: "INVALID_PASSWORD" }, { status: 400 });
    }
    await changeOwnPassword(request, body.currentPassword, body.newPassword);
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PASSWORD_CHANGE_FAILED";
    const status = message === "UNAUTHORIZED" ? 401 : message === "CSRF_INVALID" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
