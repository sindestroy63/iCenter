import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { imageUrl } from "@/lib/catalog-api";

export const dynamic = "force-dynamic";
declare global { var publicBannerPrisma: PrismaClient | undefined; }

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
    const db = globalThis.publicBannerPrisma ??= new PrismaClient({ log: [] });
    const rows = await db.$queryRaw<Array<{ id: string; placement: string; title: string; subtitle: string | null; linkUrl: string | null; linkText: string | null; sortOrder: number; imagePath: string | null; mimeType: string | null }>>`SELECT DISTINCT ON (b.placement) b.id,b.placement,b.title,b.subtitle,b."linkUrl",b."linkText",b."sortOrder",m."storagePath" AS "imagePath",m."mimeType" FROM banners b LEFT JOIN media m ON m.id=b."imageMediaId" AND m."mimeType" LIKE 'image/%' WHERE b."isActive"=TRUE AND b.placement IN ('home','home_brand_apple','home_brand_samsung','home_brand_dyson','home_brand_playstation') ORDER BY b.placement,b."sortOrder",b.id`;
    return NextResponse.json({ data: rows.map(({ imagePath, mimeType, ...banner }) => ({ ...banner, imageUrl: imageUrl(imagePath, mimeType) })) }, { headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "BANNERS_UNAVAILABLE" }, { status: 503 }); }
}
