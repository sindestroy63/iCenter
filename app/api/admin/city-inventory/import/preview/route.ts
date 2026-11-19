import { NextResponse } from "next/server";
import { authErrorStatus, requireAdminMutation } from "@/lib/auth";
import { MAX_PRICE_IMPORT_BYTES, previewPriceImport } from "@/lib/admin-price-import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function signingKey() {
  return process.env.PRICE_EXPORT_SIGNING_KEY?.trim() || process.env.REQUEST_PII_KEY?.trim() || "";
}

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "EXPORT_CITY_FORBIDDEN") return NextResponse.json({ error: code }, { status: 403 });
  if (["IMPORT_FORMAT_INVALID", "IMPORT_COLUMNS_INVALID", "IMPORT_FILE_INVALID", "IMPORT_ROW_COUNT_MISMATCH", "IMPORT_FORMULA_NOT_ALLOWED", "IMPORT_PREVIEW_INVALID", "IMPORT_TEMPLATE_OUTDATED"].includes(code)) return NextResponse.json({ error: code }, { status: 400 });
  if (["IMPORT_FILE_TOO_LARGE", "IMPORT_ROW_LIMIT_EXCEEDED"].includes(code)) return NextResponse.json({ error: code }, { status: 413 });
  if (code === "EXPORT_SIGNING_KEY_UNAVAILABLE") return NextResponse.json({ error: code }, { status: 503 });
  if (code === "IMPORT_PRICE_INVALID") return NextResponse.json({ error: code }, { status: 400 });
  const status = authErrorStatus(error);
  return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "IMPORT_PREVIEW_FAILED" }, { status });
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_PRICE_IMPORT_BYTES + 128 * 1024) return NextResponse.json({ error: "IMPORT_FILE_TOO_LARGE" }, { status: 413 });
    const session = await requireAdminMutation(request);
    const form = await request.formData();
    const cityId = String(form.get("cityId") ?? "").trim();
    const file = form.get("file");
    if (!cityId || !(file instanceof File)) return NextResponse.json({ error: "IMPORT_REQUEST_INVALID" }, { status: 400 });
    if (file.size > MAX_PRICE_IMPORT_BYTES) return NextResponse.json({ error: "IMPORT_FILE_TOO_LARGE" }, { status: 413 });
    const result = await previewPriceImport(session, Buffer.from(await file.arrayBuffer()), cityId, signingKey());
    return NextResponse.json({ data: result }, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    console.error("admin price import preview failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return failure(error);
  }
}
