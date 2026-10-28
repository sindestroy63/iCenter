import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/admin-db";
import { authErrorStatus, requireAdminMutation, requireAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  variantId: z.string().min(1),
  cityId: z.string().min(1),
  price: z.number().finite().nonnegative().nullable().optional(),
  stock: z.number().int().nonnegative().nullable().optional(),
  availability: z.enum(["UNSPECIFIED", "IN_STOCK", "PREORDER", "OUT_OF_STOCK"]).optional(),
}).strict().refine((value) => value.price !== undefined || value.stock !== undefined || value.availability !== undefined);

function failure(error: unknown) {
  const status = authErrorStatus(error);
  return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "INVENTORY_UNAVAILABLE" }, { status });
}

export async function GET() {
  try {
    const session = await requireAdminSession();
    const db = adminDb();
    const rows = session.role === "CITY_MANAGER"
      ? await db.$queryRaw<any[]>`
          SELECT p.id AS "productId",p.name AS "productName",v.id AS "variantId",v.sku,v.label,
            i.id AS "inventoryId",i."cityId",c.name AS "cityName",i.price::text AS price,i.stock,
            i.availability::text AS availability,g."canManagePrices",g."canManageStock"
          FROM user_city_access g
          JOIN cities c ON c.id=g."cityId" AND c."isActive"=TRUE
          JOIN inventory i ON i."cityId"=c.id AND i."isActive"=TRUE
          JOIN product_variants v ON v.id=i."variantId" AND v."isActive"=TRUE
          JOIN products p ON p.id=v."productId"
          WHERE g."userId"=${session.userId} ORDER BY c.name,p.name,v.sku
        `
      : await db.$queryRaw<any[]>`
          SELECT p.id AS "productId",p.name AS "productName",v.id AS "variantId",v.sku,v.label,
            i.id AS "inventoryId",i."cityId",c.name AS "cityName",i.price::text AS price,i.stock,
            i.availability::text AS availability,TRUE AS "canManagePrices",TRUE AS "canManageStock"
          FROM inventory i JOIN cities c ON c.id=i."cityId" AND c."isActive"=TRUE
          JOIN product_variants v ON v.id=i."variantId" AND v."isActive"=TRUE
          JOIN products p ON p.id=v."productId" ORDER BY c.name,p.name,v.sku
        `;
    return NextResponse.json({ data: rows.map((row) => ({ ...row, price: row.price == null ? null : Number(row.price), stock: row.stock == null ? null : Number(row.stock) })) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdminMutation(request);
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_INVENTORY_UPDATE" }, { status: 400 });
    const value = parsed.data;
    const db = adminDb();
    await db.$transaction(async (tx) => {
      const grant = session.role === "CITY_MANAGER"
        ? await tx.$queryRaw<any[]>`SELECT "canManagePrices","canManageStock" FROM user_city_access WHERE "userId"=${session.userId} AND "cityId"=${value.cityId} FOR UPDATE`
        : [{ canManagePrices: true, canManageStock: true }];
      if (!grant.length) throw new Error("FORBIDDEN");
      if (value.price !== undefined && !grant[0].canManagePrices) throw new Error("FORBIDDEN");
      if ((value.stock !== undefined || value.availability !== undefined) && !grant[0].canManageStock) throw new Error("FORBIDDEN");
      const item = await tx.$queryRaw<any[]>`SELECT i.id FROM inventory i JOIN product_variants v ON v.id=i."variantId" WHERE i."variantId"=${value.variantId} AND i."cityId"=${value.cityId} AND i."isActive"=TRUE AND v."isActive"=TRUE LIMIT 1 FOR UPDATE OF i`;
      if (!item.length) throw new Error("NOT_FOUND");
      if (value.price !== undefined) await tx.$executeRaw`UPDATE inventory SET price=${value.price},"updatedAt"=NOW() WHERE id=${item[0].id}`;
      if (value.stock !== undefined) await tx.$executeRaw`UPDATE inventory SET stock=${value.stock},"updatedAt"=NOW() WHERE id=${item[0].id}`;
      if (value.availability !== undefined) await tx.$executeRaw`UPDATE inventory SET availability=${value.availability}::"AvailabilityStatus","updatedAt"=NOW() WHERE id=${item[0].id}`;
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
