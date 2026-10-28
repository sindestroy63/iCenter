import { NextResponse } from "next/server";
import { z } from "zod";
import argon2 from "argon2";
import { requireGlobalAdminMutation, requireGlobalAdminSession } from "@/lib/auth";
import { adminDb, newId } from "@/lib/admin-db";

export const dynamic = "force-dynamic";

const roles = ["OWNER", "ADMIN", "DEVELOPER", "CITY_MANAGER"] as const;
const editorSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320),
  role: z.enum(roles),
  citySlugs: z.array(z.string().min(1)).max(20).default([]),
  temporaryPassword: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
});

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "EMPLOYEES_FAILED";
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (["42P01", "42703", "P2010"].includes(code)) return NextResponse.json({ error: "AUTH_SCHEMA_PATCH_REQUIRED" }, { status: 503 });
  const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" || message === "CSRF_INVALID" ? 403 : message === "NOT_FOUND" ? 404 : message === "LAST_ACTIVE_OWNER" || message === "EMAIL_EXISTS" ? 409 : 400;
  return NextResponse.json({ error: message }, { status });
}

async function validateCities(tx: any, role: typeof roles[number], citySlugs: string[]) {
  if (role !== "CITY_MANAGER" && citySlugs.length) throw new Error("GLOBAL_ROLE_CANNOT_HAVE_CITY_GRANTS");
  if (role === "CITY_MANAGER" && !citySlugs.length) throw new Error("CITY_REQUIRED");
  if (new Set(citySlugs).size !== citySlugs.length) throw new Error("DUPLICATE_CITY");
  const cities = citySlugs.length ? await tx.$queryRaw<any[]>`SELECT id,slug FROM cities WHERE slug=ANY(${citySlugs}::text[]) AND "isActive"=TRUE` : [];
  if (cities.length !== citySlugs.length) throw new Error("INVALID_CITY");
  return cities as Array<{ id: string; slug: string }>;
}

export async function GET() {
  try {
    await requireGlobalAdminSession();
    const rows = await adminDb().$queryRaw<any[]>`
      SELECT u.id,u.name,u.email,u.role::text AS role,u."isActive" AS "isActive",
        COALESCE(json_agg(json_build_object('id',c.id,'slug',c.slug,'name',c.name,'canManagePrices',g."canManagePrices",'canManageStock',g."canManageStock") ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL),'[]'::json) AS cities
      FROM users u LEFT JOIN user_city_access g ON g."userId"=u.id LEFT JOIN cities c ON c.id=g."cityId"
      GROUP BY u.id ORDER BY u.role,u.email
    `;
    const cities = await adminDb().$queryRaw<any[]>`SELECT id,name,slug FROM cities WHERE "isActive"=TRUE ORDER BY name`;
    return NextResponse.json({ data: rows, cities });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireGlobalAdminMutation(request);
    const parsed = editorSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_EMPLOYEE" }, { status: 400 });
    const value = parsed.data;
    if (value.role === "OWNER" && actor.role !== "OWNER") throw new Error("FORBIDDEN");
    const email = value.email.toLowerCase();
    const passwordHash = await argon2.hash(value.temporaryPassword, { type: argon2.argon2id });
    const id = newId();
    const db = adminDb();
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email},0))`;
      const exists = await tx.$queryRaw<any[]>`SELECT id FROM users WHERE lower(email)=${email} LIMIT 1`;
      if (exists.length) throw new Error("EMAIL_EXISTS");
      const cities = await validateCities(tx, value.role, value.citySlugs);
      await tx.$executeRaw`INSERT INTO users (id,email,"passwordHash",role,name,"isActive","mustChangePassword","createdAt","updatedAt") VALUES (${id},${email},${passwordHash},${value.role}::"UserRole",${value.name},TRUE,TRUE,NOW(),NOW())`;
      for (const city of cities) await tx.$executeRaw`INSERT INTO user_city_access (id,"userId","cityId","canManagePrices","canManageStock","createdAt") VALUES (${newId()},${id},${city.id},TRUE,TRUE,NOW())`;
    });
    return NextResponse.json({ data: { id, email, name: value.name, role: value.role, isActive: true, cities: value.citySlugs } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireGlobalAdminMutation(request);
    const body = z.object({ id: z.string().min(1), active: z.boolean().optional(), name: z.string().trim().min(1).max(160).optional(), email: z.string().trim().email().max(320).optional(), role: z.enum(roles).optional(), citySlugs: z.array(z.string().min(1)).max(20).optional() }).safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_EMPLOYEE" }, { status: 400 });
    const value = body.data;
    const db = adminDb();
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('icenter-owner-guard',0))`;
      const [target] = await tx.$queryRaw<any[]>`SELECT id,role::text AS role,"isActive" AS active FROM users WHERE id=${value.id} FOR UPDATE`;
      if (!target) throw new Error("NOT_FOUND");
      if (value.id === actor.userId && value.active === false) throw new Error("FORBIDDEN");
      if (actor.role !== "OWNER" && target.role === "OWNER") throw new Error("FORBIDDEN");
      const nextRole = value.role ?? target.role;
      if (actor.role !== "OWNER" && nextRole === "OWNER") throw new Error("FORBIDDEN");
      const nextActive = value.active ?? target.active;
      if (target.role === "OWNER" && target.active && (nextRole !== "OWNER" || !nextActive)) {
        const [count] = await tx.$queryRaw<any[]>`SELECT count(*)::int AS count FROM users WHERE role='OWNER'::"UserRole" AND "isActive"=TRUE`;
        if (Number(count.count) <= 1) throw new Error("LAST_ACTIVE_OWNER");
      }
      const cities = value.citySlugs === undefined && value.role === undefined ? null : await validateCities(tx, nextRole, value.citySlugs ?? []);
      const email = value.email?.toLowerCase();
      if (email) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email},0))`;
        const conflict = await tx.$queryRaw<any[]>`SELECT id FROM users WHERE lower(email)=${email} AND id<>${value.id} LIMIT 1`;
        if (conflict.length) throw new Error("EMAIL_EXISTS");
      }
      await tx.$executeRaw`UPDATE users SET name=COALESCE(${value.name ?? null},name),email=COALESCE(${email ?? null},email),role=${nextRole}::"UserRole","isActive"=${nextActive},"updatedAt"=NOW() WHERE id=${value.id}`;
      if (cities) {
        await tx.$executeRaw`DELETE FROM user_city_access WHERE "userId"=${value.id}`;
        for (const city of cities) await tx.$executeRaw`INSERT INTO user_city_access (id,"userId","cityId","canManagePrices","canManageStock","createdAt") VALUES (${newId()},${value.id},${city.id},TRUE,TRUE,NOW())`;
      }
      await tx.$executeRaw`UPDATE sessions SET "revokedAt"=NOW() WHERE "userId"=${value.id} AND "revokedAt" IS NULL`;
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
