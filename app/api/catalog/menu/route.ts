import { NextResponse } from "next/server";
import { logApiError, publicMediaUrl, readOnly } from "@/lib/catalog-api";
import { createDefaultCatalogMenu, catalogMenuTree, parseCatalogMenu, type CatalogMenuNode, type MenuTaxonomy } from "@/lib/catalog-menu";

export const dynamic = "force-dynamic";

async function menuData(tx: Parameters<Parameters<typeof readOnly>[0]>[0], citySlug: string) {
  const city = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM cities WHERE slug=${citySlug} AND "isActive"=TRUE LIMIT 1`;
  if (!city.length) return null;
  const rows = await tx.$queryRaw<Array<{ brandId: string; brandSlug: string; brandName: string; typeId: string; typeSlug: string; typeName: string; categoryId: string; categorySlug: string; categoryName: string; parentId: string | null }>>`
    SELECT DISTINCT b.id AS "brandId",b.slug AS "brandSlug",b.name AS "brandName",pt.id AS "typeId",pt.slug AS "typeSlug",pt.name AS "typeName",c.id AS "categoryId",c.slug AS "categorySlug",c.name AS "categoryName",c."parentId"
    FROM products p JOIN brands b ON b.id=p."brandId" AND b."isActive"=TRUE JOIN product_types pt ON pt.id=p."productTypeId" AND pt."isActive"=TRUE JOIN categories c ON c.id=p."categoryId" AND c."isActive"=TRUE
    WHERE p.status='PUBLISHED'::"ProductStatus" AND EXISTS (SELECT 1 FROM product_variants v JOIN inventory i ON i."variantId"=v.id WHERE v."productId"=p.id AND v."isActive"=TRUE AND i."cityId"=${city[0].id} AND i."isActive"=TRUE)
    ORDER BY b.name,pt.name,c.name
  `;
  const brandMap = new Map<string, MenuTaxonomy["brands"][number]>();
  const typeMap = new Map<string, MenuTaxonomy["types"][number]>();
  const categoryMap = new Map<string, MenuTaxonomy["categories"][number]>();
  for (const row of rows) {
    brandMap.set(row.brandId, { id: row.brandId, slug: row.brandSlug, name: row.brandName });
    typeMap.set(row.typeId, { id: row.typeId, slug: row.typeSlug, name: row.typeName, brandId: row.brandId, brandSlug: row.brandSlug });
    categoryMap.set(row.categoryId, { id: row.categoryId, slug: row.categorySlug, name: row.categoryName, parentId: row.parentId });
  }
  const legacyRows = await tx.$queryRaw<Array<{ value: unknown }>>`SELECT value FROM settings WHERE key='catalog.megaMenuBanners' LIMIT 1`;
  const settingRows = await tx.$queryRaw<Array<{ value: unknown }>>`SELECT value FROM settings WHERE key='catalog.megaMenu' LIMIT 1`;
  const taxonomy: MenuTaxonomy = { brands: Array.from(brandMap.values()), types: Array.from(typeMap.values()), categories: Array.from(categoryMap.values()) };
  const savedConfig = parseCatalogMenu(settingRows[0]?.value);
  const config = savedConfig ?? createDefaultCatalogMenu(taxonomy, legacyRows[0]?.value);
  const [activeBrands, activeTypes, activeCategories] = await Promise.all([
    tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM brands WHERE "isActive"=TRUE`,
    tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM product_types WHERE "isActive"=TRUE`,
    tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM categories WHERE "isActive"=TRUE`,
  ]);
  const brandIds = new Set(activeBrands.map((entry) => entry.id));
  const typeIds = new Set(activeTypes.map((entry) => entry.id));
  const categoryIds = new Set(activeCategories.map((entry) => entry.id));
  const enabledIds = config.items.filter((item) => item.visible && item.parentId === null).flatMap((item) => item.banner?.enabled && item.banner.imageMediaId ? [item.banner.imageMediaId] : []);
  const media = enabledIds.length ? await tx.$queryRaw<Array<{ id: string; storagePath: string }>>`SELECT id,"storagePath" FROM media WHERE id=ANY(${enabledIds}::text[]) AND "mimeType" IN ('image/jpeg','image/png','image/webp')` : [];
  const mediaById = new Map(media.map((entry) => [entry.id, publicMediaUrl(entry.storagePath)]));
  const validAction = (item: CatalogMenuNode) => {
    const action = item.action;
    if (!action) return false;
    if (action.type === "url") return true;
    if (action.type === "category") return action.categoryId === "trade-in" ? true : categoryIds.has(action.categoryId) && rows.some((row) => row.categoryId === action.categoryId);
    return action.rules.every((rule) => rule.field === "tradeIn" ? true : rule.field === "brand" ? brandIds.has(String(rule.value)) : rule.field === "type" ? typeIds.has(String(rule.value)) : categoryIds.has(String(rule.value)));
  };
  const resolveFilters = (item: CatalogMenuNode) => {
    const action = item.action;
    if (!action || action.type === "url") return null;
    if (action.type === "category") return action.categoryId === "trade-in" ? { category: "trade-in" } : { category: taxonomy.categories.find((entry) => entry.id === action.categoryId)?.slug ?? null };
    const result: { brand?: string; type?: string; category?: string } = {};
    for (const rule of action.rules) {
      if (rule.field === "brand") result.brand = taxonomy.brands.find((entry) => entry.id === String(rule.value))?.slug;
      if (rule.field === "type") result.type = taxonomy.types.find((entry) => entry.id === String(rule.value))?.slug;
      if (rule.field === "category") result.category = taxonomy.categories.find((entry) => entry.id === String(rule.value))?.slug;
    }
    return result;
  };
  const tree = catalogMenuTree(config).map((root) => ({ ...root, filters: resolveFilters(root), href: root.action && validAction(root) ? root.action.type === "url" ? root.action.href : `/catalog?menuItem=${encodeURIComponent(root.id)}` : null,
    banner: root.banner ? { ...root.banner, imageUrl: root.banner.enabled && root.banner.imageMediaId ? mediaById.get(root.banner.imageMediaId) ?? null : null } : null,
    children: root.children.map((child) => ({ ...child, filters: resolveFilters(child), href: child.action && validAction(child) ? child.action.type === "url" ? child.action.href : `/catalog?menuItem=${encodeURIComponent(child.id)}` : null })) }));
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
