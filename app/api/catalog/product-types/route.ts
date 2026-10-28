import { NextResponse } from "next/server";
import { apiError, readOnly } from "@/lib/catalog-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await readOnly((tx) => tx.$queryRaw<Array<{ id: string; name: string; slug: string; brandId: string; brandName: string; brandSlug: string; attributes: unknown; order: number }>>`
      SELECT pt.id, pt.name, pt.slug, pt."brandId", b.name AS "brandName", b.slug AS "brandSlug",
             pt."variantAttributes" AS attributes, pt."sortOrder" AS "order"
      FROM product_types pt
      JOIN brands b ON b.id = pt."brandId" AND b."isActive" = TRUE
      WHERE pt."isActive" = TRUE
      ORDER BY pt."sortOrder", pt.name
    `);
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error);
  }
}
