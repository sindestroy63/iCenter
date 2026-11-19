import "server-only";

import { Prisma } from "@prisma/client";
import { CATALOG_MENU_SETTING_KEY, catalogMenuTree, parseCatalogMenu, resolveCatalogMenu, type CatalogMenuNode, type MenuTaxonomy } from "@/lib/catalog-menu";
import { productSlugBase } from "@/lib/product-slug";
import { groupSchema } from "@/lib/product-groups";
import { publicMediaUrl, readOnly } from "@/lib/catalog-api";

const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://icenter-store.com").replace(/\/$/, "");

export type SeoMenuNode = CatalogMenuNode & { slug: string; path: string; children: SeoMenuNode[]; parent: SeoMenuNode | null };

export function buildSeoMenu(items: CatalogMenuNode[]): SeoMenuNode[] {
  const roots = catalogMenuTree({ version: 1, items });
  const build = (nodes: typeof roots, prefix: string, parent: SeoMenuNode | null): SeoMenuNode[] => {
    const baseCounts = new Map<string, number>();
    for (const node of nodes) {
      const key = productSlugBase(node.title);
      baseCounts.set(key, (baseCounts.get(key) ?? 0) + 1);
    }
    return nodes.map((node) => {
      const base = productSlugBase(node.title);
      const slug = (baseCounts.get(base) ?? 0) > 1 ? `${base}-${productSlugBase(node.id)}` : base;
      const path = `${prefix}/${slug}`;
      const result: SeoMenuNode = { ...node, slug, path, children: [], parent };
      result.children = build(node.children, path, result);
      return result;
    });
  };
  return build(roots, "/catalog", null);
}

export async function getSeoMenu() {
  return readOnly(async (tx) => {
  const [brands, types, categories, models, settings, legacyMappings, groupState] = await Promise.all([
    tx.$queryRaw<MenuTaxonomy["brands"]>`SELECT id,slug,name FROM brands WHERE "isActive"=TRUE ORDER BY name`,
    tx.$queryRaw<MenuTaxonomy["types"]>`SELECT id,"canonicalKey" AS slug,name FROM global_product_types WHERE "isActive"=TRUE ORDER BY name`,
    tx.$queryRaw<MenuTaxonomy["categories"]>`SELECT id,slug,name,"parentId" FROM categories WHERE "isActive"=TRUE ORDER BY name`,
    tx.$queryRaw<MenuTaxonomy["models"]>`SELECT id,name,"brandId","globalProductTypeId" FROM product_models WHERE "isActive"=TRUE ORDER BY name`,
    tx.$queryRaw<Array<{ key: string; value: unknown }>>`SELECT key,value FROM settings WHERE key IN ('catalog.megaMenu','catalog.megaMenuBanners')`,
    tx.$queryRaw<Array<{ legacyProductTypeId: string; globalProductTypeId: string }>>`SELECT "legacyProductTypeId","globalProductTypeId" FROM legacy_product_type_mappings`,
    groupSchema(tx),
  ]);
  const activeGroups = groupState.groups && groupState.products && groupState.rules
    ? await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM catalog_groups WHERE isactive=TRUE`
    : [];
  const taxonomy: MenuTaxonomy = { brands, types, categories, models };
  const saved = settings.find((entry) => entry.key === CATALOG_MENU_SETTING_KEY)?.value;
  const legacyBanners = settings.find((entry) => entry.key === "catalog.megaMenuBanners")?.value;
  const config = resolveCatalogMenu(parseCatalogMenu(saved), taxonomy, legacyBanners, legacyMappings);
  const brandIds = new Set(brands.map((entry) => entry.id));
  const typeIds = new Set(types.map((entry) => entry.id));
  const modelIds = new Set(models.map((entry) => entry.id));
  const categoryIds = new Set(categories.map((entry) => entry.id));
  const groupIds = new Set(activeGroups.map((entry) => entry.id));
  const eligible = config.items.filter((node) => {
    if (!node.visible) return false;
    if (node.action?.type === "category") return node.action.categoryId === "trade-in" || categoryIds.has(node.action.categoryId);
    if (node.action?.type === "group") return groupIds.has(node.action.groupId);
    if (node.action?.type !== "filters") return false;
    return node.action.rules.every((rule) => rule.field === "brand" ? brandIds.has(String(rule.value))
      : rule.field === "type" ? typeIds.has(String(rule.value))
      : rule.field === "model" ? modelIds.has(String(rule.value))
      : rule.field === "category" ? categoryIds.has(String(rule.value))
      : rule.field === "tradeIn");
  });
  const tree = buildSeoMenu(eligible);
  const flat: SeoMenuNode[] = [];
  const visit = (nodes: SeoMenuNode[]) => nodes.forEach((node) => { flat.push(node); visit(node.children); });
  visit(tree);
  return { tree, flat, site };
  });
}

export async function getSeoMenuNode(pathParts: string[]) {
  const menu = await getSeoMenu();
  const node = menu.flat.find((entry) => entry.path.split("/").slice(2).join("/") === pathParts.join("/"));
  return node ? { ...menu, node } : null;
}

export async function getSeoMenuImage(node: SeoMenuNode) {
  const mediaId = node.banner?.enabled ? node.banner.imageMediaId : null;
  if (!mediaId) return null;
  return readOnly(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ storagePath: string; mimeType: string }>>`SELECT "storagePath","mimeType" FROM media WHERE id=${mediaId} LIMIT 1`;
    const media = rows[0];
    return media?.mimeType.startsWith("image/") ? publicMediaUrl(media.storagePath) : null;
  });
}

export function findSeoProductCategoryNode(nodes: SeoMenuNode[], product: { categoryId: string; brandId: string; typeId: string }) {
  const categoryNodes = nodes.filter((node) => node.action?.type === "category"
    ? node.action.categoryId === product.categoryId
    : node.action?.type === "filters" && node.action.rules.some((rule) => rule.field === "category" && rule.value === product.categoryId));
  if (categoryNodes.length) return categoryNodes.sort((left, right) => right.path.split("/").length - left.path.split("/").length)[0];
  return nodes.find((node) => node.action?.type === "filters"
    && node.action.rules.some((rule) => rule.field === "brand" && rule.value === product.brandId)
    && node.action.rules.some((rule) => rule.field === "type" && rule.value === product.typeId)
    && !node.action.rules.some((rule) => rule.field === "model")) ?? null;
}

export async function getSeoProductList(node: SeoMenuNode, citySlug = "samara") {
  return readOnly(async (tx) => {
  const ancestry: SeoMenuNode[] = [];
  for (let current: SeoMenuNode | null = node; current; current = current.parent) ancestry.unshift(current);
  const rules = ancestry.flatMap((entry) => entry.action?.type === "filters" ? entry.action.rules : entry.action?.type === "category" ? entry.action.categoryId === "trade-in" ? [{ field: "tradeIn" as const, value: true as const }] : [{ field: "category" as const, value: entry.action.categoryId }] : []);
  const tradeInListing = rules.some((rule) => rule.field === "tradeIn");
  const predicates = rules.map((rule) => {
    if (rule.field === "brand") return Prisma.sql`p."brandId" = ${String(rule.value)}`;
    if (rule.field === "type") return Prisma.sql`p."globalProductTypeId" = ${String(rule.value)}`;
    if (rule.field === "model") return Prisma.sql`p."modelId" = ${String(rule.value)}`;
    if (rule.field === "category") return Prisma.sql`p."categoryId" IN (WITH RECURSIVE seo_categories(id) AS (SELECT id FROM categories WHERE id=${String(rule.value)} UNION ALL SELECT c.id FROM categories c JOIN seo_categories parent ON c."parentId"=parent.id WHERE c."isActive"=TRUE) SELECT id FROM seo_categories)`;
    if (rule.field === "tradeIn") return Prisma.sql`p.specifications @> '{"tradeIn":true}'::jsonb AND EXISTS (SELECT 1 FROM product_variants used_v JOIN inventory used_i ON used_i."variantId"=used_v.id JOIN cities used_city ON used_city.id=used_i."cityId" WHERE used_v."productId"=p.id AND used_v."isActive"=TRUE AND used_i."isActive"=TRUE AND used_i.availability::text='IN_STOCK' AND used_city.slug=${citySlug})`;
    return Prisma.sql`FALSE`;
  });
  const condition = predicates.length ? Prisma.join(predicates, " AND ") : Prisma.sql`FALSE`;
  const groupActions = ancestry.flatMap((entry) => entry.action?.type === "group" ? [entry.action.groupId] : []);
  const schema = groupActions.length ? await groupSchema(tx) : null;
  const validGroupActions = schema?.groups && schema.products && schema.rules ? groupActions : [];
  const groupConditions = validGroupActions.map((groupId) => Prisma.sql`(
    EXISTS (SELECT 1 FROM catalog_group_products gp WHERE gp."groupId"=${groupId} AND gp."productId"=p.id)
    ${schema?.variants ? Prisma.sql`OR EXISTS (SELECT 1 FROM catalog_group_variants gv JOIN product_variants gvv ON gvv.id=gv."variantId" WHERE gv."groupId"=${groupId} AND gvv."productId"=p.id)` : Prisma.empty}
    OR EXISTS (SELECT 1 FROM catalog_group_rules gr WHERE gr."groupId"=${groupId} AND gr."isActive"=TRUE AND (gr."brandId" IS NULL OR gr."brandId"=p."brandId") AND (gr."globalProductTypeId" IS NULL OR gr."globalProductTypeId"=p."globalProductTypeId") AND (gr."modelId" IS NULL OR gr."modelId"=p."modelId"))
  )`);
  const groupCondition = groupConditions.length ? Prisma.join(groupConditions, " AND ") : Prisma.sql`TRUE`;
  return tx.$queryRaw<Array<{ slug: string; name: string; price: string | null; image: string | null }>>`
    SELECT p.slug,p.name,offer.price::text AS price,photo."storagePath" AS image
    FROM products p
    LEFT JOIN LATERAL (
      SELECT i.price FROM product_variants v JOIN inventory i ON i."variantId"=v.id JOIN cities city ON city.id=i."cityId"
      WHERE v."productId"=p.id AND v."isActive"=TRUE AND i."isActive"=TRUE AND city.slug=${citySlug}
      ORDER BY i.price NULLS LAST LIMIT 1
    ) offer ON TRUE
    LEFT JOIN LATERAL (
      SELECT media."storagePath" FROM product_gallery_images gi JOIN media ON media.id=gi."mediaId"
      WHERE gi."productId"=p.id ORDER BY gi."sortOrder" LIMIT 1
    ) photo ON TRUE
    WHERE p.status='PUBLISHED'::"ProductStatus" AND (${tradeInListing} OR NOT (p.specifications @> '{"tradeIn":true}'::jsonb)) AND (${condition}) AND (${groupCondition})
      AND EXISTS (SELECT 1 FROM product_variants v JOIN inventory i ON i."variantId"=v.id JOIN cities city ON city.id=i."cityId" WHERE v."productId"=p.id AND v."isActive"=TRUE AND i."isActive"=TRUE AND city.slug=${citySlug})
    ORDER BY p."manualOrder",p."isNew" DESC,p.name LIMIT 24
  `;
  });
}
