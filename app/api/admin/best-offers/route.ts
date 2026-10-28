import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGlobalAdminMutation, requireGlobalAdminSession } from "@/lib/auth";
import { adminDb, newId } from "@/lib/admin-db";

export const dynamic = "force-dynamic";

const addSchema = z.object({ productId: z.string().min(1).max(160), sortOrder: z.number().int().min(-100000).max(100000).optional() });
const updateSchema = z.object({ id: z.string().min(1).max(160), sortOrder: z.number().int().min(-100000).max(100000).optional(), isActive: z.boolean().optional() }).refine(value => value.sortOrder !== undefined || value.isActive !== undefined);
const idSchema = z.object({ id: z.string().min(1).max(160) });

function errorResponse(error: unknown) {
  const value = error && typeof error === "object" ? error as { message?: string; code?: string; meta?: { code?: string } } : {};
  const message = value.message ?? "BEST_OFFERS_FAILED";
  const code = value.meta?.code ?? value.code;
  const invalidBody = error instanceof SyntaxError;
  const status = invalidBody ? 400 : message === "UNAUTHORIZED" ? 401 : ["FORBIDDEN", "CSRF_INVALID"].includes(message) ? 403 : message === "NOT_FOUND" ? 404 : message === "DUPLICATE_PRODUCT" || code === "23505" ? 409 : message === "INVALID_PRODUCT" || code === "23503" ? 400 : 500;
  const errorKey = invalidBody ? "INVALID_VALUE" : status === 500 ? "BEST_OFFERS_FAILED" : message === "NOT_FOUND" || message === "DUPLICATE_PRODUCT" || message === "INVALID_PRODUCT" ? message : code === "23503" ? "INVALID_PRODUCT" : message;
  return NextResponse.json({ error: errorKey }, { status });
}

export async function GET() {
  try {
    await requireGlobalAdminSession();
    const db = adminDb();
    const [data, products] = await Promise.all([
      db.$queryRaw<any[]>`SELECT offer.id,offer."productId",offer.title,offer.description,offer."sortOrder",offer."isActive",p.name AS "productName",p.slug,b.name AS "brandName" FROM best_offers offer JOIN products p ON p.id=offer."productId" LEFT JOIN brands b ON b.id=p."brandId" ORDER BY offer."sortOrder",offer.id`,
      db.$queryRaw<any[]>`SELECT p.id,p.name,p.slug,b.name AS "brandName" FROM products p JOIN brands b ON b.id=p."brandId" AND b."isActive"=TRUE JOIN product_types pt ON pt.id=p."productTypeId" AND pt."isActive"=TRUE JOIN categories c ON c.id=p."categoryId" AND c."isActive"=TRUE WHERE p.status='PUBLISHED'::"ProductStatus" AND EXISTS(SELECT 1 FROM product_variants v WHERE v."productId"=p.id AND v."isActive"=TRUE) AND NOT EXISTS(SELECT 1 FROM best_offers existing WHERE existing."productId"=p.id) ORDER BY b.name,p.name,p.id`,
    ]);
    return NextResponse.json({ data, products });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await requireGlobalAdminMutation(request);
    const body = addSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_VALUE" }, { status: 400 });
    const { productId, sortOrder } = body.data;
    const db = adminDb();
    const id = newId();
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${productId},0)) IS NULL AS acquired`;
      const existing = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM best_offers WHERE "productId"=${productId} LIMIT 1`;
      if (existing.length) throw new Error("DUPLICATE_PRODUCT");
      const product = await tx.$queryRaw<Array<{ id: string; name: string }>>`SELECT p.id,p.name FROM products p JOIN brands b ON b.id=p."brandId" AND b."isActive"=TRUE JOIN product_types pt ON pt.id=p."productTypeId" AND pt."isActive"=TRUE JOIN categories c ON c.id=p."categoryId" AND c."isActive"=TRUE WHERE p.id=${productId} AND p.status='PUBLISHED'::"ProductStatus" AND EXISTS(SELECT 1 FROM product_variants v WHERE v."productId"=p.id AND v."isActive"=TRUE) LIMIT 1`;
      if (!product.length) throw new Error("INVALID_PRODUCT");
      const position = sortOrder ?? Math.min((await tx.$queryRaw<Array<{ value: number }>>`SELECT COALESCE(MAX("sortOrder"),-10)+10 AS value FROM best_offers`)[0].value, 100000);
      await tx.$executeRaw`INSERT INTO best_offers (id,"productId",title,description,"discountPercent","sortOrder","isActive","createdAt","updatedAt") VALUES (${id},${productId},${product[0].name},NULL,NULL,${position},TRUE,NOW(),NOW())`;
    });
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    await requireGlobalAdminMutation(request);
    const body = updateSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_VALUE" }, { status: 400 });
    const { id, sortOrder, isActive } = body.data;
    const result = await adminDb().$executeRaw`UPDATE best_offers SET "sortOrder"=COALESCE(${sortOrder ?? null},"sortOrder"),"isActive"=COALESCE(${isActive ?? null},"isActive"),"updatedAt"=NOW() WHERE id=${id}`;
    if (!result) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ data: { id } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    await requireGlobalAdminMutation(request);
    const body = idSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_VALUE" }, { status: 400 });
    const result = await adminDb().$executeRaw`DELETE FROM best_offers WHERE id=${body.data.id}`;
    if (!result) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ data: { id: body.data.id } });
  } catch (error) { return errorResponse(error); }
}
