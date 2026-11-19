import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { buildPublicVariantAttributeLabels, buildPublicVariantAttributes } from "@/lib/catalog-variant-attributes";
import { z } from "zod";
import { apiError, cityValidationError, findCity, imageUrl, invalidInputError, publicAvailability, readOnly, readRequestUrl, validateCity } from "@/lib/catalog-api";
import { parseJson } from "@/lib/catalog-dto";
import { catalogSearchModelTokenGroups, catalogSearchTokenGroups, normalizeCatalogSearchQuery } from "@/lib/catalog-search";
import { TRADE_IN_CATEGORY_SLUG, tradeInProductDetails } from "@/lib/trade-in-product";
import { CATALOG_MENU_SETTING_KEY, parseCatalogMenu, resolveCatalogMenu, type CatalogMenuRule, type MenuTaxonomy } from "@/lib/catalog-menu";
import { groupRuleWhere, groupSchema, groupVariantWhere } from "@/lib/product-groups";
import { calculateOldPrice } from "@/lib/product-price";

export const dynamic = "force-dynamic";

const querySchema = z.object({ q: z.string().trim().max(100).optional(), brand: z.string().trim().max(160).optional(), category: z.string().trim().max(160).optional(), type: z.string().trim().max(160).optional(), modelId: z.string().trim().max(160).optional(), groupId: z.string().trim().max(160).optional(), scopeBrand: z.string().trim().max(160).optional(), scopeCategory: z.string().trim().max(160).optional(), scopeType: z.string().trim().max(160).optional(), menuItem: z.string().trim().max(80).optional(), color: z.string().trim().max(160).optional(), memory: z.string().trim().max(100).optional(), ram: z.string().trim().max(100).optional(), sim: z.string().trim().max(100).optional(), connectivity: z.string().trim().max(160).optional(), limit: z.coerce.number().int().min(1).max(100).default(24), offset: z.coerce.number().int().min(0).max(10000).default(0) });

const attributeCodePattern = /^[a-zA-Z0-9_-]{1,80}$/;

function parseAttributeFilters(searchParams: URLSearchParams) {
  const filters = new Map<string, string[]>();
  for (const entry of searchParams.getAll("attribute")) {
    const separator = entry.indexOf(":");
    const code = separator > 0 ? entry.slice(0, separator).trim() : "";
    const value = separator > 0 ? entry.slice(separator + 1).trim().replace(/\s+/g, " ") : "";
    if (!attributeCodePattern.test(code) || !value || value.length > 200) return null;
    const values = filters.get(code) ?? [];
    if (!values.some((current) => current.toLocaleLowerCase("ru-RU") === value.toLocaleLowerCase("ru-RU"))) values.push(value);
    filters.set(code, values);
  }
  return Array.from(filters.entries()).map(([code, values]) => ({ code, values }));
}

export async function GET(request: Request) {
  const url = readRequestUrl(request);
  const citySlug = validateCity(url.searchParams.get("city"));
  if (!citySlug) return cityValidationError();
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return invalidInputError();
  const filters = parsed.data;
  const attributeFilters = parseAttributeFilters(url.searchParams);
  if (!attributeFilters) return invalidInputError();

  try {
    const data = await readOnly(async (tx) => {
      const city = await findCity(tx, citySlug);
      if (!city) return null;
      let menuCondition = Prisma.sql`TRUE`;
      let tradeInListing = filters.category === TRADE_IN_CATEGORY_SLUG || filters.scopeCategory === TRADE_IN_CATEGORY_SLUG;
      let groupCondition = Prisma.sql`TRUE`;
      let groupVariantCondition = Prisma.sql`TRUE`;
      const menuGroupConditions: Prisma.Sql[] = [];
      const menuGroupVariantConditions: Prisma.Sql[] = [];
      const groupSchemaState = filters.groupId || filters.menuItem ? await groupSchema(tx) : null;
      const includeGroupVariants = groupSchemaState?.variants === true;
      if (filters.groupId) {
        const group = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM catalog_groups WHERE id=${filters.groupId} AND isactive=TRUE LIMIT 1`;
        menuGroupConditions.push(group.length ? groupRuleWhere(filters.groupId, includeGroupVariants) : Prisma.sql`FALSE`);
        menuGroupVariantConditions.push(group.length ? groupVariantWhere(filters.groupId, includeGroupVariants) : Prisma.sql`FALSE`);
      }
      if (filters.menuItem) {
        const settings = await tx.$queryRaw<Array<{ key: string; value: unknown }>>`SELECT key,value FROM settings WHERE key IN ('catalog.megaMenu','catalog.megaMenuBanners')`;
        const [brands, types, categories, models, legacyMappings] = await Promise.all([
          tx.$queryRaw<MenuTaxonomy["brands"]>`SELECT id,slug,name FROM brands WHERE "isActive"=TRUE`,
          tx.$queryRaw<MenuTaxonomy["types"]>`SELECT id,"canonicalKey" AS slug,name FROM global_product_types WHERE "isActive"=TRUE`,
          tx.$queryRaw<MenuTaxonomy["categories"]>`SELECT id,slug,name,"parentId" FROM categories WHERE "isActive"=TRUE`,
          tx.$queryRaw<MenuTaxonomy["models"]>`SELECT id,name,"brandId","globalProductTypeId" FROM product_models WHERE "isActive"=TRUE`,
          tx.$queryRaw<Array<{ legacyProductTypeId: string; globalProductTypeId: string }>>`SELECT "legacyProductTypeId","globalProductTypeId" FROM legacy_product_type_mappings`,
        ]);
        const taxonomy: MenuTaxonomy = { brands, types, categories, models };
        const saved = settings.find((entry) => entry.key === CATALOG_MENU_SETTING_KEY)?.value;
        const legacy = settings.find((entry) => entry.key === "catalog.megaMenuBanners")?.value;
        const menu = resolveCatalogMenu(parseCatalogMenu(saved), taxonomy, legacy, legacyMappings);
        const item = menu.items.find((entry) => entry.id === filters.menuItem && entry.visible);
        let rules: CatalogMenuRule[] | null = null;
        if (item?.action?.type === "group") {
          const group = includeGroupVariants
            ? await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM catalog_groups WHERE id=${item.action.groupId} AND isactive=TRUE LIMIT 1`
            : [];
          if (group.length) {
            menuGroupConditions.push(Prisma.sql`EXISTS (
              SELECT 1 FROM catalog_group_variants menu_gv
              JOIN product_variants menu_gv_variant ON menu_gv_variant.id=menu_gv."variantId"
              WHERE menu_gv."groupId"=${item.action.groupId} AND menu_gv_variant."productId"=p0.id
            )`);
            menuGroupVariantConditions.push(Prisma.sql`EXISTS (
              SELECT 1 FROM catalog_group_variants menu_gv
              WHERE menu_gv."groupId"=${item.action.groupId} AND menu_gv."variantId"=pv.id
            )`);
          } else {
            menuCondition = Prisma.sql`FALSE`;
          }
        } else if (item?.action?.type === "filters") {
          rules = item.action.rules;
        } else if (item?.action?.type === "category") {
          if (item.id === "accessories-other") {
            menuCondition = Prisma.sql`c0.id = ${item.action.categoryId}`;
          } else {
            rules = [item.action.categoryId === TRADE_IN_CATEGORY_SLUG ? { field: "tradeIn", value: true } : { field: "category", value: item.action.categoryId }];
          }
        } else {
          menuCondition = Prisma.sql`FALSE`;
        }
        if (menuGroupConditions.length) groupCondition = Prisma.join(menuGroupConditions.map((condition) => Prisma.sql`(${condition})`), " AND ");
        if (menuGroupVariantConditions.length) groupVariantCondition = Prisma.join(menuGroupVariantConditions.map((condition) => Prisma.sql`(${condition})`), " AND ");
        if (rules) {
          if (rules.some((rule) => rule.field === "tradeIn")) tradeInListing = true;
          const conditions = rules.map((rule) => {
            if (rule.field === "brand") return Prisma.sql`b0.id = ${String(rule.value)}`;
            if (rule.field === "type") return Prisma.sql`pt0.id = ${String(rule.value)}`;
            if (rule.field === "model") return Prisma.sql`p0."modelId" = ${String(rule.value)}`;
            if (rule.field === "category") return Prisma.sql`c0.id IN (WITH RECURSIVE menu_categories(id) AS (SELECT id FROM categories WHERE id=${String(rule.value)} UNION ALL SELECT child.id FROM categories child JOIN menu_categories parent ON child."parentId"=parent.id WHERE child."isActive"=TRUE) SELECT id FROM menu_categories)`;
            return Prisma.sql`p0.specifications @> '{"tradeIn":true}'::jsonb AND EXISTS (SELECT 1 FROM product_variants menu_used_v JOIN inventory menu_used_i ON menu_used_i."variantId"=menu_used_v.id WHERE menu_used_v."productId"=p0.id AND menu_used_v."isActive"=TRUE AND menu_used_i."cityId"=${city.id} AND menu_used_i."isActive"=TRUE AND menu_used_i.availability::text='IN_STOCK')`;
          });
          menuCondition = conditions.length ? Prisma.join(conditions, " AND ") : Prisma.sql`FALSE`;
        }
      }
      const normalizedQuery = normalizeCatalogSearchQuery(filters.q ?? "");
      const searchTokenGroups = catalogSearchTokenGroups(normalizedQuery);
      const modelSearchTokenGroups = catalogSearchModelTokenGroups(normalizedQuery);
      const searchCondition = searchTokenGroups.length ? Prisma.sql`EXISTS (
        SELECT 1 FROM product_variants sv0
        JOIN inventory si0 ON si0."variantId"=sv0.id AND si0."cityId"=${city.id} AND si0."isActive"=TRUE
        LEFT JOIN colors sc0 ON sc0.id=sv0."colorId"
        WHERE sv0."productId"=p0.id AND sv0."isActive"=TRUE
          AND (${variantSearchCondition(searchTokenGroups, {
            product: Prisma.sql`p0`, brand: Prisma.sql`b0`, type: Prisma.sql`pt0`, category: Prisma.sql`c0`,
            variant: Prisma.sql`sv0`, color: Prisma.sql`sc0`,
          })})
      )` : Prisma.sql`TRUE`;
      const exactSearch = `%${normalizedQuery}%`;
      const dynamicAttributeCondition = attributeFilters.length
        ? Prisma.join(attributeFilters.map(({ code, values }) => Prisma.sql`(
            lower(regexp_replace(btrim(COALESCE(fv.attributes ->> ${code}, '')), '[[:space:]]+', ' ', 'g')) IN (${Prisma.join(values.map((value) => Prisma.sql`lower(${value})`))})
            OR EXISTS (
              SELECT 1 FROM product_variant_attribute_values dynamic_av
              JOIN attribute_definitions dynamic_ad ON dynamic_ad.id=dynamic_av."definitionId" AND dynamic_ad.code=${code}
              JOIN attribute_options dynamic_ao ON dynamic_ao.id=dynamic_av."optionId"
              WHERE dynamic_av."variantId"=fv.id
                AND lower(regexp_replace(btrim(dynamic_ao.label), '[[:space:]]+', ' ', 'g')) IN (${Prisma.join(values.map((value) => Prisma.sql`lower(${value})`))})
            )
          )`), " AND ")
        : Prisma.sql`TRUE`;
      const rows = await tx.$queryRaw<ProductRow[]>`
        WITH page AS (
          SELECT p0.id,
            CASE
              WHEN ${normalizedQuery} <> '' AND regexp_replace(lower(p0.name), '[[:space:]]+', ' ', 'g') = ${normalizedQuery} THEN 0
              WHEN ${normalizedQuery} <> '' AND EXISTS (
                SELECT 1 FROM product_variants exact_variant
                WHERE exact_variant."productId"=p0.id AND exact_variant."isActive"=TRUE
                  AND (lower(exact_variant.sku)=${normalizedQuery} OR lower(exact_variant.label)=${normalizedQuery})
              ) THEN 1
              WHEN ${normalizedQuery} <> '' AND lower(p0.name) LIKE ${`${normalizedQuery}%`} THEN 2
              WHEN ${normalizedQuery} <> '' AND lower(p0.name) LIKE ${exactSearch} THEN 3
              ELSE 4
            END AS "searchRank"
          FROM products p0
          JOIN brands b0 ON b0.id = p0."brandId" AND b0."isActive" = TRUE
          JOIN global_product_types pt0 ON pt0.id = p0."globalProductTypeId" AND pt0."isActive" = TRUE
          JOIN categories c0 ON c0.id = p0."categoryId" AND c0."isActive" = TRUE
          WHERE p0.status = 'PUBLISHED'::"ProductStatus"
            AND (${tradeInListing} OR NOT (p0.specifications @> '{"tradeIn":true}'::jsonb))
            AND EXISTS (SELECT 1 FROM product_variants v0 JOIN inventory i0 ON i0."variantId" = v0.id WHERE v0."productId" = p0.id AND v0."isActive" = TRUE AND i0."cityId" = ${city.id} AND i0."isActive" = TRUE)
            AND (${menuCondition})
            AND (${groupCondition})
            AND (${filters.brand ?? null}::text IS NULL OR p0."brandId"::text = ${filters.brand ?? null} OR b0.slug = ${filters.brand ?? null})
            AND (${filters.scopeBrand ?? null}::text IS NULL OR p0."brandId"::text = ${filters.scopeBrand ?? null} OR b0.slug = ${filters.scopeBrand ?? null})
            AND (${filters.category ?? null}::text IS NULL
              OR (${filters.category ?? null} = ${TRADE_IN_CATEGORY_SLUG} AND p0.specifications @> '{"tradeIn":true}'::jsonb)
              OR (${filters.category ?? null}::text IS DISTINCT FROM ${TRADE_IN_CATEGORY_SLUG}
                AND (p0."categoryId"::text = ${filters.category ?? null} OR c0.slug = ${filters.category ?? null}
                  OR c0."parentId"::text = ${filters.category ?? null}
                  OR c0."parentId" = (SELECT parent_category.id FROM categories parent_category WHERE parent_category.slug = ${filters.category ?? null} LIMIT 1))))
            AND (${filters.category ?? null}::text IS DISTINCT FROM ${TRADE_IN_CATEGORY_SLUG} OR EXISTS (
              SELECT 1 FROM product_variants used_variant
              JOIN inventory used_inventory ON used_inventory."variantId"=used_variant.id
              WHERE used_variant."productId"=p0.id AND used_variant."isActive"=TRUE
                AND used_inventory."cityId"=${city.id} AND used_inventory."isActive"=TRUE
                AND used_inventory.availability::text='IN_STOCK'
            ))
            AND (${filters.scopeCategory ?? null}::text IS NULL
              OR (${filters.scopeCategory ?? null} = ${TRADE_IN_CATEGORY_SLUG} AND p0.specifications @> '{"tradeIn":true}'::jsonb)
              OR (${filters.scopeCategory ?? null}::text IS DISTINCT FROM ${TRADE_IN_CATEGORY_SLUG}
                AND (p0."categoryId"::text = ${filters.scopeCategory ?? null} OR c0.slug = ${filters.scopeCategory ?? null}
                  OR c0."parentId"::text = ${filters.scopeCategory ?? null}
                  OR c0."parentId" = (SELECT parent_category.id FROM categories parent_category WHERE parent_category.slug = ${filters.scopeCategory ?? null} LIMIT 1))))
            AND (${filters.scopeCategory ?? null}::text IS DISTINCT FROM ${TRADE_IN_CATEGORY_SLUG} OR EXISTS (
              SELECT 1 FROM product_variants scoped_used_variant
              JOIN inventory scoped_used_inventory ON scoped_used_inventory."variantId"=scoped_used_variant.id
              WHERE scoped_used_variant."productId"=p0.id AND scoped_used_variant."isActive"=TRUE
                AND scoped_used_inventory."cityId"=${city.id} AND scoped_used_inventory."isActive"=TRUE
                AND scoped_used_inventory.availability::text='IN_STOCK'
            ))
            AND (${filters.type ?? null}::text IS NULL OR p0."globalProductTypeId"::text = ${filters.type ?? null} OR pt0."canonicalKey" = ${filters.type ?? null} OR pt0.name = ${filters.type ?? null}
              OR (${filters.type ?? null} = 'smartphone' AND lower(pt0."canonicalKey") = 'product_type:smartphone')
              OR (${filters.type ?? null} = 'tablet' AND lower(pt0."canonicalKey") = 'product_type:tablet')
              OR (${filters.type ?? null} = 'console' AND lower(pt0."canonicalKey") = 'product_type:console')
              OR (${filters.type ?? null} = 'vacuum' AND lower(pt0."canonicalKey") = 'product_type:vacuum'))
            AND (${filters.modelId ?? null}::text IS NULL OR EXISTS (SELECT 1 FROM product_models filter_model WHERE filter_model.id=${filters.modelId ?? null} AND filter_model."brandId"=p0."brandId" AND filter_model."globalProductTypeId"=p0."globalProductTypeId" AND p0."modelId"=filter_model.id))
            AND (${filters.scopeType ?? null}::text IS NULL OR p0."globalProductTypeId"::text = ${filters.scopeType ?? null} OR pt0."canonicalKey" = ${filters.scopeType ?? null} OR pt0.name = ${filters.scopeType ?? null})
            AND EXISTS (
              SELECT 1 FROM product_variants fv
              JOIN inventory fi ON fi."variantId" = fv.id AND fi."cityId" = ${city.id} AND fi."isActive" = TRUE
              LEFT JOIN colors fc ON fc.id = fv."colorId"
              WHERE fv."productId" = p0.id AND fv."isActive" = TRUE
                AND (${filters.color ?? null}::text IS NULL OR fc.id::text = ${filters.color ?? null} OR fc.slug = ${filters.color ?? null} OR fc.name = ${filters.color ?? null})
                AND (${filters.memory ?? null}::text IS NULL OR lower(fv.storage) = lower(${filters.memory ?? null}) OR EXISTS (
                  SELECT 1 FROM product_variant_attribute_values mav
                  JOIN attribute_definitions mad ON mad.id=mav."definitionId" AND mad.code='memory'
                  JOIN attribute_options mao ON mao.id=mav."optionId"
                  LEFT JOIN attribute_option_aliases maa ON maa."optionId"=mao.id
                  WHERE mav."variantId"=fv.id AND (lower(mao.label)=lower(${filters.memory ?? null}) OR lower(maa."aliasLabel")=lower(${filters.memory ?? null}))
                ))
                AND (${filters.ram ?? null}::text IS NULL OR lower(fv.ram) = lower(${filters.ram ?? null}))
                AND (${filters.sim ?? null}::text IS NULL OR lower(fv."simType") = lower(${filters.sim ?? null}) OR EXISTS (
                  SELECT 1 FROM product_variant_attribute_values sav
                  JOIN attribute_definitions sad ON sad.id=sav."definitionId" AND sad.code='sim'
                  JOIN attribute_options sao ON sao.id=sav."optionId"
                  LEFT JOIN attribute_option_aliases saa ON saa."optionId"=sao.id
                  WHERE sav."variantId"=fv.id AND (lower(sao.label)=lower(${filters.sim ?? null}) OR lower(saa."aliasLabel")=lower(${filters.sim ?? null}))
                ))
                AND (${filters.connectivity ?? null}::text IS NULL OR lower(fv.connectivity) = lower(${filters.connectivity ?? null}))
                AND (${dynamicAttributeCondition})
            )
            AND (${searchCondition})
            AND (${modelSearchTokenGroups.length ? productIdentitySearchCondition(modelSearchTokenGroups, Prisma.sql`p0`, Prisma.sql`b0`) : Prisma.sql`TRUE`})
          ORDER BY "searchRank", p0."manualOrder", p0."isNew" DESC, p0.name, p0.id
          LIMIT ${filters.limit} OFFSET ${filters.offset}
        )
        SELECT p.id, p.slug, p.name, p.model, p.generation, p.chip, p."displaySize", p."releaseYear",
               p.description, p.specifications, p."isNew",
               b.id AS "brandId", b.name AS "brandName", b.slug AS "brandSlug",
               pt.id AS "typeId", pt.name AS "typeName", pt."canonicalKey" AS "typeSlug", NULL::jsonb AS "typeAttributes",
               c.id AS "categoryId", c.name AS "categoryName", c.slug AS "categorySlug", c."parentId",
               pv.id AS "variantId", pv.sku, pv.label AS "variantLabel", pv.storage, pv.ram, pv."simType", pv.connectivity, pv.size, pv.material, pv.attributes AS "variantAttributes",
               color.id AS "colorId", color.name AS "colorName", to_jsonb(color)->>'nameRu' AS "colorNameRu", color.slug AS "colorSlug", color."hexPrimary", color."hexSecondary",
               inv.price::text AS price, inv."oldPrice"::text AS "oldPrice", inv.availability::text AS availability, inv."allowPreorder", inv."deliveryTime",
               gallery.id AS "imageId", gallery."sortOrder" AS "imageOrder", gallery."colorId" AS "imageColorId", gallery."storagePath" AS "imagePath", gallery."mimeType" AS "imageMimeType", gallery.alt AS "imageAlt"
        FROM page pg
        JOIN products p ON p.id = pg.id
        JOIN brands b ON b.id = p."brandId" AND b."isActive" = TRUE
        JOIN global_product_types pt ON pt.id = p."globalProductTypeId" AND pt."isActive" = TRUE
        JOIN categories c ON c.id = p."categoryId" AND c."isActive" = TRUE
        JOIN product_variants pv ON pv."productId" = p.id AND pv."isActive" = TRUE AND (${groupVariantCondition})
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
          AND (${searchTokenGroups.length ? variantSearchCondition(searchTokenGroups, {
            product: Prisma.sql`p`, brand: Prisma.sql`b`, type: Prisma.sql`pt`, category: Prisma.sql`c`,
            variant: Prisma.sql`pv`, color: Prisma.sql`color`,
          }) : Prisma.sql`TRUE`})
        ORDER BY pg."searchRank", p."manualOrder", p."isNew" DESC, p.name, pv.sku, gallery."sortOrder"
      `;
      const dictionaryRows = rows.length ? await tx.$queryRaw<VariantDictionaryRow[]>`
        SELECT pav."variantId", d.code, d.name, o.label
        FROM product_variant_attribute_values pav
        JOIN attribute_definitions d ON d.id=pav."definitionId"
        JOIN attribute_options o ON o.id=pav."optionId"
        WHERE pav."variantId" IN (${Prisma.join(Array.from(new Set(rows.map((row) => row.variantId))))})
      ` : [];
      return groupProducts(rows, city, dictionaryRows);
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

type VariantDictionaryRow = { variantId: string; code: string; label: string; name: string };

type SearchAliases = { product: Prisma.Sql; brand: Prisma.Sql; type: Prisma.Sql; category: Prisma.Sql; variant: Prisma.Sql; color: Prisma.Sql };

function variantSearchCondition(tokenGroups: string[][], aliases: SearchAliases) {
  const { product, brand, type, category, variant, color } = aliases;
  return Prisma.join(tokenGroups.map((alternatives) => Prisma.sql`(
    ${Prisma.join(alternatives.map((term) => {
      const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
      return Prisma.sql`
        ${product}.name ILIKE ${pattern} OR COALESCE(${product}.model, '') ILIKE ${pattern}
        OR COALESCE(${product}.generation, '') ILIKE ${pattern} OR COALESCE(${product}.chip, '') ILIKE ${pattern}
        OR COALESCE(${product}."displaySize", '') ILIKE ${pattern}
        OR ${brand}.name ILIKE ${pattern} OR ${brand}.slug ILIKE ${pattern}
        OR ${type}.name ILIKE ${pattern} OR ${category}.name ILIKE ${pattern}
        OR ${variant}.sku ILIKE ${pattern} OR ${variant}.label ILIKE ${pattern}
        OR COALESCE(${variant}.storage, '') ILIKE ${pattern} OR COALESCE(${variant}.ram, '') ILIKE ${pattern}
        OR COALESCE(${variant}."simType", '') ILIKE ${pattern} OR COALESCE(${variant}.connectivity, '') ILIKE ${pattern}
        OR COALESCE(${variant}.size, '') ILIKE ${pattern} OR COALESCE(${variant}.material, '') ILIKE ${pattern}
        OR COALESCE(${variant}.attributes::text, '') ILIKE ${pattern}
        OR COALESCE(${color}.name, '') ILIKE ${pattern} OR COALESCE(to_jsonb(${color})->>'nameRu', '') ILIKE ${pattern}
        OR COALESCE(${color}.slug, '') ILIKE ${pattern}
        OR EXISTS (
          SELECT 1 FROM product_variant_attribute_values search_av
          JOIN attribute_options search_ao ON search_ao.id=search_av."optionId"
          LEFT JOIN attribute_option_aliases search_aa ON search_aa."optionId"=search_ao.id
          WHERE search_av."variantId"=${variant}.id
            AND (search_ao.label ILIKE ${pattern} OR search_ao."canonicalKey" ILIKE ${pattern} OR search_aa."aliasLabel" ILIKE ${pattern})
        )`;
    }), " OR ")}
  )`), " AND ");
}

function productIdentitySearchCondition(tokenGroups: string[][], product: Prisma.Sql, brand: Prisma.Sql) {
  const identity = Prisma.sql`concat(' ', regexp_replace(lower(concat_ws(' ', ${brand}.name, ${product}.name, ${product}.model, ${product}.generation)), '[^a-zа-яё0-9]+', ' ', 'g'), ' ')`;
  return Prisma.join(tokenGroups.map((group) => Prisma.sql`(${Prisma.join(group.map((alias) => Prisma.sql`${identity} LIKE ${`% ${normalizeCatalogSearchQuery(alias)} %`}`), " OR ")})`), " AND ");
}

function groupProducts(rows: ProductRow[], city: City, dictionaryRows: VariantDictionaryRow[]) {
  const dictionaryAttributes = new Map<string, VariantDictionaryRow[]>();
  for (const row of dictionaryRows) dictionaryAttributes.set(row.variantId, [...(dictionaryAttributes.get(row.variantId) ?? []), row]);
  const products = new Map<string, { id: string; slug: string; name: string; model: string | null; generation: string | null; chip: string | null; displaySize: string | null; releaseYear: number | null; description: unknown; specifications: unknown; isNew: boolean; isUsed: boolean; brand: { id: string; name: string; slug: string }; type: { id: string; name: string; slug: string; attributes: unknown }; category: { id: string; name: string; slug: string; parentId: string | null }; city: { name: string; slug: string }; variants: Map<string, object>; images: Map<string, object> }>();
  for (const row of rows) {
    let product = products.get(row.id);
    if (!product) {
      const specifications = parseJson(row.specifications);
      product = { id: row.id, slug: row.slug, name: row.name, model: row.model, generation: row.generation, chip: row.chip, displaySize: row.displaySize, releaseYear: row.releaseYear, description: parseJson(row.description), specifications, isNew: row.isNew, isUsed: tradeInProductDetails(specifications).isUsed, brand: { id: row.brandId, name: row.brandName, slug: row.brandSlug }, type: { id: row.typeId, name: row.typeName, slug: row.typeSlug, attributes: parseJson(row.typeAttributes) }, category: { id: row.categoryId, name: row.categoryName, slug: row.categorySlug, parentId: row.parentId }, city: { name: city.name, slug: city.slug }, variants: new Map(), images: new Map() };
      products.set(row.id, product);
    }
    if (!product.variants.has(row.variantId)) {
      const attributes = buildPublicVariantAttributes(parseJson(row.variantAttributes), { storage: row.storage, ram: row.ram, simType: row.simType, connectivity: row.connectivity, size: row.size, material: row.material }, dictionaryAttributes.get(row.variantId));
      product.variants.set(row.variantId, { id: row.variantId, sku: row.sku, label: row.variantLabel, attributes, attributeLabels: buildPublicVariantAttributeLabels(dictionaryAttributes.get(row.variantId)), color: row.colorId ? { id: row.colorId, name: row.colorName, nameRu: row.colorNameRu, slug: row.colorSlug, hex: row.hexPrimary, secondaryHex: row.hexSecondary } : null, price: row.price, oldPrice: calculateOldPrice(row.price)?.toString() ?? null, availability: publicAvailability(row.availability, row.allowPreorder), deliveryTime: row.deliveryTime });
    }
    if (row.imageId && !product.images.has(row.imageId)) product.images.set(row.imageId, { id: row.imageId, src: imageUrl(row.imagePath, row.imageMimeType), alt: row.imageAlt ?? "", colorId: row.imageColorId, order: row.imageOrder ?? 0 });
  }
  return Array.from(products.values()).map(({ variants, images, ...product }) => ({ ...product, variants: Array.from(variants.values()), images: Array.from(images.values()) }));
}
