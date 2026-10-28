import { NextResponse } from "next/server";
import { requireAdminMutation } from "@/lib/auth";
import { deleteRequest, RequestError, updateRequestStatus } from "@/lib/request-service";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: { orderNumber: string } }) {
  try {
    const session = await requireAdminMutation(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.status !== "string") return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });
    const status = await updateRequestStatus(
      { userId: session.userId, role: session.role },
      context.params.orderNumber,
      body.status,
    );
    return NextResponse.json({ status }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof RequestError ? error.status
      : error instanceof Error && error.message === "UNAUTHORIZED" ? 401
      : error instanceof Error && ["FORBIDDEN", "CSRF_INVALID"].includes(error.message) ? 403
      : 503;
    if (status === 503) console.error("admin request status update failed", { name: error instanceof Error ? error.name : "UnknownError" });
    const code = status === 401 ? "UNAUTHORIZED" : status === 403 ? (error instanceof Error && error.message === "CSRF_INVALID" ? "CSRF_INVALID" : "FORBIDDEN")
      : error instanceof RequestError ? error.code : "REQUEST_UPDATE_UNAVAILABLE";
    return NextResponse.json({ error: code }, { status });
  }
}

export async function DELETE(request: Request, context: { params: { orderNumber: string } }) {
  try {
    const session = await requireAdminMutation(request);
    if (session.role !== "OWNER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    await deleteRequest({ userId: session.userId, role: session.role }, context.params.orderNumber);
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof RequestError ? error.status
      : error instanceof Error && error.message === "UNAUTHORIZED" ? 401
      : error instanceof Error && ["FORBIDDEN", "CSRF_INVALID"].includes(error.message) ? 403
      : 503;
    if (status === 503) console.error("admin request delete failed", { name: error instanceof Error ? error.name : "UnknownError" });
    const code = status === 401 ? "UNAUTHORIZED" : status === 403 ? (error instanceof Error && error.message === "CSRF_INVALID" ? "CSRF_INVALID" : "FORBIDDEN")
      : error instanceof RequestError ? error.code : "REQUEST_DELETE_UNAVAILABLE";
    return NextResponse.json({ error: code }, { status });
  }
}
