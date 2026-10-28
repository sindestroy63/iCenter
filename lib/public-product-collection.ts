import "server-only";

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiError, cityValidationError, findCity, readOnly, readRequestUrl, validateCity } from "@/lib/catalog-api";
import type { ProductCollection } from "@/lib/product-collections";

export async function publicCollectionGet(request: Request, collection: ProductCollection) {
  const citySlug = validateCity(readRequestUrl(request).searchParams.get("city"));
  if (!citySlug) return cityValidationError();
  try {
    const result = await readOnly(async (tx) => {
      const city = await findCity(tx, citySlug);
      if (!city) return null;
      const schemaRows = await tx.$queryRaw<Array<{ tableExists: boolean; variantColumnExists: boolean }>>`
        SELECT to_regclass(${collection}) IS NOT NULL AS "tableExists",
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=${collection} AND column_name='variantId') AS "variantColumnExists"
      `;
      const schema = schemaRows[0];
      if (!schema?.tableExists) return { data: [], configured: false };
      const table = Prisma.raw(collection);
      const configuredRows = await tx.$queryRaw<Array<{ configured: boolean }>>(Prisma.sql`SELECT EXISTS(SELECT 1 FROM ${table}) AS configured`);
      if (!schema.variantColumnExists) {
        const data = await tx.$queryRaw<Array<{ productId: string; slug: string; variantId: null }>>`
          SELECT p.id AS "productId",p.slug,NULL::text AS "variantId"
          FROM best_offers entry
          JOIN products p ON p.id=entry."productId"
          JOIN brands b ON b.id=p."brandId" AND b."isActive"=TRUE
          JOIN product_types pt ON pt.id=p."productTypeId" AND pt."isActive"=TRUE
          JOIN categories c ON c.id=p."categoryId" AND c."isActive"=TRUE
          WHERE entry."isActive"=TRUE AND p.status='PUBLISHED'::"ProductStatus"
            AND EXISTS(SELECT 1 FROM product_variants v JOIN inventory i ON i."variantId"=v.id
              WHERE v."productId"=p.id AND v."isActive"=TRUE AND i."cityId"=${city.id} AND i."isActive"=TRUE)
          ORDER BY entry."sortOrder",entry.id
        `;
        return { data, configured: configuredRows[0]?.configured ?? false };
      }
      const data = await tx.$queryRaw<Array<{ productId: string; slug: string; variantId: string | null }>>(Prisma.sql`
        SELECT p.id AS "productId",p.slug,entry."variantId"
        FROM ${table} entry
        JOIN products p ON p.id=entry."productId"
        JOIN brands b ON b.id=p."brandId" AND b."isActive"=TRUE
        JOIN product_types pt ON pt.id=p."productTypeId" AND pt."isActive"=TRUE
        JOIN categories c ON c.id=p."categoryId" AND c."isActive"=TRUE
        WHERE entry."isActive"=TRUE AND p.status='PUBLISHED'::"ProductStatus"
          AND (
            (entry."variantId" IS NULL AND EXISTS(SELECT 1 FROM product_variants v JOIN inventory i ON i."variantId"=v.id WHERE v."productId"=p.id AND v."isActive"=TRUE AND i."cityId"=${city.id} AND i."isActive"=TRUE))
            OR
            (entry."variantId" IS NOT NULL AND EXISTS(SELECT 1 FROM product_variants v JOIN inventory i ON i."variantId"=v.id WHERE v.id=entry."variantId" AND v."productId"=p.id AND v."isActive"=TRUE AND i."cityId"=${city.id} AND i."isActive"=TRUE))
          )
        ORDER BY entry."sortOrder",entry.id
      `);
      return { data, configured: configuredRows[0]?.configured ?? false };
    });
    if (!result) return NextResponse.json({ error: "City is not available" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) { return apiError(error, `catalog.${collection}`); }
}
