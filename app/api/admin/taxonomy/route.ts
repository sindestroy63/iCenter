import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGlobalAdminMutation, requireGlobalAdminSession } from "@/lib/auth";
import { adminDb, newId } from "@/lib/admin-db";

export const dynamic = "force-dynamic";

const typeSchema = z.enum(["categories", "brands"]);
const nameSchema = z.string().trim().min(1).max(160);
const slugSchema = z.string().trim().toLowerCase().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const descriptionSchema = z.string().trim().max(2000);
const orderSchema = z.number().int().min(-100000).max(100000);
const activeSchema = z.boolean();

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "TAXONOMY_FAILED";
  const candidate = error && typeof error === "object" ? error as { code?: unknown; meta?: { code?: unknown } } : {};
  const code = String(candidate.meta?.code ?? candidate.code ?? "");
  if (["42P01", "42703"].includes(code) || code === "P2010" && ["42P01", "42703"].includes(String(candidate.meta?.code ?? ""))) return NextResponse.json({ error: "TAXONOMY_SCHEMA_UNAVAILABLE" }, { status: 503 });
  if (code === "23505" || code === "P2002") return NextResponse.json({ error: "DUPLICATE_VALUE" }, { status: 409 });
  if (code === "23503") return NextResponse.json({ error: "INVALID_REFERENCE" }, { status: 400 });
  const status = message === "UNAUTHORIZED" ? 401
    : message === "FORBIDDEN" || message === "CSRF_INVALID" ? 403
      : message === "NOT_FOUND" ? 404
        : message === "DUPLICATE_VALUE" ? 409 : 400;
const publicErrors = new Set(["INVALID_VALUE", "INVALID_PARENT", "CATEGORY_PARENT_CYCLE"]);
  return NextResponse.json({ error: publicErrors.has(message) ? message : status >= 500 ? "TAXONOMY_FAILED" : message }, { status });
}

async function validateParent(tx: any, parentId: string | null | undefined, categoryId?: string) {
  if (!parentId) return;
  if (categoryId && parentId === categoryId) throw new Error("CATEGORY_PARENT_CYCLE");
  const parent = await tx.$queryRaw<any[]>`SELECT id FROM categories WHERE id=${parentId} AND "isActive"=TRUE`;
  if (!parent.length) throw new Error("INVALID_PARENT");
  if (categoryId) {
    const cycle = await tx.$queryRaw<any[]>`
      WITH RECURSIVE descendants(id) AS (
        SELECT id FROM categories WHERE id=${parentId}
        UNION
        SELECT child.id FROM categories child JOIN descendants tree ON child."parentId"=tree.id
      )
      SELECT id FROM descendants WHERE id=${categoryId} LIMIT 1
    `;
    if (cycle.length) throw new Error("CATEGORY_PARENT_CYCLE");
  }
}

export async function GET(request: Request) {
  try {
    await requireGlobalAdminSession();
    const type = typeSchema.safeParse(new URL(request.url).searchParams.get("type"));
    if (!type.success) return NextResponse.json({ error: "INVALID_VALUE" }, { status: 400 });
    const db = adminDb();
    if (type.data === "categories") return NextResponse.json({ data: await db.$queryRaw<any[]>`
      SELECT c.id,c.name,c.slug,c.description,c."parentId",parent.name AS "parentName",
        c."sortOrder",c."isActive",COUNT(DISTINCT p.id)::int AS "productCount"
      FROM categories c LEFT JOIN categories parent ON parent.id=c."parentId"
      LEFT JOIN products p ON p."categoryId"=c.id
      GROUP BY c.id,parent.name ORDER BY c."sortOrder",c.name
    ` });
    const data = await db.$queryRaw<any[]>`
      SELECT b.id,b.name,b.slug,b.description,b."sortOrder",b."isActive",COUNT(DISTINCT p.id)::int AS "productCount"
      FROM brands b LEFT JOIN products p ON p."brandId"=b.id
      GROUP BY b.id ORDER BY b."sortOrder",b.name
    `;
    return NextResponse.json({ data });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await requireGlobalAdminMutation(request);
    const type = typeSchema.safeParse(new URL(request.url).searchParams.get("type"));
    if (!type.success) return NextResponse.json({ error: "INVALID_VALUE" }, { status: 400 });
    const common = { name: nameSchema, slug: slugSchema, description: descriptionSchema.default(""), sortOrder: orderSchema.default(0), isActive: activeSchema.default(true) };
    const schema = type.data === "categories"
      ? z.object({ ...common, parentId: z.string().trim().min(1).max(100).nullable().optional() }).strict()
      : z.object(common).strict();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_VALUE" }, { status: 400 });
    const value = parsed.data;
    const db = adminDb();
    const id = newId();
    await db.$transaction(async (tx) => {
      const duplicate = type.data === "categories"
        ? await tx.$queryRaw<any[]>`SELECT id FROM categories WHERE lower(name)=lower(${value.name}) OR slug=${value.slug} LIMIT 1`
        : await tx.$queryRaw<any[]>`SELECT id FROM brands WHERE lower(name)=lower(${value.name}) OR slug=${value.slug} LIMIT 1`;
      if (duplicate.length) throw new Error("DUPLICATE_VALUE");
      if (type.data === "categories") {
        const category = value as z.infer<typeof schema> & { parentId?: string | null };
        await validateParent(tx, category.parentId);
        await tx.$executeRaw`INSERT INTO categories (id,name,slug,description,"parentId","sortOrder","isActive","updatedAt") VALUES (${id},${category.name},${category.slug},${category.description},${category.parentId ?? null},${category.sortOrder},${category.isActive},NOW())`;
      } else {
        await tx.$executeRaw`INSERT INTO brands (id,name,slug,description,"sortOrder","isActive","updatedAt") VALUES (${id},${value.name},${value.slug},${value.description},${value.sortOrder},${value.isActive},NOW())`;
      }
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    await requireGlobalAdminMutation(request);
    const type = typeSchema.safeParse(new URL(request.url).searchParams.get("type"));
    if (!type.success) return NextResponse.json({ error: "INVALID_VALUE" }, { status: 400 });
    const common = { id: z.string().trim().min(1).max(100), name: nameSchema.optional(), slug: slugSchema.optional(), description: descriptionSchema.optional(), sortOrder: orderSchema.optional(), isActive: activeSchema.optional() };
    const schema = type.data === "categories"
      ? z.object({ ...common, parentId: z.string().trim().min(1).max(100).nullable().optional() }).strict()
      : z.object(common).strict();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success || !parsed.data || Object.keys(parsed.data).length < 2) return NextResponse.json({ error: "INVALID_VALUE" }, { status: 400 });
    const value = parsed.data;
    const db = adminDb();
    await db.$transaction(async (tx) => {
      const table = type.data;
      const existing = table === "categories"
        ? await tx.$queryRaw<any[]>`SELECT id FROM categories WHERE id=${value.id}`
        : await tx.$queryRaw<any[]>`SELECT id FROM brands WHERE id=${value.id}`;
      if (!existing.length) throw new Error("NOT_FOUND");
      if (value.name || value.slug) {
        const duplicate = table === "categories"
          ? await tx.$queryRaw<any[]>`SELECT id FROM categories WHERE id<>${value.id} AND ((${value.name ?? null}::text IS NOT NULL AND lower(name)=lower(${value.name ?? null})) OR (${value.slug ?? null}::text IS NOT NULL AND slug=${value.slug ?? null})) LIMIT 1`
          : await tx.$queryRaw<any[]>`SELECT id FROM brands WHERE id<>${value.id} AND ((${value.name ?? null}::text IS NOT NULL AND lower(name)=lower(${value.name ?? null})) OR (${value.slug ?? null}::text IS NOT NULL AND slug=${value.slug ?? null})) LIMIT 1`;
        if (duplicate.length) throw new Error("DUPLICATE_VALUE");
      }
      if (table === "categories") {
        const category = value as typeof value & { parentId?: string | null };
        if (Object.hasOwn(category, "parentId")) await validateParent(tx, category.parentId, value.id);
        await tx.$executeRaw`
          UPDATE categories SET name=COALESCE(${category.name ?? null},name),slug=COALESCE(${category.slug ?? null},slug),
            description=COALESCE(${category.description ?? null},description),
            "parentId"=CASE WHEN ${Object.hasOwn(category, "parentId")} THEN ${category.parentId ?? null} ELSE "parentId" END,
            "sortOrder"=COALESCE(${category.sortOrder ?? null},"sortOrder"),"isActive"=COALESCE(${category.isActive ?? null},"isActive"),"updatedAt"=NOW()
          WHERE id=${value.id}
        `;
      } else {
        await tx.$executeRaw`UPDATE brands SET name=COALESCE(${value.name ?? null},name),slug=COALESCE(${value.slug ?? null},slug),description=COALESCE(${value.description ?? null},description),"sortOrder"=COALESCE(${value.sortOrder ?? null},"sortOrder"),"isActive"=COALESCE(${value.isActive ?? null},"isActive"),"updatedAt"=NOW() WHERE id=${value.id}`;
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
