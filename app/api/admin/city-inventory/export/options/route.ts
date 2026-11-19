import { NextResponse } from "next/server";
import { authErrorStatus, requireAdminSession } from "@/lib/auth";
import { getPriceExportOptions } from "@/lib/admin-price-export-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const data = await getPriceExportOptions(session);
    return NextResponse.json({ data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = authErrorStatus(error);
    return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "EXPORT_OPTIONS_UNAVAILABLE" }, { status });
  }
}
