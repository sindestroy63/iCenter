import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";
import { publicMediaUrl } from "@/lib/catalog-api";

export type ProductCollection = "best_offers" | "popular_products";

type SchemaRow = { tableExists: boolean; variantColumnExists: boolean };
type CityRow = { id: string; slug: string; name: string };
type VariantRow = {
  productId: string; productName: string; slug: string; brandName: string;
  variantId: string; sku: string; label: string; storage: string | null; simType: string | null;
  colorName: string | null; colorNameRu: string | null; price: string | null; availability: string;
  storagePath: string | null;
};

const tableSql = (collection: ProductCollection) => Prisma.raw(collection);

export async function collectionSchema(db: PrismaClient, collection: ProductCollection) {
  const rows = await db.$queryRaw<SchemaRow[]>`
    SELECT to_regclass(${collection}) IS NOT NULL AS "tableExists",
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = ${collection} AND column_name = 'variantId'
      ) AS "variantColumnExists"
  `;
  return rows[0] ?? { tableExists: false, variantColumnExists: false };
}

export async function loadAdminCollection(db: PrismaClient, collection: ProductCollection, requestedCity?: string | null) {
  const [schema, cities] = await Promise.all([
    collectionSchema(db, collection),
    db.$queryRaw<CityRow[]>`SELECT id,slug,name FROM cities WHERE "isActive"=TRUE ORDER BY "sortOrder",name`,
  ]);
  const city = cities.find((item) => item.slug === requestedCity) ?? cities[0] ?? null;
  const schemaReady = schema.tableExists && schema.variantColumnExists;
  const table = tableSql(collection);

  const data = !schema.tableExists ? [] : schema.variantColumnExists
    ? await db.$queryRaw<any[]>(Prisma.sql`
        SELECT entry.id,entry."productId",entry."variantId",entry."sortOrder",entry."isActive",
          ${collection === "best_offers" ? Prisma.sql`entry.title,entry.description,` : Prisma.sql`NULL::text AS title,NULL::text AS description,`}
          p.name AS "productName",p.slug,b.name AS "brandName"
        FROM ${table} entry JOIN products p ON p.id=entry."productId"
        LEFT JOIN brands b ON b.id=p."brandId"
        ORDER BY entry."sortOrder",entry.id
      `)
    : await db.$queryRaw<any[]>(Prisma.sql`
        SELECT entry.id,entry."productId",NULL::text AS "variantId",entry."sortOrder",entry."isActive",
          entry.title,entry.description,p.name AS "productName",p.slug,b.name AS "brandName"
        FROM best_offers entry JOIN products p ON p.id=entry."productId"
        LEFT JOIN brands b ON b.id=p."brandId"
        ORDER BY entry."sortOrder",entry.id
      `);

  const variantRows = city ? await db.$queryRaw<VariantRow[]>`
    SELECT p.id AS "productId",p.name AS "productName",p.slug,b.name AS "brandName",
      v.id AS "variantId",v.sku,v.label,v.storage,v."simType",co.name AS "colorName",to_jsonb(co)->>'nameRu' AS "colorNameRu",
      i.price::text AS price,i.availability::text AS availability,image."storagePath"
    FROM products p
    JOIN brands b ON b.id=p."brandId" AND b."isActive"=TRUE
    JOIN product_types pt ON pt.id=p."productTypeId" AND pt."isActive"=TRUE
    JOIN categories c ON c.id=p."categoryId" AND c."isActive"=TRUE
    JOIN product_variants v ON v."productId"=p.id AND v."isActive"=TRUE
    JOIN inventory i ON i."variantId"=v.id AND i."cityId"=${city.id} AND i."isActive"=TRUE
    LEFT JOIN colors co ON co.id=v."colorId" AND co."isActive"=TRUE
    LEFT JOIN LATERAL (
      SELECT source."storagePath" FROM (
        SELECT m."storagePath",0 AS priority,cgi."sortOrder"
        FROM color_galleries cg JOIN color_gallery_images cgi ON cgi."colorGalleryId"=cg.id JOIN media m ON m.id=cgi."mediaId"
        WHERE cg."productId"=p.id AND cg."colorId"=v."colorId" AND m."mimeType" LIKE 'image/%'
        UNION ALL
        SELECT m."storagePath",1 AS priority,pgi."sortOrder"
        FROM product_gallery_images pgi JOIN media m ON m.id=pgi."mediaId"
        WHERE pgi."productId"=p.id AND m."mimeType" LIKE 'image/%'
      ) source ORDER BY source.priority,source."sortOrder" LIMIT 1
    ) image ON TRUE
    WHERE p.status='PUBLISHED'::"ProductStatus"
    ORDER BY b.name,p.name,v.storage,co.name,v."simType",v.sku
  ` : [];

  const productMap = new Map<string, any>();
  for (const row of variantRows) {
    if (!productMap.has(row.productId)) productMap.set(row.productId, {
      id: row.productId, name: row.productName, slug: row.slug, brandName: row.brandName, variants: [],
    });
    productMap.get(row.productId).variants.push({
      id: row.variantId, sku: row.sku, label: row.label, storage: row.storage, simType: row.simType,
      color: row.colorNameRu || row.colorName, price: row.price, availability: row.availability,
      imageUrl: publicMediaUrl(row.storagePath),
    });
  }
  const products = Array.from(productMap.values());
  const variantsById = new Map(products.flatMap((product) => product.variants.map((variant: any) => [variant.id, variant])));
  const enrichedData = data.map((entry) => ({ ...entry, variant: entry.variantId ? variantsById.get(entry.variantId) ?? null : null }));

  return {
    data: enrichedData,
    products,
    cities,
    city: city?.slug ?? "",
    schemaReady,
    legacyProductLevelAvailable: collection === "best_offers" && schema.tableExists,
  };
}

export function collectionError(error: unknown) {
  const value = error && typeof error === "object" ? error as { message?: string; code?: string; meta?: { code?: string } } : {};
  return { message: value.message ?? "COLLECTION_FAILED", code: value.meta?.code ?? value.code };
}
