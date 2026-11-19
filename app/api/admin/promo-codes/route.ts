import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGlobalAdminMutation, requireGlobalAdminSession } from "@/lib/auth";
import { adminDb, newId } from "@/lib/admin-db";
import { auditDiff, writeAuditLog } from "@/lib/admin-audit";
import { normalizePromoCode } from "@/lib/promo-codes";

export const dynamic = "force-dynamic";
const schema = z.object({ id: z.string().min(1).optional(), code: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/), discountAmount: z.number().int().positive().max(100000000), usageLimit: z.number().int().positive().nullable(), startsAt: z.string().nullable(), endsAt: z.string().nullable(), isActive: z.boolean(), description: z.string().trim().max(1000).nullable() }).refine((value) => !value.startsAt || !value.endsAt || value.endsAt >= value.startsAt, { path: ["endsAt"] });

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "PROMO_ADMIN_FAILED";
  const pgCode = error && typeof error === "object" && "meta" in error ? String((error as { meta?: { code?: string } }).meta?.code ?? "") : "";
  const status = message === "UNAUTHORIZED" ? 401 : ["FORBIDDEN", "CSRF_INVALID"].includes(message) ? 403 : message === "NOT_FOUND" ? 404 : ["PROMO_IN_USE", "PROMO_CODE_EXISTS"].includes(message) || pgCode === "23505" ? 409 : 400;
  return NextResponse.json({ error: status >= 500 ? "PROMO_ADMIN_FAILED" : pgCode === "23505" ? "PROMO_CODE_EXISTS" : message }, { status });
}

export async function GET() {
  try {
    await requireGlobalAdminSession();
    const rows = await adminDb().$queryRaw<any[]>`SELECT p.id,p.code,p."discountAmount"::text AS "discountAmount",p."usageLimit",p."usageCount",p."startsAt",p."endsAt",p."isActive",p.description,p."createdAt",p."updatedAt",COUNT(o.id)::int AS "orderCount" FROM promo_codes p LEFT JOIN orders o ON o."promoCodeId"=p.id GROUP BY p.id ORDER BY p."createdAt" DESC`;
    return NextResponse.json({ data: rows.map((row) => ({ ...row, discountAmount: Number(row.discountAmount) })) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) { return save(request, false); }
export async function PATCH(request: Request) { return save(request, true); }

async function save(request: Request, update: boolean) {
  try {
    const actor = await requireGlobalAdminMutation(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success || (update && !parsed.data.id) || (!update && parsed.data.id)) return NextResponse.json({ error: "INVALID_PROMO_CODE" }, { status: 400 });
    const value = parsed.data;
    const code = normalizePromoCode(value.code);
    const db = adminDb();
    await db.$transaction(async (tx) => {
      const id = value.id ?? newId();
      const before = update ? (await tx.$queryRaw<any[]>`SELECT id,code,"discountAmount"::text AS "discountAmount","usageLimit","startsAt","endsAt","isActive",description FROM promo_codes WHERE id=${id} FOR UPDATE`)[0] : null;
      if (update && !before) throw new Error("NOT_FOUND");
      const duplicate = await tx.$queryRaw<any[]>`SELECT 1 FROM promo_codes WHERE upper(code)=${code} AND id<>${id} LIMIT 1`;
      if (duplicate.length) throw new Error("PROMO_CODE_EXISTS");
      if (update) {
        await tx.$executeRaw`UPDATE promo_codes SET code=${code},"discountAmount"=${value.discountAmount},"usageLimit"=${value.usageLimit},"startsAt"=${value.startsAt ? new Date(value.startsAt) : null},"endsAt"=${value.endsAt ? new Date(value.endsAt) : null},"isActive"=${value.isActive},description=${value.description},"updatedAt"=NOW() WHERE id=${id}`;
      } else {
        await tx.$executeRaw`INSERT INTO promo_codes (id,code,"discountAmount","usageLimit","startsAt","endsAt","isActive",description,"createdAt","updatedAt") VALUES (${id},${code},${value.discountAmount},${value.usageLimit},${value.startsAt ? new Date(value.startsAt) : null},${value.endsAt ? new Date(value.endsAt) : null},${value.isActive},${value.description},NOW(),NOW())`;
      }
      const after = (await tx.$queryRaw<any[]>`SELECT id,code,"discountAmount"::text AS "discountAmount","usageLimit","startsAt","endsAt","isActive",description FROM promo_codes WHERE id=${id}`)[0];
      const changes = auditDiff(before, after);
      await writeAuditLog(tx, actor, { action: update ? "promo_code.updated" : "promo_code.created", entityType: "promo_code", entityId: id, changes: changes ?? { old: null, new: after } });
    });
    return NextResponse.json({ ok: true }, { status: update ? 200 : 201 });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireGlobalAdminMutation(request);
    const body = z.object({ id: z.string().min(1) }).safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_PROMO_CODE" }, { status: 400 });
    await adminDb().$transaction(async (tx) => {
      const row = (await tx.$queryRaw<any[]>`SELECT id,code,"usageCount" FROM promo_codes WHERE id=${body.data.id} FOR UPDATE`)[0];
      if (!row) throw new Error("NOT_FOUND");
      const used = await tx.$queryRaw<any[]>`SELECT 1 FROM orders WHERE "promoCodeId"=${row.id} LIMIT 1`;
      if (Number(row.usageCount) !== 0 || used.length) throw new Error("PROMO_IN_USE");
      await tx.$executeRaw`DELETE FROM promo_codes WHERE id=${row.id}`;
      await writeAuditLog(tx, actor, { action: "promo_code.deleted", entityType: "promo_code", entityId: row.id, changes: { deleted: { old: { code: row.code }, new: null } } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
