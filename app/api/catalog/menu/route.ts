import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { logApiError, publicMediaUrl, readOnly } from "@/lib/catalog-api";
import { catalogMenuTree, parseCatalogMenu, resolveCatalogMenu, type CatalogMenuNode, type MenuTaxonomy } from "@/lib/catalog-menu";
import { buildSeoMenu, type SeoMenuNode } from "@/lib/catalog-seo";
import { groupSchema } from "@/lib/product-groups";

export const dynamic = "force-dynamic";

async function menuData(tx: Parameters<Parameters<typeof readOnly>[0]>[0], citySlug: string) {
  const city = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM cities WHERE slug=${citySlug} AND "isActive"=TRUE LIMIT 1`;
  if (!city.length) return null;
  const [rows, activeCategories] = await Promise.all([tx.$queryRaw<Array<{ brandId: string; brandSlug: string; brandName: string; typeId: string; typeSlug: string; typeName: string; categoryId: string; categorySlug: string; categoryName: string; parentId: string | null; modelId: string | null; modelName: string | null; globalProductTypeId: string | null }>>`
    SELECT DISTINCT b.id AS "brandId",b.slug AS "brandSlug",b.name AS "brandName",pt.id AS "typeId",pt."canonicalKey" AS "typeSlug",pt.name AS "typeName",c.id AS "categoryId",c.slug AS "categorySlug",c.name AS "categoryName",c."parentId",m.id AS "modelId",m.name AS "modelName",m."globalProductTypeId"
    FROM products p JOIN brands b ON b.id=p."brandId" AND b."isActive"=TRUE JOIN global_product_types pt ON pt.id=p."globalProductTypeId" AND pt."isActive"=TRUE JOIN categories c ON c.id=p."categoryId" AND c."isActive"=TRUE LEFT JOIN product_models m ON m.id=p."modelId" AND m."isActive"=TRUE
    WHERE p.status='PUBLISHED'::"ProductStatus" AND NOT (p.specifications @> '{"tradeIn":true}'::jsonb) AND EXISTS (SELECT 1 FROM product_variants v JOIN inventory i ON i."variantId"=v.id WHERE v."productId"=p.id AND v."isActive"=TRUE AND i."cityId"=${city[0].id} AND i."isActive"=TRUE)
    ORDER BY b.name,pt.name,c.name
  `, tx.$queryRaw<MenuTaxonomy["categories"]>`SELECT id,slug,name,"parentId" FROM categories WHERE "isActive"=TRUE ORDER BY "sortOrder",name`]);
  const brandMap = new Map<string, MenuTaxonomy["brands"][number]>();
  const typeMap = new Map<string, MenuTaxonomy["types"][number]>();
  const categoryMap = new Map<string, MenuTaxonomy["categories"][number]>();
  const modelMap = new Map<string, MenuTaxonomy["models"][number]>();
  for (const row of rows) {
    brandMap.set(row.brandId, { id: row.brandId, slug: row.brandSlug, name: row.brandName });
    const existingType = typeMap.get(row.typeId);
    typeMap.set(row.typeId, { id: row.typeId, slug: row.typeSlug, name: row.typeName, brandId: row.brandId, brandSlug: row.brandSlug, globalProductTypeId: existingType?.globalProductTypeId ?? row.globalProductTypeId ?? row.typeId });
    categoryMap.set(row.categoryId, { id: row.categoryId, slug: row.categorySlug, name: row.categoryName, parentId: row.parentId });
    if (row.modelId && row.modelName && row.globalProductTypeId) modelMap.set(row.modelId, { id: row.modelId, name: row.modelName, brandId: row.brandId, globalProductTypeId: row.globalProductTypeId, brandName: row.brandName, typeName: row.typeName });
  }
  const legacyRows = await tx.$queryRaw<Array<{ value: unknown }>>`SELECT value FROM settings WHERE key='catalog.megaMenuBanners' LIMIT 1`;
  const settingRows = await tx.$queryRaw<Array<{ value: unknown }>>`SELECT value FROM settings WHERE key='catalog.megaMenu' LIMIT 1`;
  const legacyMappings = await tx.$queryRaw<Array<{ legacyProductTypeId: string; globalProductTypeId: string }>>`SELECT "legacyProductTypeId","globalProductTypeId" FROM legacy_product_type_mappings`;
  const taxonomy: MenuTaxonomy = { brands: Array.from(brandMap.values()), types: Array.from(typeMap.values()), models: Array.from(modelMap.values()), categories: activeCategories };
  const savedConfig = parseCatalogMenu(settingRows[0]?.value);
  const config = resolveCatalogMenu(savedConfig, taxonomy, legacyRows[0]?.value, legacyMappings);
  const enabledIds = config.items.flatMap((item) => [item.banner, item.promoBanner].filter((banner) => item.visible && banner?.enabled && banner.imageMediaId).map((banner) => banner!.imageMediaId!));
  const media = enabledIds.length ? await tx.$queryRaw<Array<{ id: string; storagePath: string }>>`SELECT id,"storagePath" FROM media WHERE id=ANY(${enabledIds}::text[]) AND "mimeType" IN ('image/jpeg','image/png','image/webp')` : [];
  const mediaById = new Map(media.map((entry) => [entry.id, publicMediaUrl(entry.storagePath)]));
  const resolveFilters = (item: CatalogMenuNode) => {
    const action = item.action;
    if (!action || action.type === "url" || action.type === "group") return null;
    if (action.type === "category") return action.categoryId === "trade-in" ? { category: "trade-in" } : { category: taxonomy.categories.find((entry) => entry.id === action.categoryId)?.slug ?? null };
    const result: { brand?: string; type?: string; category?: string; modelId?: string } = {};
    for (const rule of action.rules) {
      if (rule.field === "brand") result.brand = taxonomy.brands.find((entry) => entry.id === String(rule.value))?.slug;
      if (rule.field === "type") result.type = taxonomy.types.find((entry) => entry.id === String(rule.value))?.slug;
      if (rule.field === "category") result.category = taxonomy.categories.find((entry) => entry.id === String(rule.value))?.slug;
      if (rule.field === "model") result.modelId = String(rule.value);
    }
    return result;
  };
  const isService = (item: CatalogMenuNode) => item.action?.type === "url" && /^\/(trade-in|installment|warranty)(?:\/|$)/.test(item.action.href);
  const groupState = await groupSchema(tx);
  const [groupRows, seoBrands, seoTypes, seoModels, seoCategories] = await Promise.all([
    groupState.groups && groupState.products && groupState.rules ? tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM catalog_groups WHERE isactive=TRUE` : Promise.resolve([]),
    tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM brands WHERE "isActive"=TRUE`,
    tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM global_product_types WHERE "isActive"=TRUE`,
    tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM product_models WHERE "isActive"=TRUE`,
    tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM categories WHERE "isActive"=TRUE`,
  ]);
  const groupIds = new Set(groupRows.map((entry) => entry.id));
  const groupProducts = groupIds.size && groupState.products && groupState.rules
    ? await tx.$queryRaw<Array<{ groupId: string; productId: string }>>`
      SELECT DISTINCT active_group.id AS "groupId",product.id AS "productId"
      FROM catalog_groups active_group
      JOIN products product ON product.status='PUBLISHED'::"ProductStatus"
      WHERE active_group.id=ANY(${Array.from(groupIds)}::text[]) AND active_group.isactive=TRUE
        AND EXISTS (
          SELECT 1 FROM product_variants available_variant
          JOIN inventory available_inventory ON available_inventory."variantId"=available_variant.id AND available_inventory."isActive"=TRUE
          WHERE available_variant."productId"=product.id AND available_variant."isActive"=TRUE AND available_inventory."cityId"=${city[0].id}
        )
        AND (
          EXISTS (SELECT 1 FROM catalog_group_products group_product WHERE group_product."groupId"=active_group.id AND group_product."productId"=product.id)
          ${groupState.variants ? Prisma.sql`OR EXISTS (SELECT 1 FROM catalog_group_variants group_variant JOIN product_variants linked_variant ON linked_variant.id=group_variant."variantId" WHERE group_variant."groupId"=active_group.id AND linked_variant."productId"=product.id)` : Prisma.empty}
          OR EXISTS (
            SELECT 1 FROM catalog_group_rules group_rule
            WHERE group_rule."groupId"=active_group.id AND group_rule."isActive"=TRUE
              AND (group_rule."brandId" IS NULL OR group_rule."brandId"=product."brandId")
              AND (group_rule."globalProductTypeId" IS NULL OR group_rule."globalProductTypeId"=product."globalProductTypeId")
              AND (group_rule."modelId" IS NULL OR group_rule."modelId"=product."modelId")
          )
        )`
    : [];
  const productIdsByGroup = new Map<string, string[]>();
  for (const entry of groupProducts) productIdsByGroup.set(entry.groupId, [...(productIdsByGroup.get(entry.groupId) ?? []), entry.productId]);
  const brandIds = new Set(seoBrands.map((entry) => entry.id));
  const typeIds = new Set(seoTypes.map((entry) => entry.id));
  const modelIds = new Set(seoModels.map((entry) => entry.id));
  const categoryIds = new Set(seoCategories.map((entry) => entry.id));
  const seoItems = config.items.filter((node) => {
    if (!node.visible) return false;
    if (node.action?.type === "group") return groupIds.has(node.action.groupId);
    if (node.action?.type === "category") return node.action.categoryId === "trade-in" || categoryIds.has(node.action.categoryId);
    if (node.action?.type !== "filters") return false;
    return node.action.rules.every((rule) => rule.field === "brand" ? brandIds.has(String(rule.value)) : rule.field === "type" ? typeIds.has(String(rule.value)) : rule.field === "model" ? modelIds.has(String(rule.value)) : rule.field === "category" ? categoryIds.has(String(rule.value)) : rule.field === "tradeIn");
  });
  const seoPaths = new Map<string, string>();
  const addSeoPaths = (nodes: SeoMenuNode[]) => nodes.forEach((node) => { seoPaths.set(node.id, node.path); addSeoPaths(node.children); });
  addSeoPaths(buildSeoMenu(seoItems));
  const mapNode = (item: ReturnType<typeof catalogMenuTree>[number]): any => {
    const children = item.children.filter((child) => !isService(child)).map((child) => mapNode(child));
    const href = item.action
      ? item.action.type === "url" ? item.action.href : item.action.type === "category" && item.action.categoryId === "trade-in" ? "/catalog/trade-in" : seoPaths.get(item.id) ?? `/catalog?menuItem=${encodeURIComponent(item.id)}`
      : null;
    return { ...item, filters: resolveFilters(item), href,
    ...(item.action?.type === "group" ? { productIds: productIdsByGroup.get(item.action.groupId) ?? [] } : {}),
    banner: item.banner ? { ...item.banner, imageUrl: item.banner.enabled && item.banner.imageMediaId ? mediaById.get(item.banner.imageMediaId) ?? null : null } : null,
    promoBanner: item.promoBanner ? { ...item.promoBanner, imageUrl: item.promoBanner.enabled && item.promoBanner.imageMediaId ? mediaById.get(item.promoBanner.imageMediaId) ?? null : null } : null,
    children };
  };
  const tree = catalogMenuTree(config).filter((item) => !isService(item)).map((item) => mapNode(item));
  return { data: tree };
}

export async function GET(request: Request) {
  const city = new URL(request.url).searchParams.get("city") || "samara";
  try {
    const result = await readOnly((tx) => menuData(tx, city));
    if (!result) return NextResponse.json({ error: "CITY_NOT_FOUND" }, { status: 404 });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    logApiError(error, "catalog.menu");
    return NextResponse.json({ data: [] }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
