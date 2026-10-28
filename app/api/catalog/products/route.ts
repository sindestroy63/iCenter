import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError, cityValidationError, findCity, imageUrl, invalidInputError, publicAvailability, readOnly, readRequestUrl, validateCity } from "@/lib/catalog-api";
import { parseJson } from "@/lib/catalog-dto";
import { expandCatalogSearchQuery, normalizeCatalogSearchQuery } from "@/lib/catalog-search";

export const dynamic = "force-dynamic";

const querySchema = z.object({ q: z.string().trim().max(100).optional(), brand: z.string().trim().max(160).optional(), category: z.string().trim().max(160).optional(), type: z.string().trim().max(160).optional(), productModel: z.string().trim().max(180).optional(), color: z.string().trim().max(160).optional(), memory: z.string().trim().max(100).optional(), ram: z.string().trim().max(100).optional(), sim: z.string().trim().max(100).optional(), connectivity: z.string().trim().max(160).optional(), limit: z.coerce.number().int().min(1).max(100).default(24), offset: z.coerce.number().int().min(0).max(10000).default(0) });

export async function GET(request: Request) {
  const url = readRequestUrl(request);
  const citySlug = validateCity(url.searchParams.get("city"));
  if (!citySlug) return cityValidationError();
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return invalidInputError();
  const filters = parsed.data;

  try {
    const data = await readOnly(async (tx) => {
      const city = await findCity(tx, citySlug);
      if (!city) return null;
      const normalizedQuery = normalizeCatalogSearchQuery(filters.q ?? "");
      const searchPatterns = expandCatalogSearchQuery(normalizedQuery).map((term) => `%${term.replace(/[\\%_]/g, "\\$&")}%`);
      const searchCondition = searchPatterns.length ? Prisma.join(searchPatterns.map((pattern) => Prisma.sql`(
        p0.name ILIKE ${pattern} OR COALESCE(p0.model, '') ILIKE ${pattern} OR b0.name ILIKE ${pattern}
        OR pt0.name ILIKE ${pattern} OR c0.name ILIKE ${pattern}
        OR EXISTS (SELECT 1 FROM product_variants sv0 WHERE sv0."productId" = p0.id AND (sv0.sku ILIKE ${pattern} OR sv0.label ILIKE ${pattern}))
      )`), " OR ") : Prisma.sql`TRUE`;
      const exactSearch = `%${normalizedQuery}%`;
      const rows = await tx.$queryRaw<ProductRow[]>`
        WITH page AS (
          SELECT p0.id
          FROM products p0
          JOIN brands b0 ON b0.id = p0."brandId" AND b0."isActive" = TRUE
          JOIN product_types pt0 ON pt0.id = p0."productTypeId" AND pt0."isActive" = TRUE
          JOIN categories c0 ON c0.id = p0."categoryId" AND c0."isActive" = TRUE
          WHERE p0.status = 'PUBLISHED'::"ProductStatus"
            AND EXISTS (SELECT 1 FROM product_variants v0 JOIN inventory i0 ON i0."variantId" = v0.id WHERE v0."productId" = p0.id AND v0."isActive" = TRUE AND i0."cityId" = ${city.id} AND i0."isActive" = TRUE)
            AND (${filters.brand ?? null}::text IS NULL OR p0."brandId"::text = ${filters.brand ?? null} OR b0.slug = ${filters.brand ?? null})
            AND (${filters.category ?? null}::text IS NULL OR p0."categoryId"::text = ${filters.category ?? null} OR c0.slug = ${filters.category ?? null})
            AND (${filters.type ?? null}::text IS NULL OR p0."productTypeId"::text = ${filters.type ?? null} OR pt0.slug = ${filters.type ?? null}
              OR (${filters.type ?? null} = 'smartphone' AND lower(pt0.slug) IN ('galaxy','iphone'))
              OR (${filters.type ?? null} = 'tablet' AND lower(pt0.slug) = 'ipad')
              OR (${filters.type ?? null} = 'console' AND lower(pt0.slug) = 'playstation')
              OR (${filters.type ?? null} = 'vacuum' AND lower(pt0.slug) = 'vacuum-cleaner'))
            AND (${filters.productModel ?? null}::text IS NULL OR p0.model = ${filters.productModel ?? null} OR p0.slug = ${filters.productModel ?? null})
            AND EXISTS (
              SELECT 1 FROM product_variants fv
              JOIN inventory fi ON fi."variantId" = fv.id AND fi."cityId" = ${city.id} AND fi."isActive" = TRUE
              LEFT JOIN colors fc ON fc.id = fv."colorId"
              WHERE fv."productId" = p0.id AND fv."isActive" = TRUE
                AND (${filters.color ?? null}::text IS NULL OR fc.id::text = ${filters.color ?? null} OR fc.slug = ${filters.color ?? null} OR fc.name = ${filters.color ?? null})
                AND (${filters.memory ?? null}::text IS NULL OR lower(fv.storage) = lower(${filters.memory ?? null}))
                AND (${filters.ram ?? null}::text IS NULL OR lower(fv.ram) = lower(${filters.ram ?? null}))
                AND (${filters.sim ?? null}::text IS NULL OR lower(fv."simType") = lower(${filters.sim ?? null}))
                AND (${filters.connectivity ?? null}::text IS NULL OR lower(fv.connectivity) = lower(${filters.connectivity ?? null}))
            )
            AND (${searchCondition})
          ORDER BY CASE
            WHEN ${normalizedQuery} <> '' AND (regexp_replace(lower(p0.name), '[[:space:]]+', ' ', 'g') = ${normalizedQuery} OR regexp_replace(lower(COALESCE(p0.model, '')), '[[:space:]]+', ' ', 'g') = ${normalizedQuery}) THEN 0
            WHEN ${normalizedQuery} <> '' AND (lower(p0.name) LIKE ${`${normalizedQuery}%`} OR lower(COALESCE(p0.model, '')) LIKE ${`${normalizedQuery}%`}) THEN 1
            WHEN ${normalizedQuery} <> '' AND (lower(p0.name) LIKE ${exactSearch} OR lower(COALESCE(p0.model, '')) LIKE ${exactSearch}) THEN 2
            ELSE 3 END,
            p0."isNew" DESC, p0.name, p0.id
          LIMIT ${filters.limit} OFFSET ${filters.offset}
        )
        SELECT p.id, p.slug, p.name, p.model, p.generation, p.chip, p."displaySize", p."releaseYear",
               p.description, p.specifications, p."isNew",
               b.id AS "brandId", b.name AS "brandName", b.slug AS "brandSlug",
               pt.id AS "typeId", pt.name AS "typeName", pt.slug AS "typeSlug", pt."variantAttributes" AS "typeAttributes",
               c.id AS "categoryId", c.name AS "categoryName", c.slug AS "categorySlug", c."parentId",
               pv.id AS "variantId", pv.sku, pv.label AS "variantLabel", pv.storage, pv.ram, pv."simType", pv.connectivity, pv.size, pv.material, pv.attributes AS "variantAttributes",
               color.id AS "colorId", color.name AS "colorName", to_jsonb(color)->>'nameRu' AS "colorNameRu", color.slug AS "colorSlug", color."hexPrimary", color."hexSecondary",
               inv.price::text AS price, inv."oldPrice"::text AS "oldPrice", inv.availability::text AS availability, inv."allowPreorder", inv."deliveryTime",
               gallery.id AS "imageId", gallery."sortOrder" AS "imageOrder", gallery."colorId" AS "imageColorId", gallery."storagePath" AS "imagePath", gallery."mimeType" AS "imageMimeType", gallery.alt AS "imageAlt"
        FROM page pg
        JOIN products p ON p.id = pg.id
        JOIN brands b ON b.id = p."brandId" AND b."isActive" = TRUE
        JOIN product_types pt ON pt.id = p."productTypeId" AND pt."isActive" = TRUE
        JOIN categories c ON c.id = p."categoryId" AND c."isActive" = TRUE
        JOIN product_variants pv ON pv."productId" = p.id AND pv."isActive" = TRUE
        JOIN inventory inv ON inv."variantId" = pv.id AND inv."cityId" = ${city.id} AND inv."isActive" = TRUE
        LEFT JOIN colors color ON color.id = pv."colorId" AND color."isActive" = TRUE
        LEFT JOIN LATERAL (
          SELECT gi.id, gi."sortOrder", NULL::text AS "colorId", img."storagePath", img."mimeType", img.alt
          FROM product_gallery_images gi JOIN media img ON img.id = gi."mediaId"
          WHERE gi."productId" = p.id
          UNION ALL
          SELECT cgi.id, cgi."sortOrder", cg."colorId", img."storagePath", img."mimeType", img.alt
          FROM color_galleries cg
          JOIN color_gallery_images cgi ON cgi."colorGalleryId" = cg.id
          JOIN media img ON img.id = cgi."mediaId"
          WHERE cg."productId" = p.id
        ) gallery ON TRUE
        WHERE p.status = 'PUBLISHED'::"ProductStatus"
        ORDER BY p."isNew" DESC, p.name, pv.sku, gallery."sortOrder"
      `;
      return groupProducts(rows, city);
    });
    if (!data) return NextResponse.json({ error: "City not found or inactive" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error);
  }
}


type City = { id: string; name: string; slug: string };
type ProductRow = {
  id: string; slug: string; name: string; model: string | null; generation: string | null; chip: string | null; displaySize: string | null; releaseYear: number | null; description: unknown; specifications: unknown; isNew: boolean;
  brandId: string; brandName: string; brandSlug: string; typeId: string; typeName: string; typeSlug: string; typeAttributes: unknown; categoryId: string; categoryName: string; categorySlug: string; parentId: string | null;
  variantId: string; sku: string; variantLabel: string; storage: string | null; ram: string | null; simType: string | null; connectivity: string | null; size: string | null; material: string | null; variantAttributes: unknown;
  colorId: string | null; colorName: string | null; colorNameRu: string | null; colorSlug: string | null; hexPrimary: string | null; hexSecondary: string | null; price: string | null; oldPrice: string | null; availability: string; allowPreorder: boolean; deliveryTime: string | null;
  imageId: string | null; imageOrder: number | null; imageColorId: string | null; imagePath: string | null; imageMimeType: string | null; imageAlt: string | null;
};

function groupProducts(rows: ProductRow[], city: City) {
  const products = new Map<string, { id: string; slug: string; name: string; model: string | null; generation: string | null; chip: string | null; displaySize: string | null; releaseYear: number | null; description: unknown; specifications: unknown; isNew: boolean; brand: { id: string; name: string; slug: string }; type: { id: string; name: string; slug: string; attributes: unknown }; category: { id: string; name: string; slug: string; parentId: string | null }; city: { name: string; slug: string }; variants: Map<string, object>; images: Map<string, object> }>();
  for (const row of rows) {
    let product = products.get(row.id);
    if (!product) {
      product = { id: row.id, slug: row.slug, name: row.name, model: row.model, generation: row.generation, chip: row.chip, displaySize: row.displaySize, releaseYear: row.releaseYear, description: parseJson(row.description), specifications: parseJson(row.specifications), isNew: row.isNew, brand: { id: row.brandId, name: row.brandName, slug: row.brandSlug }, type: { id: row.typeId, name: row.typeName, slug: row.typeSlug, attributes: parseJson(row.typeAttributes) }, category: { id: row.categoryId, name: row.categoryName, slug: row.categorySlug, parentId: row.parentId }, city: { name: city.name, slug: city.slug }, variants: new Map(), images: new Map() };
      products.set(row.id, product);
    }
    if (!product.variants.has(row.variantId)) {
      const attributes = { ...(parseJson(row.variantAttributes) as Record<string, unknown> | null ?? {}) };
      for (const [key, value] of Object.entries({ storage: row.storage, ram: row.ram, simType: row.simType, connectivity: row.connectivity, size: row.size, material: row.material })) if (value) attributes[key] = value;
      product.variants.set(row.variantId, { id: row.variantId, sku: row.sku, label: row.variantLabel, attributes, color: row.colorId ? { id: row.colorId, name: row.colorName, nameRu: row.colorNameRu, slug: row.colorSlug, hex: row.hexPrimary, secondaryHex: row.hexSecondary } : null, price: row.price, oldPrice: row.oldPrice, availability: publicAvailability(row.availability, row.allowPreorder), deliveryTime: row.deliveryTime });
    }
    if (row.imageId && !product.images.has(row.imageId)) product.images.set(row.imageId, { id: row.imageId, src: imageUrl(row.imagePath, row.imageMimeType), alt: row.imageAlt ?? "", colorId: row.imageColorId, order: row.imageOrder ?? 0 });
  }
  return Array.from(products.values()).map(({ variants, images, ...product }) => ({ ...product, variants: Array.from(variants.values()), images: Array.from(images.values()) }));
}
