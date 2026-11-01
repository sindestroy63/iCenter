import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

type GroupDb = PrismaClient | Prisma.TransactionClient;

export type ProductGroupRuleInput = {
  brandId?: string | null;
  globalProductTypeId?: string | null;
  modelId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export function normalizeGroupRule(input: ProductGroupRuleInput) {
  const rule = {
    brandId: input.brandId?.trim() || null,
    globalProductTypeId: input.globalProductTypeId?.trim() || null,
    modelId: input.modelId?.trim() || null,
    sortOrder: Number.isInteger(input.sortOrder) ? Number(input.sortOrder) : 0,
    isActive: input.isActive !== false,
  };
  if (!rule.brandId && !rule.globalProductTypeId && !rule.modelId) throw new Error("RULE_CONDITION_REQUIRED");
  if (rule.sortOrder < -100000 || rule.sortOrder > 100000) throw new Error("INVALID_SORT_ORDER");
  return rule;
}

export async function validateGroupRuleReferences(db: PrismaClient, rule: ReturnType<typeof normalizeGroupRule>) {
  if (rule.brandId) {
    const rows = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM brands WHERE id=${rule.brandId} AND "isActive"=TRUE LIMIT 1`;
    if (!rows.length) throw new Error("INVALID_BRAND");
  }
  if (rule.globalProductTypeId) {
    const rows = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM global_product_types WHERE id=${rule.globalProductTypeId} AND "isActive"=TRUE LIMIT 1`;
    if (!rows.length) throw new Error("INVALID_GLOBAL_PRODUCT_TYPE");
  }
  if (rule.modelId) {
    const rows = await db.$queryRaw<Array<{ brandId: string; globalProductTypeId: string }>>`SELECT "brandId","globalProductTypeId" FROM product_models WHERE id=${rule.modelId} AND "isActive"=TRUE LIMIT 1`;
    if (!rows.length) throw new Error("INVALID_MODEL");
    if (rule.brandId && rule.brandId !== rows[0].brandId) throw new Error("MODEL_BRAND_MISMATCH");
    if (rule.globalProductTypeId && rule.globalProductTypeId !== rows[0].globalProductTypeId) throw new Error("MODEL_TYPE_MISMATCH");
  }
}

export async function groupSchema(db: GroupDb) {
  const rows = await db.$queryRaw<Array<{ groups: boolean; products: boolean; rules: boolean; variants: boolean }>>`
    SELECT to_regclass('catalog_groups') IS NOT NULL AS groups,
      to_regclass('catalog_group_products') IS NOT NULL AS products,
      to_regclass('catalog_group_rules') IS NOT NULL AS rules,
      to_regclass('catalog_group_variants') IS NOT NULL AS variants`;
  return rows[0] ?? { groups: false, products: false, rules: false, variants: false };
}

export function groupSchemaRequired(schema: { groups: boolean; products: boolean; rules: boolean }) {
  if (!schema.groups || !schema.products || !schema.rules) throw new Error("GROUP_SCHEMA_REQUIRED");
}

export function groupVariantSchemaRequired(schema: { variants: boolean }) {
  if (!schema.variants) throw new Error("GROUP_SCHEMA_REQUIRED");
}

export async function countGroupProducts(db: GroupDb, groupId: string, citySlug: string, includeVariants = false) {
  const variantMembership = includeVariants ? Prisma.sql`OR EXISTS (SELECT 1 FROM catalog_group_variants gv JOIN product_variants gvv ON gvv.id=gv."variantId" WHERE gv."groupId"=${groupId} AND gvv."productId"=p.id)` : Prisma.empty;
  const rows = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT p.id) AS count
    FROM products p
    JOIN product_variants v ON v."productId"=p.id AND v."isActive"=TRUE
    JOIN inventory i ON i."variantId"=v.id AND i."isActive"=TRUE
    JOIN cities city ON city.id=i."cityId" AND city.slug=${citySlug} AND city."isActive"=TRUE
    WHERE p.status='PUBLISHED'::"ProductStatus"
      AND (
        EXISTS (SELECT 1 FROM catalog_group_products gp WHERE gp."groupId"=${groupId} AND gp."productId"=p.id)
        ${variantMembership}
        OR EXISTS (
          SELECT 1 FROM catalog_group_rules gr
          LEFT JOIN product_models pm ON pm.id=p."modelId"
          LEFT JOIN legacy_product_type_mappings lpm ON lpm."legacyProductTypeId"=p."productTypeId"
          WHERE gr."groupId"=${groupId} AND gr."isActive"=TRUE
            AND (gr."brandId" IS NULL OR gr."brandId"=p."brandId")
            AND (gr."globalProductTypeId" IS NULL OR gr."globalProductTypeId"=lpm."globalProductTypeId")
            AND (gr."modelId" IS NULL OR gr."modelId"=p."modelId")
        )
      )`;
  return Number(rows[0]?.count ?? 0);
}

export function groupDbError(error: unknown) {
  const value = error && typeof error === "object" ? error as { message?: string; code?: string; meta?: { code?: string } } : {};
  const code = value.meta?.code ?? value.code;
  return { message: value.message ?? "GROUP_FAILED", code };
}

export function groupRuleWhere(groupId: string, includeVariants = false) {
  const variants = includeVariants ? Prisma.sql`OR EXISTS (SELECT 1 FROM catalog_group_variants gv JOIN product_variants gvv ON gvv.id=gv."variantId" WHERE gv."groupId"=${groupId} AND gvv."productId"=p0.id)` : Prisma.empty;
  return Prisma.sql`(
    EXISTS (SELECT 1 FROM catalog_group_products gp WHERE gp."groupId"=${groupId} AND gp."productId"=p0.id)
    ${variants}
    OR EXISTS (
      SELECT 1 FROM catalog_group_rules gr
      LEFT JOIN legacy_product_type_mappings lpm ON lpm."legacyProductTypeId"=p0."productTypeId"
      WHERE gr."groupId"=${groupId} AND gr."isActive"=TRUE
        AND (gr."brandId" IS NULL OR gr."brandId"=p0."brandId")
        AND (gr."globalProductTypeId" IS NULL OR gr."globalProductTypeId"=lpm."globalProductTypeId")
        AND (gr."modelId" IS NULL OR gr."modelId"=p0."modelId")
    )
  )`;
}

export function groupVariantWhere(groupId: string, includeVariants: boolean) {
  if (!includeVariants) return Prisma.sql`TRUE`;
  return Prisma.sql`(
    EXISTS (SELECT 1 FROM catalog_group_products gp WHERE gp."groupId"=${groupId} AND gp."productId"=p.id)
    OR EXISTS (
      SELECT 1 FROM catalog_group_rules gr
      LEFT JOIN legacy_product_type_mappings lpm ON lpm."legacyProductTypeId"=p."productTypeId"
      WHERE gr."groupId"=${groupId} AND gr."isActive"=TRUE
        AND (gr."brandId" IS NULL OR gr."brandId"=p."brandId")
        AND (gr."globalProductTypeId" IS NULL OR gr."globalProductTypeId"=lpm."globalProductTypeId")
        AND (gr."modelId" IS NULL OR gr."modelId"=p."modelId")
    )
    OR EXISTS (SELECT 1 FROM catalog_group_variants gv WHERE gv."groupId"=${groupId} AND gv."variantId"=pv.id)
  )`;
}
