import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/admin-db";
import { writeAuditLog } from "@/lib/admin-audit";
import { requireGlobalAdminMutation } from "@/lib/auth";
import { PRODUCT_ORDER_LOCK_KEY, validateProductOrder } from "@/lib/product-manual-order";

export const dynamic = "force-dynamic";

const orderSchema = z.object({
  expectedIds: z.array(z.string().min(1).max(160)).max(10000),
  orderedIds: z.array(z.string().min(1).max(160)).max(10000),
});

export async function PATCH(request: Request) {
  try {
    const session = await requireGlobalAdminMutation(request);
    const parsed = orderSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json({ error: "Некорректный список товаров." }, { status: 400 });

    await adminDb().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${PRODUCT_ORDER_LOCK_KEY})::text AS locked`;
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM products
        WHERE NOT (specifications @> '{"tradeIn":true}'::jsonb)
        ORDER BY "manualOrder",name,id FOR UPDATE
      `;
      const currentIds = rows.map((row) => row.id);
      const validation = validateProductOrder(currentIds, parsed.data.expectedIds, parsed.data.orderedIds);
      if (!validation.ok) throw new Error(validation.reason);

      const positions = parsed.data.orderedIds.map((id, index) => Prisma.sql`(${id},${index})`);
      if (positions.length) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE products AS product
          SET "manualOrder"=ordered.position::integer
          FROM (VALUES ${Prisma.join(positions)}) AS ordered(id,position)
          WHERE product.id=ordered.id
        `);
      }
      await writeAuditLog(tx, session, {
        action: "product.order_updated",
        entityType: "product_order",
        entityId: "global",
        changes: {
          order: {
            old: { count: currentIds.length, firstId: currentIds[0] ?? null, lastId: currentIds.at(-1) ?? null },
            new: { count: parsed.data.orderedIds.length, firstId: parsed.data.orderedIds[0] ?? null, lastId: parsed.data.orderedIds.at(-1) ?? null },
          },
          movedCount: parsed.data.orderedIds.filter((id, index) => currentIds[index] !== id).length,
        },
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10000,
      timeout: 30000,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
    const metaCode = typeof error === "object" && error !== null && "meta" in error && typeof (error as { meta?: unknown }).meta === "object" && (error as { meta?: { code?: unknown } }).meta !== null
      ? String((error as { meta?: { code?: unknown } }).meta?.code ?? "")
      : "";
    if (message === "CONFLICT" || ["40001", "40P01", "P2034"].includes(code) || ["40001", "40P01"].includes(metaCode)) {
      try {
        const rows = await adminDb().$queryRaw<Array<{ id: string }>>`
          SELECT id FROM products
          WHERE NOT (specifications @> '{"tradeIn":true}'::jsonb)
          ORDER BY "manualOrder",name,id
        `;
        return NextResponse.json({
          code: "ORDER_CONFLICT",
          error: "Порядок изменился параллельно. Список обновлён; проверьте его и повторите изменение.",
          currentIds: rows.map((row) => row.id),
        }, { status: 409 });
      } catch {
        return NextResponse.json({ code: "ORDER_CONFLICT", error: "Порядок товаров уже изменён другим пользователем. Обновите список и повторите." }, { status: 409 });
      }
    }
    if (message === "INVALID_ORDER")
      return NextResponse.json({ code: "INVALID_ORDER", error: "Список товаров неполный или содержит неизвестные ID." }, { status: 400 });
    if (message === "UNAUTHORIZED")
      return NextResponse.json({ code: "AUTH_REQUIRED", error: "Требуется вход." }, { status: 401 });
    if (["FORBIDDEN", "CSRF_INVALID"].includes(message))
      return NextResponse.json({ code: "ACCESS_DENIED", error: "Недостаточно прав для изменения порядка товаров." }, { status: 403 });
    console.error("product order update failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      code: code || undefined,
      databaseCode: metaCode && metaCode !== "N/A" ? metaCode : undefined,
    });
    return NextResponse.json({ code: "ORDER_SAVE_FAILED", error: "Сервер не смог сохранить порядок. Порядок товаров не изменён." }, { status: 500 });
  }
}
