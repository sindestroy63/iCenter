import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession, requireGlobalAdminMutation } from "@/lib/auth";
import { adminDb, newId } from "@/lib/admin-db";

export const dynamic = "force-dynamic";

const globalSchema = z.object({
  defaultCity: z.string().trim().max(100),
}).strict();
const citySchema = z.object({
  cityId: z.string().trim().min(1).max(100),
  address: z.string().trim().max(500).nullable(),
  phone: z.string().trim().max(80).nullable().refine((value) => value === null || value === "" || /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(value)),
  workingHours: z.string().trim().max(300).nullable(),
  timezone: z.string().trim().min(1).max(100),
  socialLinks: z.union([z.record(z.string().trim().min(1).max(60), z.union([
    z.string().trim().max(500),
    z.object({ label: z.string().trim().max(60).optional(), url: z.string().trim().max(500).optional(), href: z.string().trim().max(500).optional() }).strict(),
  ])).refine((links) => Object.keys(links).length <= 20), z.array(z.unknown()).max(20)]),
}).strict();

function responseError(error: unknown, operation: "LOAD" | "SAVE") {
  const message = error instanceof Error ? error.message : "SETTINGS_FAILED";
  const status = message === "UNAUTHORIZED" ? 401 : ["FORBIDDEN", "CSRF_INVALID"].includes(message) ? 403 : message === "NOT_FOUND" ? 404 : message === "DUPLICATE_SETTING" ? 409 : message === "INVALID_SETTINGS" ? 400 : message === "PASSWORD_CHANGE_REQUIRED" ? 503 : 500;
  const known = new Set(["UNAUTHORIZED", "FORBIDDEN", "CSRF_INVALID", "NOT_FOUND", "DUPLICATE_SETTING", "INVALID_SETTINGS", "PASSWORD_CHANGE_REQUIRED"]);
  if (!known.has(message)) {
    const detail = error instanceof Error ? error as Error & { code?: string } : null;
    console.error(`[admin/settings] ${operation} failed`, { name: detail?.name ?? "UnknownError", code: detail?.code ?? null, message: message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[redacted]") });
  }
  return NextResponse.json({ error: known.has(message) ? message : `SETTINGS_${operation}_FAILED` }, { status });
}

export async function GET() {
  try {
    const session = await requireAdminSession();
    const db = adminDb();
    if (session.role === "CITY_MANAGER") {
      const cities = await db.$queryRaw<any[]>`
        SELECT c.id AS "cityId",c.name,c.address,c.phone,c."workingHours",c.timezone,c."socialLinks"
        FROM user_city_access a JOIN cities c ON c.id=a."cityId"
        WHERE a."userId"=${session.userId} AND c."isActive"=TRUE ORDER BY c.name LIMIT 2
      `;
      return NextResponse.json({ scope: "city-readonly", city: cities.length === 1 ? cities[0] : null });
    }
    const [settings, cities] = await Promise.all([
      db.$queryRaw<Array<{ key: string; value: unknown }>>`SELECT key,value FROM settings WHERE key='store.defaultCity'`,
      db.$queryRaw<any[]>`SELECT id AS "cityId",name,slug,address,phone,"workingHours",timezone,"socialLinks" FROM cities ORDER BY "sortOrder",name`,
    ]);
    const values = Object.fromEntries(settings.map((item) => [item.key, item.value]));
    return NextResponse.json({
      scope: "global",
      global: { defaultCity: typeof values["store.defaultCity"] === "string" ? values["store.defaultCity"] : cities.find((city) => city.slug === "samara")?.slug ?? "" },
      cities,
    });
  } catch (error) { return responseError(error, "LOAD"); }
}

export async function PUT(request: Request) {
  try {
    await requireGlobalAdminMutation(request);
    const parsed = globalSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_SETTINGS" }, { status: 400 });
    const value = parsed.data;
    const db = adminDb();
    if (value.defaultCity) {
      const city = await db.$queryRaw<any[]>`SELECT id FROM cities WHERE slug=${value.defaultCity} AND "isActive"=TRUE LIMIT 1`;
      if (!city.length) return NextResponse.json({ error: "INVALID_SETTINGS" }, { status: 400 });
    }
    await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ locked: number }>>`WITH advisory_guard AS (SELECT pg_advisory_xact_lock(71823041)) SELECT 1::int AS locked FROM advisory_guard`;
      const values = [["store.defaultCity", value.defaultCity, "Default city slug"]] as const;
      for (const [key, item, description] of values) {
        const existing = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM settings WHERE key=${key} ORDER BY id LIMIT 1 FOR UPDATE`;
        if (existing.length) {
          const duplicate = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM settings WHERE key=${key} AND id<>${existing[0].id} LIMIT 1`;
          if (duplicate.length) throw new Error("DUPLICATE_SETTING");
          await tx.$executeRaw`UPDATE settings SET value=${JSON.stringify(item)}::jsonb,description=${description},"updatedAt"=NOW() WHERE id=${existing[0].id}`;
        } else {
          const id = newId();
          await tx.$executeRaw`INSERT INTO settings (id,key,value,description,"updatedAt") VALUES (${id},${key},${JSON.stringify(item)}::jsonb,${description},NOW())`;
        }
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return responseError(error, "SAVE"); }
}

export async function PATCH(request: Request) {
  try {
    await requireGlobalAdminMutation(request);
    const parsed = citySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_SETTINGS" }, { status: 400 });
    const value = parsed.data;
    const db = adminDb();
    const result = await db.$executeRaw`
      UPDATE cities SET address=${value.address},phone=${value.phone},"workingHours"=${value.workingHours},timezone=${value.timezone},"socialLinks"=${JSON.stringify(value.socialLinks)}::jsonb,"updatedAt"=NOW()
      WHERE id=${value.cityId}
    `;
    if (!result) throw new Error("NOT_FOUND");
    return NextResponse.json({ ok: true });
  } catch (error) { return responseError(error, "SAVE"); }
}
