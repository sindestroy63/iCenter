import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGlobalAdminMutation, requireGlobalAdminSession } from "@/lib/auth";
import { adminDb, newId } from "@/lib/admin-db";
import { CATALOG_MENU_ROOTS, parseCatalogMenuBanners } from "@/lib/catalog-menu-banners";

export const dynamic = "force-dynamic";

const schema = z.object({
  banners: z.array(z.object({
    key: z.enum(CATALOG_MENU_ROOTS.map((root) => root.key) as [string, ...string[]]),
    enabled: z.boolean(),
    imageMediaId: z.string().trim().min(1).max(100).nullable(),
    alt: z.string().trim().max(300),
    description: z.string().trim().max(240),
  }).strict()).length(CATALOG_MENU_ROOTS.length),
}).strict().superRefine(({ banners }, context) => {
  if (new Set(banners.map((item) => item.key)).size !== CATALOG_MENU_ROOTS.length) {
    context.addIssue({ code: "custom", path: ["banners"], message: "invalid roots" });
  }
});

export async function GET() {
  try {
    await requireGlobalAdminSession();
    const rows = await adminDb().$queryRaw<Array<{ value: unknown }>>`SELECT value FROM settings WHERE key='catalog.megaMenuBanners' LIMIT 1`;
    return NextResponse.json({ banners: parseCatalogMenuBanners(rows[0]?.value) });
  } catch (error) {
    const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : error instanceof Error && error.message === "FORBIDDEN" ? 403 : 503;
    return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "MENU_BANNERS_UNAVAILABLE" }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    await requireGlobalAdminMutation(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_MENU_BANNERS" }, { status: 400 });
    const banners = parsed.data.banners;
    const mediaIds = banners.flatMap((item) => item.enabled && item.imageMediaId ? [item.imageMediaId] : []);
    const db = adminDb();
    if (mediaIds.length) {
      const rows = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM media WHERE id=ANY(${mediaIds}::text[]) AND "mimeType" IN ('image/jpeg','image/png','image/webp')`;
      if (new Set(rows.map((row) => row.id)).size !== new Set(mediaIds).size) return NextResponse.json({ error: "INVALID_MEDIA" }, { status: 400 });
    }
    await db.$executeRaw`
      INSERT INTO settings (id,key,value,description,"updatedAt")
      VALUES (${newId()},'catalog.megaMenuBanners',${JSON.stringify({ banners })}::jsonb,'Legacy catalog mega-menu banners',NOW())
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,"updatedAt"=NOW()
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "UNAUTHORIZED" ? 401 : ["FORBIDDEN", "CSRF_INVALID"].includes(message) ? 403 : 503;
    return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "MENU_BANNERS_SAVE_FAILED" }, { status });
  }
}
