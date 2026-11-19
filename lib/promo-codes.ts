import "server-only";
import { PrismaClient, type Prisma } from "@prisma/client";
import { fixedDiscountCents, formatMoneyCents, isPromoEligible, normalizePromoCode, parseMoneyCents } from "@/lib/promo-code-pricing";
export { normalizePromoCode } from "@/lib/promo-code-pricing";

export type PromoResult = { code: string; promoCodeId: string; discount: string; subtotal: string; total: string };

declare global { var promoPrisma: PrismaClient | undefined; }
function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  globalThis.promoPrisma ??= new PrismaClient({ log: [] });
  return globalThis.promoPrisma;
}

export async function validatePromo(code: string, city: string, items: Array<{ variantId: string; quantity: number }>) {
  return db().$transaction((tx) => calculatePromo(tx, code, city, items, false));
}

export async function calculatePromo(tx: Prisma.TransactionClient, codeInput: string, citySlug: string, items: Array<{ variantId: string; quantity: number }>, consume = false): Promise<PromoResult> {
  const code = normalizePromoCode(codeInput);
  if (!/^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(code)) throw new Error("PROMO_INVALID");
  const cities = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM cities WHERE slug=${citySlug} AND "isActive"=TRUE LIMIT 1`;
  if (!cities[0]) throw new Error("CITY_UNAVAILABLE");
  const ids = items.map((item) => item.variantId);
  const rows = await tx.$queryRaw<Array<{ variantId: string; price: string | null; availability: string; allowPreorder: boolean }>>`
    SELECT v.id AS "variantId", i.price::text AS price, i.availability::text AS availability, i."allowPreorder"
    FROM product_variants v JOIN products p ON p.id=v."productId" AND p.status='PUBLISHED'::"ProductStatus"
    JOIN inventory i ON i."variantId"=v.id AND i."cityId"=${cities[0].id} AND i."isActive"=TRUE
    WHERE v.id=ANY(${ids}::text[]) AND v."isActive"=TRUE`;
  if (rows.length !== ids.length || rows.some((row) => row.availability !== "IN_STOCK" && row.availability !== "PREORDER" && !row.allowPreorder)) throw new Error("VARIANT_UNAVAILABLE");
  const byId = new Map(rows.map((row) => [row.variantId, row]));
  const subtotalCents = items.reduce((sum, item) => {
    const rawPrice = byId.get(item.variantId)?.price;
    if (rawPrice === null || rawPrice === undefined) throw new Error("PRICE_UNAVAILABLE");
    try { return sum + parseMoneyCents(rawPrice) * BigInt(item.quantity); }
    catch { throw new Error("PRICE_UNAVAILABLE"); }
  }, BigInt(0));
  const promo = await tx.$queryRaw<Array<{ id: string; code: string; discountAmount: string; usageLimit: number | null; usageCount: number; isActive: boolean; startsAt: Date | null; endsAt: Date | null }>>`
    SELECT id,code,"discountAmount"::text AS "discountAmount","usageLimit","usageCount","isActive","startsAt","endsAt" FROM promo_codes WHERE code=${code} LIMIT 1`;
  const row = promo[0];
  if (!row || !isPromoEligible(row)) throw new Error("PROMO_UNAVAILABLE");
  if (consume) {
    const updated = await tx.$queryRaw<Array<{ id: string }>>`UPDATE promo_codes SET "usageCount"="usageCount"+1,"updatedAt"=NOW() WHERE id=${row.id} AND "isActive"=TRUE AND ("startsAt" IS NULL OR "startsAt"<=NOW()) AND ("endsAt" IS NULL OR "endsAt">=NOW()) AND ("usageLimit" IS NULL OR "usageCount"<"usageLimit") RETURNING id`;
    if (!updated[0]) throw new Error("PROMO_UNAVAILABLE");
  }
  const discountCents = fixedDiscountCents(row.discountAmount, subtotalCents);
  return { code: row.code, promoCodeId: row.id, discount: formatMoneyCents(discountCents), subtotal: formatMoneyCents(subtotalCents), total: formatMoneyCents(subtotalCents - discountCents) };
}
