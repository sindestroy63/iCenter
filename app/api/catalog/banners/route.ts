import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { publicMediaUrl } from "@/lib/catalog-api";

export const dynamic = "force-dynamic";
declare global { var publicBannerPrisma: PrismaClient | undefined; }

const optimizedCategoryVideos: Record<string, string> = {
  "uploads/2026/10/c4600a29fcebdc16b82db21c6.mp4": "/assets/category-videos/apple.mp4",
  "uploads/2026/10/c92b72f85cc876aee260d5aed.mp4": "/assets/category-videos/samsung.mp4",
  "uploads/2026/10/cb3806d51741bbf1805b27118.mp4": "/assets/category-videos/dyson.mp4",
  "uploads/2026/10/c5d2483ede6a07eabd4ea1fd7.mp4": "/assets/category-videos/playstation.mp4",
};

const optimizedCategoryPosters: Record<string, string> = {
  "uploads/2026/10/c4600a29fcebdc16b82db21c6.mp4": "/assets/category-videos/apple-poster.jpg",
  "uploads/2026/10/c92b72f85cc876aee260d5aed.mp4": "/assets/category-videos/samsung-poster.jpg",
  "uploads/2026/10/cb3806d51741bbf1805b27118.mp4": "/assets/category-videos/dyson-poster.jpg",
  "uploads/2026/10/c5d2483ede6a07eabd4ea1fd7.mp4": "/assets/category-videos/playstation-poster.jpg",
};

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
    const db = globalThis.publicBannerPrisma ??= new PrismaClient({ log: [] });
    const rows = await db.$queryRaw<Array<{ id: string; placement: string; title: string; subtitle: string | null; linkUrl: string | null; linkText: string | null; sortOrder: number; mediaPath: string | null; mimeType: string | null }>>`SELECT b.id,b.placement,b.title,b.subtitle,b."linkUrl",b."linkText",b."sortOrder",m."storagePath" AS "mediaPath",m."mimeType" FROM banners b LEFT JOIN media m ON m.id=b."imageMediaId" WHERE b."isActive"=TRUE AND b.placement IN ('home','home_brand_apple','home_brand_samsung','home_brand_dyson','home_brand_playstation') ORDER BY b.placement,b."sortOrder",b.id`;
    const groupIds = rows.map((row) => row.linkUrl?.match(/^group:(.+)$/)?.[1]).filter(Boolean) as string[];
    const productIds = rows.map((row) => row.linkUrl?.match(/^product:(.+)$/)?.[1]).filter(Boolean) as string[];
    const categoryIds = rows.map((row) => row.linkUrl?.match(/^category:(.+)$/)?.[1]).filter(Boolean) as string[];
    const [groups, products, categories] = await Promise.all([
      groupIds.length ? db.$queryRaw<Array<{ id: string; slug: string }>>`SELECT id,slug FROM catalog_groups WHERE id IN (${Prisma.join(groupIds)})` : [],
      productIds.length ? db.$queryRaw<Array<{ id: string; slug: string }>>`SELECT id,slug FROM products WHERE id IN (${Prisma.join(productIds)})` : [],
      categoryIds.length ? db.$queryRaw<Array<{ id: string; slug: string }>>`SELECT id,slug FROM categories WHERE id IN (${Prisma.join(categoryIds)})` : [],
    ]);
    const groupMap = new Map(groups.map((row) => [row.id, row.slug])); const productMap = new Map(products.map((row) => [row.id, row.slug])); const categoryMap = new Map(categories.map((row) => [row.id, row.slug]));
    return NextResponse.json({ data: rows.map(({ mediaPath, mimeType, linkUrl, ...banner }) => {
      const resolvedLink = linkUrl?.startsWith("group:") ? (groupMap.has(linkUrl.slice(6)) ? `/catalog?groupId=${encodeURIComponent(groupMap.get(linkUrl.slice(6))!)}` : null)
        : linkUrl?.startsWith("product:") ? (productMap.has(linkUrl.slice(8)) ? `/product/${encodeURIComponent(productMap.get(linkUrl.slice(8))!)}` : null)
          : linkUrl?.startsWith("category:") ? (categoryMap.has(linkUrl.slice(9)) ? `/catalog?category=${encodeURIComponent(categoryMap.get(linkUrl.slice(9))!)}` : null) : linkUrl;
      return { ...banner, linkUrl: resolvedLink, mediaUrl: publicMediaUrl(mediaPath), optimizedMediaUrl: mediaPath ? optimizedCategoryVideos[mediaPath] ?? null : null, optimizedPosterUrl: mediaPath ? optimizedCategoryPosters[mediaPath] ?? null : null, mediaType: mimeType };
    }) }, { headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "BANNERS_UNAVAILABLE" }, { status: 503 }); }
}
