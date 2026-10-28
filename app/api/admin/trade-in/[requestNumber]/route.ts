import { NextResponse } from "next/server";
import { requireAdminMutation } from "@/lib/auth";
import { updateTradeInStatus } from "@/lib/trade-in-service";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { requestNumber: string } }) {
  try {
    const session = await requireAdminMutation(request);
    const body = await request.json().catch(() => null) as { status?: unknown } | null;
    if (!body || typeof body.status !== "string") return NextResponse.json({ error: "INVALID_STATUS" },{ status: 400 });
    const status = await updateTradeInStatus({ userId: session.userId,role: session.role },params.requestNumber,body.status);
    return NextResponse.json({ status },{ headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "UNAUTHORIZED" ? 401 : message === "CSRF_INVALID" || message === "FORBIDDEN" ? 403 : message === "INVALID_STATUS" ? 400 : message === "NOT_FOUND" ? 404 : 503;
    if (status === 503) console.error("admin trade-in status update failed",{ name: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : status === 400 ? "INVALID_STATUS" : status === 404 ? "NOT_FOUND" : "TRADE_IN_UNAVAILABLE" },{ status });
  }
}
