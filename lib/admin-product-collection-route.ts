import "server-only";

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGlobalAdminMutation, requireGlobalAdminSession } from "@/lib/auth";
import { adminDb, newId } from "@/lib/admin-db";
import { collectionError, collectionSchema, loadAdminCollection, type ProductCollection } from "@/lib/product-collections";

const addSchema = z.object({
  productId: z.string().min(1).max(160),
  variantId: z.string().min(1).max(160).nullable().optional(),
  city: z.string().min(1).max(160),
  sortOrder: z.number().int().min(-100000).max(100000).optional(),
});
const updateSchema = z.object({ id: z.string().min(1).max(160), sortOrder: z.number().int().min(-100000).max(100000).optional(), isActive: z.boolean().optional() }).refine((value) => value.sortOrder !== undefined || value.isActive !== undefined);
const idSchema = z.object({ id: z.string().min(1).max(160) });

function tableSql(collection: ProductCollection) { return Prisma.raw(collection); }

function responseError(error: unknown) {
  const { message, code } = collectionError(error);
  const status = message === "UNAUTHORIZED" ? 401
    : ["FORBIDDEN", "CSRF_INVALID"].includes(message) ? 403
    : message === "NOT_FOUND" ? 404
    : ["DUPLICATE_PRODUCT", "DUPLICATE_VARIANT", "MIXED_COLLECTION_SCOPE"].includes(message) || code === "23505" ? 409
    : ["INVALID_PRODUCT", "INVALID_VARIANT", "INVALID_CITY"].includes(message) || code === "23503" ? 400
    : message === "COLLECTION_SCHEMA_REQUIRED" ? 503
    : error instanceof SyntaxError ? 400 : 500;
  return NextResponse.json({ error: status === 500 ? "COLLECTION_FAILED" : message }, { status });
}

export async function collectionGet(request: Request, collection: ProductCollection) {
  try {
    await requireGlobalAdminSession();
    const city = new URL(request.url).searchParams.get("city");
    return NextResponse.json(await loadAdminCollection(adminDb(), collection, city));
  } catch (error) { return responseError(error); }
}

export async function collectionPost(request: Request, collection: ProductCollection) {
  try {
    await requireGlobalAdminMutation(request);
    const body = addSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_VALUE" }, { status: 400 });
    const { productId, variantId = null, city, sortOrder } = body.data;
    const db = adminDb();
    const schema = await collectionSchema(db, collection);
    if (!schema.tableExists || (variantId && !schema.variantColumnExists)) throw new Error("COLLECTION_SCHEMA_REQUIRED");
    const table = tableSql(collection);
    const id = newId();
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${collection}:${productId}`},0))`;
      const cityRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM cities WHERE slug=${city} AND "isActive"=TRUE LIMIT 1`;
      if (!cityRows.length) throw new Error("INVALID_CITY");
      const cityId = cityRows[0].id;
      const existing = schema.variantColumnExists
        ? await tx.$queryRaw<Array<{ variantId: string | null }>>(Prisma.sql`SELECT "variantId" FROM ${table} WHERE "productId"=${productId}`)
        : await tx.$queryRaw<Array<{ variantId: string | null }>>`SELECT NULL::text AS "variantId" FROM best_offers WHERE "productId"=${productId}`;
      if (variantId) {
        if (existing.some((entry) => entry.variantId === null)) throw new Error("MIXED_COLLECTION_SCOPE");
        if (existing.some((entry) => entry.variantId === variantId)) throw new Error("DUPLICATE_VARIANT");
      } else if (existing.length) throw new Error(existing.some((entry) => entry.variantId !== null) ? "MIXED_COLLECTION_SCOPE" : "DUPLICATE_PRODUCT");

      const product = await tx.$queryRaw<Array<{ id: string; name: string }>>`
        SELECT p.id,p.name FROM products p
        JOIN brands b ON b.id=p."brandId" AND b."isActive"=TRUE
        JOIN product_types pt ON pt.id=p."productTypeId" AND pt."isActive"=TRUE
        JOIN categories c ON c.id=p."categoryId" AND c."isActive"=TRUE
        WHERE p.id=${productId} AND p.status='PUBLISHED'::"ProductStatus"
          AND EXISTS(SELECT 1 FROM product_variants v JOIN inventory i ON i."variantId"=v.id
            WHERE v."productId"=p.id AND v."isActive"=TRUE AND i."cityId"=${cityId} AND i."isActive"=TRUE)
        LIMIT 1
      `;
      if (!product.length) throw new Error("INVALID_PRODUCT");
      if (variantId) {
        const variant = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT v.id FROM product_variants v JOIN inventory i ON i."variantId"=v.id
          WHERE v.id=${variantId} AND v."productId"=${productId} AND v."isActive"=TRUE
            AND i."cityId"=${cityId} AND i."isActive"=TRUE LIMIT 1
        `;
        if (!variant.length) throw new Error("INVALID_VARIANT");
      }
      const position = sortOrder ?? Math.min((await tx.$queryRaw<Array<{ value: number }>>(Prisma.sql`SELECT COALESCE(MAX("sortOrder"),-10)+10 AS value FROM ${table}`))[0].value, 100000);
      if (collection === "best_offers") {
        if (schema.variantColumnExists) await tx.$executeRaw`
          INSERT INTO best_offers (id,"productId","variantId",title,description,"discountPercent","sortOrder","isActive","createdAt","updatedAt")
          VALUES (${id},${productId},${variantId},${product[0].name},NULL,NULL,${position},TRUE,NOW(),NOW())
        `;
        else await tx.$executeRaw`
          INSERT INTO best_offers (id,"productId",title,description,"discountPercent","sortOrder","isActive","createdAt","updatedAt")
          VALUES (${id},${productId},${product[0].name},NULL,NULL,${position},TRUE,NOW(),NOW())
        `;
      } else await tx.$executeRaw`
        INSERT INTO popular_products (id,"productId","variantId","sortOrder","isActive","createdAt","updatedAt")
        VALUES (${id},${productId},${variantId},${position},TRUE,NOW(),NOW())
      `;
    });
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (error) { return responseError(error); }
}

export async function collectionPatch(request: Request, collection: ProductCollection) {
  try {
    await requireGlobalAdminMutation(request);
    const body = updateSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_VALUE" }, { status: 400 });
    const table = tableSql(collection);
    const result = await adminDb().$executeRaw(Prisma.sql`UPDATE ${table} SET "sortOrder"=COALESCE(${body.data.sortOrder ?? null},"sortOrder"),"isActive"=COALESCE(${body.data.isActive ?? null},"isActive"),"updatedAt"=NOW() WHERE id=${body.data.id}`);
    if (!result) throw new Error("NOT_FOUND");
    return NextResponse.json({ data: { id: body.data.id } });
  } catch (error) { return responseError(error); }
}

export async function collectionDelete(request: Request, collection: ProductCollection) {
  try {
    await requireGlobalAdminMutation(request);
    const body = idSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_VALUE" }, { status: 400 });
    const table = tableSql(collection);
    const result = await adminDb().$executeRaw(Prisma.sql`DELETE FROM ${table} WHERE id=${body.data.id}`);
    if (!result) throw new Error("NOT_FOUND");
    return NextResponse.json({ data: { id: body.data.id } });
  } catch (error) { return responseError(error); }
}
