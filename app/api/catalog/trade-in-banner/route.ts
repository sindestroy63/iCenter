import { NextResponse } from "next/server";
import { logApiError, publicMediaUrl, readOnly } from "@/lib/catalog-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const row = await readOnly(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ mediaPath: string | null; mimeType: string | null; isActive: boolean }>>`
        SELECT media."storagePath" AS "mediaPath",media."mimeType",banner."isActive"
        FROM banners banner
        LEFT JOIN media ON media.id=banner."imageMediaId" AND media."mimeType" IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm')
        WHERE banner.placement='product_trade_in'
        ORDER BY banner."isActive" DESC,banner."sortOrder",banner.id
        LIMIT 1
      `;
      return rows[0] ?? null;
    });
    return NextResponse.json({ data: row ? { mediaUrl: publicMediaUrl(row.mediaPath), mediaType: row.mimeType, isActive: row.isActive } : null }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    logApiError(error, "catalog.trade-in-banner");
    return NextResponse.json({ data: null }, { headers: { "cache-control": "no-store" } });
  }
}
