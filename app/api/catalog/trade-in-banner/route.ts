import { NextResponse } from "next/server";
import { imageUrl, logApiError, readOnly } from "@/lib/catalog-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const row = await readOnly(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ imagePath: string | null; mimeType: string | null; isActive: boolean }>>`
        SELECT media."storagePath" AS "imagePath",media."mimeType",banner."isActive"
        FROM banners banner
        LEFT JOIN media ON media.id=banner."imageMediaId" AND media."mimeType" LIKE 'image/%'
        WHERE banner.placement='product_trade_in'
        ORDER BY banner."isActive" DESC,banner."sortOrder",banner.id
        LIMIT 1
      `;
      return rows[0] ?? null;
    });
    return NextResponse.json({ data: row ? { imageUrl: imageUrl(row.imagePath,row.mimeType), isActive: row.isActive } : null }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    logApiError(error, "catalog.trade-in-banner");
    return NextResponse.json({ data: null }, { headers: { "cache-control": "no-store" } });
  }
}
