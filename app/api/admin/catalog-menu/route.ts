import { NextResponse } from "next/server";
import { requireGlobalAdminMutation, requireGlobalAdminSession } from "@/lib/auth";
import { adminDb, newId } from "@/lib/admin-db";
import { CATALOG_MENU_SETTING_KEY, createDefaultCatalogMenu, parseCatalogMenu, type MenuTaxonomy } from "@/lib/catalog-menu";

export const dynamic = "force-dynamic";

async function readTaxonomy(db: ReturnType<typeof adminDb>): Promise<MenuTaxonomy> {
  const [brands, types, categories] = await Promise.all([
    db.$queryRaw<MenuTaxonomy["brands"]>`SELECT id,slug,name FROM brands WHERE "isActive"=TRUE ORDER BY "sortOrder",name`,
    db.$queryRaw<MenuTaxonomy["types"]>`SELECT pt.id,pt.slug,pt.name,pt."brandId",b.slug AS "brandSlug" FROM product_types pt JOIN brands b ON b.id=pt."brandId" WHERE pt."isActive"=TRUE AND b."isActive"=TRUE ORDER BY pt.name`,
    db.$queryRaw<MenuTaxonomy["categories"]>`SELECT id,slug,name,"parentId" FROM categories WHERE "isActive"=TRUE ORDER BY "sortOrder",name`,
  ]);
  return { brands, types, categories };
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
    await requireGlobalAdminMutation(request);
    const body = await request.json() as { menu?: unknown };
    const menu = parseCatalogMenu(body.menu);
    if (!menu) return NextResponse.json({ error: "INVALID_MENU" }, { status: 400 });
    const db = adminDb();
    const taxonomy = await readTaxonomy(db);
    const brands = new Set(taxonomy.brands.map((item) => item.id));
    const types = new Set(taxonomy.types.map((item) => item.id));
    const categories = new Set(taxonomy.categories.map((item) => item.id));
    for (const item of menu.items) {
      if (item.action?.type === "category" && item.action.categoryId !== "trade-in" && !categories.has(item.action.categoryId)) return NextResponse.json({ error: "INVALID_CATEGORY" }, { status: 400 });
      if (item.action?.type === "filters") for (const rule of item.action.rules) {
        if (rule.field === "brand" && !brands.has(String(rule.value))) return NextResponse.json({ error: "INVALID_BRAND" }, { status: 400 });
        if (rule.field === "type" && !types.has(String(rule.value))) return NextResponse.json({ error: "INVALID_PRODUCT_TYPE" }, { status: 400 });
        if (rule.field === "category" && !categories.has(String(rule.value))) return NextResponse.json({ error: "INVALID_CATEGORY" }, { status: 400 });
      }
    }
    const mediaIds = menu.items.filter((item) => item.parentId === null && item.banner?.enabled && item.banner.imageMediaId).map((item) => item.banner!.imageMediaId!);
    if (mediaIds.length) {
      const rows = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM media WHERE id=ANY(${mediaIds}::text[]) AND "mimeType" IN ('image/jpeg','image/png','image/webp')`;
      if (new Set(rows.map((row) => row.id)).size !== new Set(mediaIds).size) return NextResponse.json({ error: "INVALID_MEDIA" }, { status: 400 });
    }
    await db.$executeRaw`
      INSERT INTO settings (id,key,value,description,"updatedAt") VALUES (${newId()},${CATALOG_MENU_SETTING_KEY},${JSON.stringify(menu)}::jsonb,'Catalog mega-menu configuration',NOW())
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,"updatedAt"=NOW()
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "UNAUTHORIZED" ? 401 : ["FORBIDDEN", "CSRF_INVALID"].includes(message) ? 403 : 503;
    return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "MENU_SAVE_FAILED" }, { status });
  }
}
