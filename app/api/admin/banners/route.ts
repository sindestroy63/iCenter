import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGlobalAdminMutation, requireGlobalAdminSession } from "@/lib/auth";
import { adminDb, newId } from "@/lib/admin-db";

export const dynamic = "force-dynamic";
const placements = ["home", "home_brand_apple", "home_brand_samsung", "home_brand_dyson", "home_brand_playstation", "product_trade_in"] as const;
const brandTitles: Partial<Record<(typeof placements)[number], string>> = {
  home_brand_apple: "Apple",
  home_brand_samsung: "Samsung",
  home_brand_dyson: "Dyson",
  home_brand_playstation: "PlayStation",
};
const schema = z.object({ id: z.string().optional(), placement: z.enum(placements).default("home"), title: z.string().trim().min(1).max(160), subtitle: z.string().trim().max(500).nullable(), linkUrl: z.string().trim().max(500).nullable(), linkText: z.string().trim().max(80).nullable(), imageMediaId: z.string().min(1).nullable(), sortOrder: z.number().int().min(-100000).max(100000), isActive: z.boolean() });

function failure(error: unknown) {
  const err = error as { message?: string; code?: string; meta?: { code?: string } };
  const message = err?.message ?? "BANNERS_FAILED";
  const code = err?.meta?.code ?? err?.code;
  const status = message === "UNAUTHORIZED" ? 401 : ["FORBIDDEN", "CSRF_INVALID"].includes(message) ? 403 : message === "NOT_FOUND" ? 404 : code === "23503" ? 400 : code === "23505" ? 409 : 500;
  return NextResponse.json({ error: status === 500 ? "BANNERS_FAILED" : message === "NOT_FOUND" ? message : code === "23503" ? "INVALID_IMAGE" : message }, { status });
}

export async function GET() {
  try {
    await requireGlobalAdminSession();
    const data = await adminDb().$queryRaw<any[]>`SELECT b.id,b.placement,b.title,b.subtitle,b."linkUrl",b."linkText",b."imageMediaId",b."sortOrder",b."isActive",m.filename AS "imageName",m."storagePath" AS "imageUrl",m."mimeType" AS "imageMimeType" FROM banners b LEFT JOIN media m ON m.id=b."imageMediaId" ORDER BY b."sortOrder",b.id`;
    return NextResponse.json({ data: data.map(item => ({ ...item, imageUrl: item.imageUrl ? `/${item.imageUrl}` : null })) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) { return save(request, false); }
export async function PATCH(request: Request) { return save(request, true); }

async function save(request: Request, update: boolean) {
  try {
    await requireGlobalAdminMutation(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success || (update && parsed.data.id === undefined) || (!update && parsed.data.id !== undefined && parsed.data.id !== "")) return NextResponse.json({ error: "INVALID_VALUE" }, { status: 400 });
    const submitted = parsed.data;
    const brandTitle = brandTitles[submitted.placement];
    const value = submitted.placement === "product_trade_in"
      ? { ...submitted, title: "Trade-in — карточка товара", subtitle: null, linkUrl: null, linkText: "Открыть форму Trade-in" }
      : brandTitle
        ? { ...submitted, title: brandTitle, subtitle: null, linkUrl: null, linkText: null }
        : submitted;
    if (value.linkUrl && !((value.linkUrl.startsWith("/") && !value.linkUrl.startsWith("//")) || /^https:\/\//i.test(value.linkUrl))) return NextResponse.json({ error: "INVALID_LINK" }, { status: 400 });
    const db = adminDb();
    if (value.imageMediaId) {
      const media = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM media WHERE id=${value.imageMediaId} AND "mimeType" IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm') LIMIT 1`;
      if (!media.length) return NextResponse.json({ error: "INVALID_MEDIA" }, { status: 400 });
    }
    const saved = await db.$transaction(async (tx) => {
      if (update) {
        const id = value.id!;
        const count = await tx.$executeRaw`UPDATE banners SET placement=${value.placement},title=${value.title},subtitle=${value.subtitle},"linkUrl"=${value.linkUrl},"linkText"=${value.linkText},"imageMediaId"=${value.imageMediaId},"sortOrder"=${value.sortOrder},"isActive"=${value.isActive},"updatedAt"=NOW() WHERE id=${id}`;
        return { id, created: false, found: count > 0 };
      }

      await tx.$queryRaw<Array<{ locked: string }>>`SELECT pg_advisory_xact_lock(hashtext('icenter:banners'), hashtext(${value.placement}))::text AS locked`;
      const existing = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM banners WHERE placement=${value.placement} ORDER BY "isActive" DESC,"sortOrder",id LIMIT 1 FOR UPDATE`;
      const id = existing[0]?.id ?? newId();
      if (existing[0]) {
        await tx.$executeRaw`UPDATE banners SET title=${value.title},subtitle=${value.subtitle},"linkUrl"=${value.linkUrl},"linkText"=${value.linkText},"imageMediaId"=${value.imageMediaId},"sortOrder"=${value.sortOrder},"isActive"=${value.isActive},"updatedAt"=NOW() WHERE id=${id}`;
        return { id, created: false, found: true };
      }

      await tx.$executeRaw`INSERT INTO banners (id,placement,title,subtitle,"linkUrl","linkText","imageMediaId","sortOrder","isActive","createdAt","updatedAt") VALUES (${id},${value.placement},${value.title},${value.subtitle},${value.linkUrl},${value.linkText},${value.imageMediaId},${value.sortOrder},${value.isActive},NOW(),NOW())`;
      return { id, created: true, found: true };
    });
    if (!saved.found) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ data: { id: saved.id } }, { status: saved.created ? 201 : 200 });
  } catch (error) { return failure(error); }
}
