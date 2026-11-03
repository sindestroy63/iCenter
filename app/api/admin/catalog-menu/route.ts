import { NextResponse } from "next/server";
import { requireGlobalAdminMutation, requireGlobalAdminSession } from "@/lib/auth";
import { adminDb, newId } from "@/lib/admin-db";
import { CATALOG_MENU_SETTING_KEY, createDefaultCatalogMenu, parseCatalogMenu, type MenuTaxonomy } from "@/lib/catalog-menu";
import { auditDiff, writeAuditLog } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

async function readTaxonomy(db: ReturnType<typeof adminDb>): Promise<MenuTaxonomy> {
  const [brands, types, models, categories, groups] = await Promise.all([
    db.$queryRaw<MenuTaxonomy["brands"]>`SELECT id,slug,name FROM brands WHERE "isActive"=TRUE ORDER BY "sortOrder",name`,
    db.$queryRaw<MenuTaxonomy["types"]>`SELECT pt.id,pt.slug,pt.name,pt."brandId",b.slug AS "brandSlug",mapping."globalProductTypeId" FROM product_types pt JOIN brands b ON b.id=pt."brandId" JOIN legacy_product_type_mappings mapping ON mapping."legacyProductTypeId"=pt.id WHERE pt."isActive"=TRUE AND b."isActive"=TRUE ORDER BY pt.name`,
    db.$queryRaw<MenuTaxonomy["models"]>`SELECT m.id,m.name,m."brandId",m."globalProductTypeId",b.name AS "brandName",g.name AS "typeName" FROM product_models m JOIN brands b ON b.id=m."brandId" JOIN global_product_types g ON g.id=m."globalProductTypeId" WHERE m."isActive"=TRUE AND b."isActive"=TRUE AND g."isActive"=TRUE ORDER BY m.name`,
    db.$queryRaw<MenuTaxonomy["categories"]>`SELECT id,slug,name,"parentId" FROM categories WHERE "isActive"=TRUE ORDER BY "sortOrder",name`,
    db.$queryRaw<MenuTaxonomy["groups"]>`SELECT id,slug,title,isactive AS "isActive" FROM catalog_groups WHERE isactive=TRUE ORDER BY sortorder,title`.catch(() => []),
  ]);
  return { brands, types, models, categories, groups };
}

export async function GET() {
  try {
    await requireGlobalAdminSession();
    const db = adminDb();
    const [taxonomy, settings] = await Promise.all([
      readTaxonomy(db),
      db.$queryRaw<Array<{ key: string; value: unknown }>>`SELECT key,value FROM settings WHERE key IN ('catalog.megaMenu','catalog.megaMenuBanners')`,
    ]);
    const saved = settings.find((entry) => entry.key === CATALOG_MENU_SETTING_KEY)?.value;
    const legacy = settings.find((entry) => entry.key === "catalog.megaMenuBanners")?.value;
    return NextResponse.json({ menu: parseCatalogMenu(saved) ?? createDefaultCatalogMenu(taxonomy, legacy), options: taxonomy });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 503;
    return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "MENU_UNAVAILABLE" }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await requireGlobalAdminMutation(request);
    const body = await request.json() as { menu?: unknown };
    const menu = parseCatalogMenu(body.menu);
    if (!menu) return NextResponse.json({ error: "INVALID_MENU" }, { status: 400 });
    const db = adminDb();
    const taxonomy = await readTaxonomy(db);
    const brands = new Set(taxonomy.brands.map((item) => item.id));
    const types = new Set(taxonomy.types.map((item) => item.id));
    const models = new Map(taxonomy.models.map((item) => [item.id, item]));
    const categories = new Set(taxonomy.categories.map((item) => item.id));
    const groups = new Set((taxonomy.groups ?? []).map((item) => item.id));
    const byId = new Map(menu.items.map((item) => [item.id, item]));
    for (const item of menu.items) {
      if (item.action?.type === "category" && item.action.categoryId !== "trade-in" && !categories.has(item.action.categoryId)) return NextResponse.json({ error: "INVALID_CATEGORY" }, { status: 400 });
      if (item.action?.type === "group" && !groups.has(item.action.groupId)) return NextResponse.json({ error: "INVALID_GROUP" }, { status: 400 });
      const action = item.action;
      if (action?.type === "filters") for (const rule of action.rules) {
        if (rule.field === "brand" && !brands.has(String(rule.value))) return NextResponse.json({ error: "INVALID_BRAND" }, { status: 400 });
        if (rule.field === "type" && !types.has(String(rule.value))) return NextResponse.json({ error: "INVALID_PRODUCT_TYPE" }, { status: 400 });
        if (rule.field === "model") {
          const model = models.get(String(rule.value));
          if (!model) return NextResponse.json({ error: "INVALID_MODEL" }, { status: 400 });
          const inheritedRules: typeof action.rules = [];
          let parentId = item.parentId;
          while (parentId) {
            const parent = byId.get(parentId);
            if (!parent) break;
            if (parent.action?.type === "filters") inheritedRules.push(...parent.action.rules);
            parentId = parent.parentId;
          }
          const rules = [...inheritedRules, ...action.rules];
          const brandRule = rules.find((entry) => entry.field === "brand");
          if (brandRule && brandRule.value !== model.brandId) return NextResponse.json({ error: "MODEL_BRAND_MISMATCH" }, { status: 400 });
          const typeRule = rules.find((entry) => entry.field === "type");
          if (typeRule && taxonomy.types.find((entry) => entry.id === typeRule.value)?.globalProductTypeId !== model.globalProductTypeId) return NextResponse.json({ error: "MODEL_TYPE_MISMATCH" }, { status: 400 });
        }
        if (rule.field === "category" && !categories.has(String(rule.value))) return NextResponse.json({ error: "INVALID_CATEGORY" }, { status: 400 });
      }
    }
    const mediaIds = menu.items.filter((item) => item.parentId === null && item.banner?.enabled && item.banner.imageMediaId).map((item) => item.banner!.imageMediaId!);
    if (mediaIds.length) {
      const rows = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM media WHERE id=ANY(${mediaIds}::text[]) AND "mimeType" IN ('image/jpeg','image/png','image/webp')`;
      if (new Set(rows.map((row) => row.id)).size !== new Set(mediaIds).size) return NextResponse.json({ error: "INVALID_MEDIA" }, { status: 400 });
    }
    await db.$transaction(async (tx) => {
      const previous = await tx.$queryRaw<Array<{ value: unknown }>>`SELECT value FROM settings WHERE key=${CATALOG_MENU_SETTING_KEY} LIMIT 1`;
      const changes = auditDiff(previous[0]?.value ?? null, menu);
      await tx.$executeRaw`
        INSERT INTO settings (id,key,value,description,"updatedAt") VALUES (${newId()},${CATALOG_MENU_SETTING_KEY},${JSON.stringify(menu)}::jsonb,'Catalog mega-menu configuration',NOW())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,"updatedAt"=NOW()
      `;
      if (changes) await writeAuditLog(tx, actor, { action: "catalog_menu.updated", entityType: "catalog_menu", entityId: CATALOG_MENU_SETTING_KEY, changes, metadata: { settingKey: CATALOG_MENU_SETTING_KEY } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "UNAUTHORIZED" ? 401 : ["FORBIDDEN", "CSRF_INVALID"].includes(message) ? 403 : 503;
    return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "MENU_SAVE_FAILED" }, { status });
  }
}
