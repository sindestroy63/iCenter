import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGlobalAdminMutation, requireGlobalAdminSession } from "@/lib/auth";
import { adminDb, newId } from "@/lib/admin-db";

export const dynamic = "force-dynamic";

const nameSchema = z.string().trim().min(1).max(160);
const slugSchema = z.string().trim().toLowerCase().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const createSchema = z.object({ name: nameSchema, slug: slugSchema, isActive: z.boolean().default(true) }).strict();
const updateSchema = z.object({ id: z.string().trim().min(1).max(100), name: nameSchema.optional(), slug: slugSchema.optional(), isActive: z.boolean().optional() }).strict().refine((value) => Object.keys(value).length > 1, "INVALID_CITY");

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "CITIES_FAILED";
  const candidate = error && typeof error === "object" ? error as { code?: unknown; meta?: { code?: unknown } } : {};
  const code = String(candidate.meta?.code ?? candidate.code ?? "");
  if (["42P01", "42703"].includes(code) || code === "P2010" && ["42P01", "42703"].includes(String(candidate.meta?.code ?? ""))) return NextResponse.json({ error: "CITIES_SCHEMA_UNAVAILABLE" }, { status: 503 });
  if (code === "23505" || code === "P2002") return NextResponse.json({ error: "DUPLICATE_CITY" }, { status: 409 });
  const status = message === "UNAUTHORIZED" ? 401
    : message === "FORBIDDEN" || message === "CSRF_INVALID" ? 403
      : message === "NOT_FOUND" ? 404
        : message === "DUPLICATE_CITY" || message === "CITY_IN_USE" ? 409 : 400;
  const publicErrors = new Set(["INVALID_CITY", "CITY_IN_USE", "DUPLICATE_CITY"]);
  return NextResponse.json({ error: publicErrors.has(message) ? message : status >= 500 ? "CITIES_FAILED" : message }, { status });
}

async function hasReferences(tx: any, cityId: string) {
  const rows = await tx.$queryRaw<any[]>`
    SELECT
      EXISTS(SELECT 1 FROM inventory WHERE "cityId"=${cityId}) OR
      EXISTS(SELECT 1 FROM orders WHERE "cityId"=${cityId}) OR
      EXISTS(SELECT 1 FROM order_attempts WHERE "cityId"=${cityId}) OR
      EXISTS(SELECT 1 FROM service_requests WHERE "cityId"=${cityId}) OR
      EXISTS(SELECT 1 FROM stores WHERE "cityId"=${cityId}) OR
      EXISTS(SELECT 1 FROM user_city_access WHERE "cityId"=${cityId}) AS used
  `;
  return Boolean(rows[0]?.used);
}

export async function GET() {
  try {
    await requireGlobalAdminSession();
    const data = await adminDb().$queryRaw<any[]>`
      SELECT c.id,c.name,c.slug,c."isActive",c."sortOrder",
        (EXISTS(SELECT 1 FROM inventory i WHERE i."cityId"=c.id) OR
         EXISTS(SELECT 1 FROM orders o WHERE o."cityId"=c.id) OR
         EXISTS(SELECT 1 FROM order_attempts a WHERE a."cityId"=c.id) OR
         EXISTS(SELECT 1 FROM service_requests r WHERE r."cityId"=c.id) OR
         EXISTS(SELECT 1 FROM stores s WHERE s."cityId"=c.id) OR
         EXISTS(SELECT 1 FROM user_city_access u WHERE u."cityId"=c.id)) AS "hasReferences"
      FROM cities c ORDER BY c."sortOrder",c.name
    `;
    return NextResponse.json({ data });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await requireGlobalAdminMutation(request);
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_CITY" }, { status: 400 });
    const value = parsed.data;
    const db = adminDb();
    const id = newId();
    await db.$transaction(async (tx) => {
      const duplicate = await tx.$queryRaw<any[]>`SELECT id FROM cities WHERE lower(name)=lower(${value.name}) OR slug=${value.slug} LIMIT 1`;
      if (duplicate.length) throw new Error("DUPLICATE_CITY");
      const order = await tx.$queryRaw<any[]>`SELECT COALESCE(MAX("sortOrder"),0)+10 AS value FROM cities`;
      await tx.$executeRaw`INSERT INTO cities (id,name,slug,"isActive","sortOrder","updatedAt") VALUES (${id},${value.name},${value.slug},${value.isActive},${order[0].value},NOW())`;
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    await requireGlobalAdminMutation(request);
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_CITY" }, { status: 400 });
    const value = parsed.data;
    const db = adminDb();
    await db.$transaction(async (tx) => {
      const existing = await tx.$queryRaw<any[]>`SELECT id,"isActive" FROM cities WHERE id=${value.id} FOR UPDATE`;
      if (!existing.length) throw new Error("NOT_FOUND");
      if (value.name || value.slug) {
        const duplicate = await tx.$queryRaw<any[]>`SELECT id FROM cities WHERE id<>${value.id} AND ((${value.name ?? null}::text IS NOT NULL AND lower(name)=lower(${value.name ?? null})) OR (${value.slug ?? null}::text IS NOT NULL AND slug=${value.slug ?? null})) LIMIT 1`;
        if (duplicate.length) throw new Error("DUPLICATE_CITY");
      }
      if (value.isActive === false && existing[0].isActive && await hasReferences(tx, value.id)) throw new Error("CITY_IN_USE");
      await tx.$executeRaw`
        UPDATE cities SET name=COALESCE(${value.name ?? null},name),slug=COALESCE(${value.slug ?? null},slug),
          "isActive"=COALESCE(${value.isActive ?? null},"isActive"),"updatedAt"=NOW()
        WHERE id=${value.id}
      `;
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
