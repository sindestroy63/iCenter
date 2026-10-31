import { NextResponse } from "next/server";
import { requireRequestSession } from "@/lib/auth";
import { listRequests, RequestError } from "@/lib/request-service";
import { listTradeInLeads } from "@/lib/trade-in-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireRequestSession();
    const viewer = { userId: session.userId, role: session.role };
    const type = new URL(request.url).searchParams.get("type");
    const data = type === "trade_in" || type === "installment"
      ? (await listTradeInLeads(viewer)).filter((row) => row.requestType === type)
      : await listRequests(viewer);
    return NextResponse.json({ data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof RequestError ? error.status : error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : error instanceof Error && error.message === "FORBIDDEN" ? 403 : 503;
    if (status === 503) {
      const value = error && typeof error === "object" ? error as { name?: unknown; code?: unknown; meta?: { code?: unknown } } : {};
      const code = typeof value.meta?.code === "string" ? value.meta.code : typeof value.code === "string" ? value.code : undefined;
      console.error("admin requests read failed", { name: typeof value.name === "string" ? value.name : "UnknownError", code });
    }
    return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "REQUESTS_UNAVAILABLE" }, { status });
  }
}
