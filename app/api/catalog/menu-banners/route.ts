import { NextResponse } from "next/server";
import { logApiError, publicMediaUrl, readOnly } from "@/lib/catalog-api";
import { parseCatalogMenuBanners } from "@/lib/catalog-menu-banners";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await readOnly(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ value: unknown }>>`SELECT value FROM settings WHERE key='catalog.megaMenuBanners' LIMIT 1`;
      const configs = parseCatalogMenuBanners(rows[0]?.value);
      const ids = configs.flatMap((item) => item.enabled && item.imageMediaId ? [item.imageMediaId] : []);
      const media = ids.length ? await tx.$queryRaw<Array<{ id: string; storagePath: string; mimeType: string }>>`SELECT id,"storagePath","mimeType" FROM media WHERE id=ANY(${ids}::text[]) AND "mimeType" IN ('image/jpeg','image/png','image/webp')` : [];
      const byId = new Map(media.map((item) => [item.id, item]));
      return configs.map((item) => {
        const file = item.imageMediaId ? byId.get(item.imageMediaId) : null;
        return { ...item, imageUrl: item.enabled && file ? publicMediaUrl(file.storagePath) : null };
      });
    });
    return NextResponse.json({ data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    logApiError(error, "catalog.menu-banners");
    return NextResponse.json({ data: [] }, { headers: { "cache-control": "no-store" } });
  }
}
