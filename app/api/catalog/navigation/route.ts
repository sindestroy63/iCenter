import { NextResponse } from "next/server";
import { apiError, cityValidationError, findCity, readOnly, readRequestUrl, validateCity } from "@/lib/catalog-api";

export const dynamic = "force-dynamic";

type NavigationRow = {
  brandSlug: string;
  brandName: string;
  typeSlug: string;
  typeName: string;
  categorySlug: string;
  categoryName: string;
};

export async function GET(request: Request) {
  const citySlug = validateCity(readRequestUrl(request).searchParams.get("city"));
  if (!citySlug) return cityValidationError();
  try {
    const data = await readOnly(async (tx) => {
      const city = await findCity(tx, citySlug);
      if (!city) return null;
      const rows = await tx.$queryRaw<NavigationRow[]>`
        SELECT DISTINCT
          b.slug AS "brandSlug", b.name AS "brandName",
          pt.slug AS "typeSlug", pt.name AS "typeName",
          c.slug AS "categorySlug", c.name AS "categoryName"
        FROM products p
        JOIN brands b ON b.id=p."brandId" AND b."isActive"=TRUE
        JOIN product_types pt ON pt.id=p."productTypeId" AND pt."isActive"=TRUE
        JOIN categories c ON c.id=p."categoryId" AND c."isActive"=TRUE
        WHERE p.status='PUBLISHED'::"ProductStatus"
          AND EXISTS (
            SELECT 1
            FROM product_variants v
            JOIN inventory i ON i."variantId"=v.id
            WHERE v."productId"=p.id AND v."isActive"=TRUE
              AND i."cityId"=${city.id} AND i."isActive"=TRUE
          )
        ORDER BY b.name, pt.name, c.name
      `;
      const brands = new Map<string, { slug: string; name: string }>();
      const types = new Map<string, { slug: string; name: string; brandSlug: string }>();
      const categories = new Map<string, { slug: string; name: string }>();
      for (const row of rows) {
        brands.set(row.brandSlug, { slug: row.brandSlug, name: row.brandName });
        types.set(`${row.brandSlug}:${row.typeSlug}`, { slug: row.typeSlug, name: row.typeName, brandSlug: row.brandSlug });
        categories.set(row.categorySlug, { slug: row.categorySlug, name: row.categoryName });
      }
      return { brands: Array.from(brands.values()), types: Array.from(types.values()), categories: Array.from(categories.values()) };
    });
    if (!data) return NextResponse.json({ error: "City not found or inactive" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error);
  }
}
