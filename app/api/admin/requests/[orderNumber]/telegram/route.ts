import { NextResponse } from "next/server";
import { adminDb } from "@/lib/admin-db";
import { requireAdminMutation } from "@/lib/auth";
import { notifyRequest } from "@/lib/telegram-requests";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: { orderNumber: string } }) {
  try {
    const session = await requireAdminMutation(request);
    if (!["OWNER", "ADMIN", "DEVELOPER", "CITY_MANAGER"].includes(session.role)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (session.role === "CITY_MANAGER") {
      const allowed = await adminDb().$queryRaw<Array<{ allowed: number }>>`
        SELECT 1 AS allowed
        FROM order_attempts a
        JOIN user_city_access grant_city ON grant_city."cityId"=a."cityId" AND grant_city."userId"=${session.userId}
        WHERE a."orderNumber"=${context.params.orderNumber}
        LIMIT 1
      `;
      if (!allowed.length) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const result = await notifyRequest(context.params.orderNumber);
    return NextResponse.json({ status: result }, { status: result === "failed" ? 503 : 200 });
  } catch (error) {
    const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : error instanceof Error && ["FORBIDDEN", "CSRF_INVALID"].includes(error.message) ? 403 : 503;
    return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : status === 403 ? (error instanceof Error && error.message === "CSRF_INVALID" ? "CSRF_INVALID" : "FORBIDDEN") : "TELEGRAM_UNAVAILABLE" }, { status });
  }
}
