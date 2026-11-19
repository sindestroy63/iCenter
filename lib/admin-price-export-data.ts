import "server-only";

import { Prisma } from "@prisma/client";
import { adminDb } from "@/lib/admin-db";
import { evaluateCityAccess } from "@/lib/city-access-policy";
import { MAX_PRICE_EXPORT_ROWS, type PriceExportRow } from "@/lib/admin-price-export";

type ExportSession = {
  userId: string;
  role: string;
  isActive: boolean;
  allCities: boolean;
  allCitiesCanManagePrices: boolean;
  allCitiesCanManageStock: boolean;
};

type ExportOption = { id: string; name: string; slug: string };
type CityOptionRow = ExportOption & { grantCanManagePrices: boolean | null; grantCanManageStock: boolean | null };

export async function getPriceExportOptions(session: ExportSession) {
  const db = adminDb();
  const [cityRows, brands, categories] = await Promise.all([
    db.$queryRaw<CityOptionRow[]>`
      SELECT c.id,c.name,c.slug,g."canManagePrices" AS "grantCanManagePrices",g."canManageStock" AS "grantCanManageStock"
      FROM cities c
      LEFT JOIN user_city_access g ON g."cityId"=c.id AND g."userId"=${session.userId}
      WHERE c."isActive"=TRUE
      ORDER BY c."sortOrder",c.name
    `,
    db.$queryRaw<ExportOption[]>`SELECT id,name,slug FROM brands WHERE "isActive"=TRUE ORDER BY "sortOrder",name`,
    db.$queryRaw<ExportOption[]>`SELECT id,name,slug FROM categories WHERE "isActive"=TRUE ORDER BY "sortOrder",name`,
  ]);
  const cities = cityRows.filter((city) => evaluateCityAccess({
    role: session.role,
    isActive: session.isActive,
    allCities: session.allCities,
    allCitiesCanManagePrices: session.allCitiesCanManagePrices,
    allCitiesCanManageStock: session.allCitiesCanManageStock,
    hasCityGrant: city.grantCanManagePrices !== null || city.grantCanManageStock !== null,
    grantCanManagePrices: city.grantCanManagePrices ?? false,
    grantCanManageStock: city.grantCanManageStock ?? false,
  }).canManagePrices);
  return { cities, brands, categories };
}

export async function getPriceExportData(session: ExportSession, filters: { cityId: string; brandId?: string; categoryId?: string }) {
  const options = await getPriceExportOptions(session);
  const city = options.cities.find((item) => item.id === filters.cityId);
  if (!city) throw new Error("EXPORT_CITY_FORBIDDEN");
  const brand = filters.brandId ? options.brands.find((item) => item.id === filters.brandId) : null;
  const category = filters.categoryId ? options.categories.find((item) => item.id === filters.categoryId) : null;
  if (filters.brandId && !brand || filters.categoryId && !category) throw new Error("EXPORT_FILTER_INVALID");

  const rows = await adminDb().$queryRaw<PriceExportRow[]>(Prisma.sql`
    SELECT p.id AS "productId",v.id AS "variantId",${city.id}::text AS "cityId",i.id AS "inventoryId",
      COALESCE(i."updatedAt",v."updatedAt",p."updatedAt") AS "snapshotUpdatedAt",
      b.name AS "brandName",c.name AS "categoryName",p.name AS "productName",
      g."canonicalKey" AS "productTypeKey",g.name AS "productTypeName",v.sku,v.storage,
      COALESCE(NULLIF(to_jsonb(color)->>'nameRu',''),color.name) AS "colorName",
      v."simType",v.ram,v.connectivity,v.size,v.material,v.label,v.attributes,resolved_attributes.attributes AS "resolvedAttributes",
      i.price::text AS price,i.availability::text AS availability,i."allowPreorder",i."deliveryTime"
    FROM products p
    JOIN brands b ON b.id=p."brandId" AND b."isActive"=TRUE
    JOIN categories c ON c.id=p."categoryId" AND c."isActive"=TRUE
    JOIN global_product_types g ON g.id=p."globalProductTypeId" AND g."isActive"=TRUE
    JOIN product_variants v ON v."productId"=p.id AND v."isActive"=TRUE
    LEFT JOIN colors color ON color.id=v."colorId"
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('code',resolved.code,'name',resolved.name,'value',resolved.value) ORDER BY resolved."sortOrder",resolved.name) AS attributes
      FROM (
        SELECT d.code,d.name,o.label AS value,d."sortOrder"
        FROM product_variant_attribute_values pav
        JOIN attribute_definitions d ON d.id=pav."definitionId"
        JOIN attribute_options o ON o.id=pav."optionId"
        WHERE pav."variantId"=v.id
      ) resolved
    ) resolved_attributes ON TRUE
    LEFT JOIN inventory i ON i."variantId"=v.id AND i."cityId"=${city.id} AND i."isActive"=TRUE
    WHERE p.status='PUBLISHED'::"ProductStatus"
      AND (${filters.brandId ?? null}::text IS NULL OR p."brandId"=${filters.brandId ?? null})
      AND (${filters.categoryId ?? null}::text IS NULL OR p."categoryId"=${filters.categoryId ?? null})
    LIMIT ${MAX_PRICE_EXPORT_ROWS + 1}
  `);
  if (rows.length > MAX_PRICE_EXPORT_ROWS) throw new Error("EXPORT_ROW_LIMIT_EXCEEDED");
  return { rows, city, brand, category };
}
