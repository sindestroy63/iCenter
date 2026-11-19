import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorStatus, requireAdminMutation } from "@/lib/auth";
import { confirmPriceImport } from "@/lib/admin-price-import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ previewToken: z.string().min(1).max(4 * 1024 * 1024) }).strict();

function signingKey() {
  return process.env.PRICE_EXPORT_SIGNING_KEY?.trim() || process.env.REQUEST_PII_KEY?.trim() || "";
}

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "EXPORT_CITY_FORBIDDEN") return NextResponse.json({ error: code }, { status: 403 });
  if (["IMPORT_PREVIEW_INVALID", "IMPORT_PREVIEW_EXPIRED"].includes(code)) return NextResponse.json({ error: code }, { status: 400 });
  if (code === "IMPORT_CONFLICT") return NextResponse.json({ error: code }, { status: 409 });
  if (code === "EXPORT_SIGNING_KEY_UNAVAILABLE") return NextResponse.json({ error: code }, { status: 503 });
  const status = authErrorStatus(error);
  return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "IMPORT_CONFIRM_FAILED" }, { status });
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminMutation(request);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "IMPORT_REQUEST_INVALID" }, { status: 400 });
    const result = await confirmPriceImport(session, parsed.data.previewToken, signingKey());
    return NextResponse.json({ data: result }, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    console.error("admin price import confirm failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return failure(error);
  }
}
