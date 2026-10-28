import { NextResponse } from "next/server";
import { apiError, cityValidationError, findCity, readOnly, readRequestUrl, validateCity, validateSlug } from "@/lib/catalog-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  if (!validateSlug(params.slug)) return NextResponse.json({ error: "INVALID_PRODUCT" }, { status: 400 });
  const citySlug = validateCity(readRequestUrl(request).searchParams.get("city"));
  if (!citySlug) return cityValidationError();
  try {
    const data = await readOnly(async (tx) => {
      const city = await findCity(tx, citySlug);
      if (!city) return null;
      const relationState = await tx.$queryRaw<Array<{ relation: string | null }>>`
        SELECT to_regclass('public.product_related_products')::text AS relation
      `;
      if (!relationState[0]?.relation) return [];
      return tx.$queryRaw<Array<{ id: string; slug: string }>>`
        SELECT related.id,related.slug
        FROM product_related_products link
        JOIN products source ON source.id=link."productId" AND source.slug=${params.slug} AND source.status='PUBLISHED'::"ProductStatus"
        JOIN products related ON related.id=link."relatedProductId" AND related.status='PUBLISHED'::"ProductStatus"
        WHERE EXISTS (
          SELECT 1 FROM product_variants variant
          JOIN inventory inventory ON inventory."variantId"=variant.id AND inventory."cityId"=${city.id} AND inventory."isActive"=TRUE
          WHERE variant."productId"=related.id AND variant."isActive"=TRUE
            AND (inventory.availability IN ('IN_STOCK'::"AvailabilityStatus",'PREORDER'::"AvailabilityStatus") OR inventory."allowPreorder"=TRUE)
        )
        ORDER BY link."sortOrder"
        LIMIT 12
      `;
    });
    if (!data) return NextResponse.json({ error: "CITY_UNAVAILABLE" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error, "catalog.product.related");
  }
}
