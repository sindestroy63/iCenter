import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorStatus, requireAdminSession } from "@/lib/auth";
import { buildPriceExportWorkbook } from "@/lib/admin-price-export";
import { getPriceExportData } from "@/lib/admin-price-export-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  cityId: z.string().trim().min(1).max(128),
  brandId: z.string().trim().min(1).max(128).optional(),
  categoryId: z.string().trim().min(1).max(128).optional(),
}).strict();

function signingKey() {
  return process.env.PRICE_EXPORT_SIGNING_KEY?.trim() || process.env.REQUEST_PII_KEY?.trim() || "";
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "EXPORT_CITY_FORBIDDEN") return NextResponse.json({ error: "EXPORT_CITY_FORBIDDEN" }, { status: 403 });
  if (message === "EXPORT_FILTER_INVALID") return NextResponse.json({ error: "EXPORT_FILTER_INVALID" }, { status: 400 });
  if (message === "EXPORT_ROW_LIMIT_EXCEEDED") return NextResponse.json({ error: "EXPORT_ROW_LIMIT_EXCEEDED" }, { status: 413 });
  if (message === "EXPORT_SIGNING_KEY_UNAVAILABLE") return NextResponse.json({ error: "EXPORT_SIGNING_KEY_UNAVAILABLE" }, { status: 503 });
  const status = authErrorStatus(error);
  return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "PRICE_EXPORT_FAILED" }, { status });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      cityId: url.searchParams.get("cityId") ?? "",
      brandId: url.searchParams.get("brandId") || undefined,
      categoryId: url.searchParams.get("categoryId") || undefined,
    });
    if (!parsed.success) return NextResponse.json({ error: "EXPORT_QUERY_INVALID" }, { status: 400 });
    const session = await requireAdminSession();
    const data = await getPriceExportData(session, parsed.data);
    const result = await buildPriceExportWorkbook(data.rows, {
      cityName: data.city.name,
      brandName: data.brand?.name ?? null,
      categoryName: data.category?.name ?? null,
    }, signingKey());
    const date = new Date().toISOString().slice(0, 10);
    const filename = `icenter-price-${data.city.slug}-${date}.xlsx`;
    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "no-store, private",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("admin price export failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return failure(error);
  }
}
