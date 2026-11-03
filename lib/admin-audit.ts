import "server-only";

import type { Prisma } from "@prisma/client";
import { newId } from "@/lib/admin-db";

export type AuditActor = { userId: string; role: string; sessionId: string; name?: string | null };
export type InventoryAuditRow = {
  id: string;
  variantId: string;
  cityId: string;
  productId: string;
  price: string | null;
  oldPrice: string | null;
  stock: number | null;
  availability: string;
  allowPreorder: boolean;
  deliveryTime: string | null;
  isActive: boolean;
};
export type ProductAuditSnapshot = { product: unknown; variants: unknown[] };

export function auditDiff(before: unknown, after: unknown): unknown {
  if (before === after) return undefined;
  if (before && after && typeof before === "object" && typeof after === "object" && !Array.isArray(before) && !Array.isArray(after)) {
    const result: Record<string, { old: unknown; new: unknown }> = {};
    const keys = Array.from(new Set([...Object.keys(before as object), ...Object.keys(after as object)]));
    for (const key of keys) {
      const oldValue = (before as Record<string, unknown>)[key] ?? null;
      const newValue = (after as Record<string, unknown>)[key] ?? null;
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) result[key] = { old: oldValue, new: newValue };
    }
    return Object.keys(result).length ? result : undefined;
  }
  return { old: before ?? null, new: after ?? null };
}

export function productAuditChanges(before: ProductAuditSnapshot | null, after: ProductAuditSnapshot) {
  if (!before) return { old: null, new: after };
  return {
    product: auditDiff(before.product, after.product) ?? null,
    variants: auditDiff(before.variants, after.variants) ?? null,
  };
}

export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  actor: AuditActor,
  entry: { action: string; entityType: string; entityId: string; changes: unknown; metadata?: Record<string, unknown> },
) {
  await tx.$executeRaw`
    INSERT INTO audit_logs (id,"userId",action,"entityType","entityId",changes,metadata,"sessionId","createdAt")
    VALUES (
      ${newId()},${actor.userId},${entry.action},${entry.entityType},${entry.entityId},
      ${JSON.stringify(entry.changes)}::jsonb,
      ${JSON.stringify({ actorRole: actor.role, actorName: actor.name ?? null, ...entry.metadata })}::jsonb,
      ${actor.sessionId},NOW()
    )
  `;
}

export async function getDictionarySnapshot(tx: Prisma.TransactionClient, code: string, id: string): Promise<Record<string, unknown> | null> {
  const rows = await (async () => {
    if (code === "brand") return tx.$queryRaw<any[]>`SELECT id,name,slug,"sortOrder","isActive" FROM brands WHERE id=${id}`;
    if (code === "color") return tx.$queryRaw<any[]>`SELECT id,name,"nameRu",slug,"hexPrimary","sortOrder","isActive" FROM colors WHERE id=${id}`;
    if (code === "productLine") return tx.$queryRaw<any[]>`SELECT id,"brandId","canonicalKey",name,"sortOrder","isActive" FROM product_lines WHERE id=${id}`;
    if (code === "productModel") return tx.$queryRaw<any[]>`SELECT id,name,"brandId","globalProductTypeId","isActive" FROM product_models WHERE id=${id}`;
    if (code === "productType") return tx.$queryRaw<any[]>`SELECT t.id,t."canonicalKey",t.name,t."sortOrder",t."isActive",COALESCE((SELECT json_agg(link."brandId" ORDER BY link."brandId") FROM global_product_type_brands link WHERE link."productTypeId"=t.id),'[]'::json) AS "brandIds" FROM global_product_types t WHERE t.id=${id}`;
    if (code === "definition") return tx.$queryRaw<any[]>`SELECT d.id,d.code,d.name,d.scope,d."valueKind",d."sortOrder",d."isFilterable",d."isActive",COALESCE((SELECT json_agg(pta."productTypeId" ORDER BY pta."productTypeId") FROM product_type_attributes pta WHERE pta."definitionId"=d.id AND pta.scope=d.scope),'[]'::json) AS "productTypeIds" FROM attribute_definitions d WHERE d.id=${id}`;
    return tx.$queryRaw<any[]>`SELECT o.id,o."canonicalKey",o.label,o."sortOrder",o."isActive",d.code AS dictionary,COALESCE((SELECT json_agg(a."aliasLabel" ORDER BY a."aliasLabel") FROM attribute_option_aliases a WHERE a."optionId"=o.id),'[]'::json) AS aliases FROM attribute_options o JOIN attribute_definitions d ON d.id=o."definitionId" WHERE o.id=${id}`;
  })();
  return rows[0] ?? null;
}

export async function getProductInventorySnapshot(tx: Prisma.TransactionClient, productId: string): Promise<InventoryAuditRow[]> {
  return tx.$queryRaw<InventoryAuditRow[]>`
    SELECT i.id,i."variantId",i."cityId",v."productId",i.price::text AS price,
      i."oldPrice"::text AS "oldPrice",i.stock,i.availability::text AS availability,
      i."allowPreorder",i."deliveryTime",i."isActive"
    FROM inventory i JOIN product_variants v ON v.id=i."variantId"
    WHERE v."productId"=${productId}
    ORDER BY i."cityId",i."variantId"
  `;
}

export async function getProductAuditSnapshot(tx: Prisma.TransactionClient, productId: string): Promise<ProductAuditSnapshot> {
  const products = await tx.$queryRaw<Array<{ value: unknown }>>`SELECT to_jsonb(p) AS value FROM products p WHERE p.id=${productId}`;
  const variants = await tx.$queryRaw<Array<{ value: unknown }>>`SELECT to_jsonb(v) AS value FROM product_variants v WHERE v."productId"=${productId} ORDER BY v.id`;
  return { product: products[0]?.value ?? null, variants: variants.map((row) => row.value) };
}

export async function auditInventoryChanges(
  tx: Prisma.TransactionClient,
  actor: AuditActor,
  before: InventoryAuditRow[],
  after: InventoryAuditRow[],
) {
  const fields = ["price", "oldPrice", "stock", "availability", "allowPreorder", "deliveryTime", "isActive"] as const;
  const previous = new Map(before.map((row) => [row.id, row]));
  for (const current of after) {
    const old = previous.get(current.id);
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    for (const field of fields) {
      if ((old?.[field] ?? null) !== (current[field] ?? null)) {
        changes[field] = { old: old?.[field] ?? null, new: current[field] ?? null };
      }
    }
    if (!Object.keys(changes).length) continue;
    await writeAuditLog(tx, actor, {
      action: old ? "inventory.updated" : "inventory.created",
      entityType: "inventory",
      entityId: current.id,
      changes,
      metadata: { cityId: current.cityId, variantId: current.variantId, productId: current.productId },
    });
  }
}
