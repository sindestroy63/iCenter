import { NextResponse } from "next/server";
import { apiError, cityValidationError, findCity, readOnly, readRequestUrl, validateCity } from "@/lib/catalog-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const citySlug = validateCity(readRequestUrl(request).searchParams.get("city"));
  if (!citySlug) return cityValidationError();
  try {
    const result = await readOnly(async (tx) => {
      const city = await findCity(tx, citySlug);
      if (!city) return null;
      return tx.$queryRaw<Array<{ slug: string }>>`
        SELECT p.slug
        FROM best_offers offer
        JOIN products p ON p.id = offer."productId"
        JOIN brands b ON b.id = p."brandId" AND b."isActive" = TRUE
        JOIN product_types pt ON pt.id = p."productTypeId" AND pt."isActive" = TRUE
        JOIN categories c ON c.id = p."categoryId" AND c."isActive" = TRUE
        WHERE offer."isActive" = TRUE
          AND p.status = 'PUBLISHED'::"ProductStatus"
          AND EXISTS (
            SELECT 1 FROM product_variants v
            JOIN inventory i ON i."variantId" = v.id
            WHERE v."productId" = p.id AND v."isActive" = TRUE
              AND i."cityId" = ${city.id} AND i."isActive" = TRUE
          )
        ORDER BY offer."sortOrder", offer.id
      `;
    });
    if (!result) return NextResponse.json({ error: "City is not available" }, { status: 404 });
    return NextResponse.json({ data: result });
  } catch (error) {
    return apiError(error);
  }
}
