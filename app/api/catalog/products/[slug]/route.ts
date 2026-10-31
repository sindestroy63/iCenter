import { NextResponse } from "next/server";
import { apiError, cityValidationError, findCity, imageUrl, publicAvailability, readOnly, readRequestUrl, validateCity, validateSlug } from "@/lib/catalog-api";
import { parseJson } from "@/lib/catalog-dto";
import { tradeInProductDetails } from "@/lib/trade-in-product";
import { parseSlugAliases } from "@/lib/product-slug";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  if (!validateSlug(params.slug)) return NextResponse.json({ error: "Invalid product slug" }, { status: 400 });
  const citySlug = validateCity(readRequestUrl(request).searchParams.get("city"));
  if (!citySlug) return cityValidationError();
  try {
    const data = await readOnly(async (tx) => {
      const city = await findCity(tx, citySlug);
      if (!city) return null;
      const currentProduct = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM products WHERE slug=${params.slug} LIMIT 1`;
      let productId: string | undefined = currentProduct[0]?.id;
      if (!productId) {
      const aliasRows = await tx.$queryRaw<Array<{ value: unknown }>>`SELECT value FROM settings WHERE key='products.slugAliases' LIMIT 1`;
        productId = parseSlugAliases(aliasRows[0]?.value).find((alias) => alias.slug === params.slug)?.productId;
      }
      if (!productId) return { city, rows: [], product: null };
      const resolvedProductId = productId;
      const rows = await tx.$queryRaw<Array<{ id: string; slug: string; name: string; model: string | null; generation: string | null; chip: string | null; displaySize: string | null; releaseYear: number | null; description: unknown; specifications: unknown; isNew: boolean; brandId: string; brandName: string; brandSlug: string; typeId: string; typeName: string; typeSlug: string; typeAttributes: unknown; categoryId: string; categoryName: string; categorySlug: string; parentId: string | null; variantId: string; sku: string; label: string; storage: string | null; ram: string | null; simType: string | null; connectivity: string | null; size: string | null; material: string | null; attributes: unknown; colorId: string | null; colorName: string | null; colorNameRu: string | null; colorSlug: string | null; hexPrimary: string | null; hexSecondary: string | null; price: string | null; oldPrice: string | null; availability: string; allowPreorder: boolean; deliveryTime: string | null; imageId: string | null; imageOrder: number | null; imageColorId: string | null; imagePath: string | null; imageMimeType: string | null; imageAlt: string | null }>>`
        SELECT p.id, p.slug, p.name, p.model, p.generation, p.chip, p."displaySize", p."releaseYear", p.description, p.specifications, p."isNew",
               b.id AS "brandId", b.name AS "brandName", b.slug AS "brandSlug",
               pt.id AS "typeId", pt.name AS "typeName", pt.slug AS "typeSlug", pt."variantAttributes" AS "typeAttributes",
               c.id AS "categoryId", c.name AS "categoryName", c.slug AS "categorySlug", c."parentId",
               pv.id AS "variantId", pv.sku, pv.label, pv.storage, pv.ram, pv."simType", pv.connectivity, pv.size, pv.material, pv.attributes,
               color.id AS "colorId", color.name AS "colorName", to_jsonb(color)->>'nameRu' AS "colorNameRu", color.slug AS "colorSlug", color."hexPrimary", color."hexSecondary",
               inv.price::text AS price, inv."oldPrice"::text AS "oldPrice", inv.availability::text AS availability, inv."allowPreorder", inv."deliveryTime",
               gallery.id AS "imageId", gallery."sortOrder" AS "imageOrder", gallery."colorId" AS "imageColorId", gallery."storagePath" AS "imagePath", gallery."mimeType" AS "imageMimeType", gallery.alt AS "imageAlt"
        FROM products p
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
        WHERE p.id = ${resolvedProductId} AND p.status = 'PUBLISHED'::"ProductStatus"
        ORDER BY pv.sku, gallery."sortOrder"
      `;
      if (rows.length === 0) return { city, rows, product: null };
      const first = rows[0];
      let relatedRows: Array<{ id: string }> = [];
      const relationState = await tx.$queryRaw<Array<{ relation: string | null }>>`
        SELECT to_regclass('public.product_related_products')::text AS relation
      `;
      if (relationState[0]?.relation) {
        relatedRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT related.id
          FROM product_related_products link
          JOIN products related ON related.id=link."relatedProductId" AND related.status='PUBLISHED'::"ProductStatus"
          WHERE link."productId"=${first.id}
            AND EXISTS (
              SELECT 1 FROM product_variants rv
              JOIN inventory ri ON ri."variantId"=rv.id AND ri."cityId"=${city.id} AND ri."isActive"=TRUE
              WHERE rv."productId"=related.id AND rv."isActive"=TRUE
                AND (ri.availability IN ('IN_STOCK'::"AvailabilityStatus",'PREORDER'::"AvailabilityStatus") OR ri."allowPreorder"=TRUE)
            )
          ORDER BY link."sortOrder"
          LIMIT 12
        `;
      }
      const dictionaryRows = await tx.$queryRaw<Array<{ variantId: string; code: string; label: string }>>`
        SELECT pav."variantId", d.code, o.label
        FROM product_variant_attribute_values pav
        JOIN product_variants pv ON pv.id = pav."variantId" AND pv."productId" = ${first.id}
        JOIN attribute_definitions d ON d.id = pav."definitionId"
        JOIN attribute_options o ON o.id = pav."optionId"
      `;
      const dynamicAttributes = new Map<string, Array<{ code: string; label: string }>>();
      for (const row of dictionaryRows) {
        const entries = dynamicAttributes.get(row.variantId) ?? [];
        if (!entries.some((entry) => entry.code === row.code)) entries.push({ code: row.code, label: row.label });
        dynamicAttributes.set(row.variantId, entries);
      }
      const variants = new Map<string, object>();
      const images = new Map<string, object>();
      const hiddenPublicAttributes = new Set(["region", "model", "productModel", "productLine", "displaySize", "screenSize", "diagonal", "диагональ"]);
      for (const row of rows) {
        if (!variants.has(row.variantId)) {
          const attributes = { ...(parseJson(row.attributes) as Record<string, unknown> | null ?? {}) };
          for (const key of Object.keys(attributes)) if (hiddenPublicAttributes.has(key)) delete attributes[key];
          for (const [key, value] of Object.entries({ storage: row.storage, ram: row.ram, simType: row.simType, connectivity: row.connectivity, size: row.size, material: row.material })) if (value) attributes[key] = value;
          variants.set(row.variantId, { id: row.variantId, sku: row.sku, label: row.label, attributes, color: row.colorId ? { id: row.colorId, name: row.colorName, nameRu: row.colorNameRu, slug: row.colorSlug, hex: row.hexPrimary, secondaryHex: row.hexSecondary } : null, price: row.price, oldPrice: row.oldPrice, availability: publicAvailability(row.availability, row.allowPreorder), deliveryTime: row.deliveryTime });
        }
        if (row.imageId && !images.has(row.imageId)) images.set(row.imageId, { id: row.imageId, src: imageUrl(row.imagePath, row.imageMimeType), alt: row.imageAlt ?? "", colorId: row.imageColorId, order: row.imageOrder ?? 0 });
      }
      for (const [variantId, entries] of Array.from(dynamicAttributes.entries())) {
        const variant = variants.get(variantId) as { attributes: Record<string, unknown> } | undefined;
        if (!variant) continue;
        for (const entry of entries) {
          if (entry.code === "color" || entry.code === "region") continue;
          const publicKey = ({ memory: "storage", sim: "simType" } as Record<string, string>)[entry.code] ?? entry.code;
          variant.attributes[publicKey] = entry.label;
        }
      }
      const specifications = parseJson(first.specifications);
      return { city, product: { id: first.id, slug: first.slug, name: first.name, model: first.model, generation: first.generation, chip: first.chip, displaySize: first.displaySize, releaseYear: first.releaseYear, description: parseJson(first.description), specifications, isNew: first.isNew, isUsed: tradeInProductDetails(specifications).isUsed, brand: { id: first.brandId, name: first.brandName, slug: first.brandSlug }, type: { id: first.typeId, name: first.typeName, slug: first.typeSlug, attributes: parseJson(first.typeAttributes) }, category: { id: first.categoryId, name: first.categoryName, slug: first.categorySlug, parentId: first.parentId }, city: { id: city.id, name: city.name, slug: city.slug }, variants: Array.from(variants.values()), images: Array.from(images.values()), relatedProductIds: relatedRows.map((row) => row.id) } };
    });
    if (!data) return NextResponse.json({ error: "City not found or inactive" }, { status: 404 });
    if (!data.product) return NextResponse.json({ error: "Published product not found for this city" }, { status: 404 });
    return NextResponse.json({ data: data.product, canonicalSlug: data.product.slug });
  } catch (error) {
    return apiError(error, "catalog.product.detail");
  }
}
