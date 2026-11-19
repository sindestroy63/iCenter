import "server-only";

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { decryptPii } from "@/lib/request-pii";
import { answerTelegramCallback, editTelegramMessage, getTelegramChatMember } from "@/lib/telegram/client";
import { handleTelegramOrderCallback, type TelegramOrderCallbackStore, type TelegramOrderRecord, type TelegramTransitionResult } from "@/lib/telegram/order-callback-core";
import { telegramStatusFromOrderStatus, orderStatusForAction, validateOrderTransition, type TelegramOrderAction } from "@/lib/telegram/order-interactions";
import { resolveOrderTelegramRoute } from "@/lib/telegram/order-routing";

declare global { var telegramCallbackPrisma: PrismaClient | undefined; }

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  globalThis.telegramCallbackPrisma ??= new PrismaClient({ log: [] });
  return globalThis.telegramCallbackPrisma;
}

type OrderRow = {
  orderId: string;
  orderNumber: string;
  cityId: string;
  city: string;
  orderStatus: string;
  telegramMessageId: string | null;
  totalAmount: string;
  promoCode: string | null;
  discountAmount: string;
  encryptedPiiPayload: string;
  contactMethod: string;
  deliveryType: string;
  productNameSnapshot: string | null;
  skuSnapshot: string;
  variantSnapshot: unknown;
  quantity: number;
  price: string;
  imagePath: string | null;
};

async function loadOrder(orderNumber: string): Promise<TelegramOrderRecord | null> {
  const client = db();
  const rows = await client.$queryRaw<OrderRow[]>`
    SELECT o.id AS "orderId",a."orderNumber",o."cityId",o.city,o.status::text AS "orderStatus",a."telegramMessageId",
      o."totalAmount",o."promoCode",o."discountAmount",o."encryptedPiiPayload",o."contactMethod",o."deliveryType",
      oi."productNameSnapshot",oi."skuSnapshot",oi."variantSnapshot",oi.quantity,oi.price,image."storagePath" AS "imagePath"
    FROM order_attempts a JOIN orders o ON o.id=a."orderId"
    LEFT JOIN order_items oi ON oi."orderId"=o.id
    LEFT JOIN product_variants ov ON ov.id=oi."variantId"
    LEFT JOIN LATERAL (
      SELECT source."storagePath" FROM (
        SELECT m."storagePath",0 AS priority,cgi."sortOrder"
        FROM color_galleries cg JOIN color_gallery_images cgi ON cgi."colorGalleryId"=cg.id JOIN media m ON m.id=cgi."mediaId"
        WHERE cg."productId"=ov."productId" AND cg."colorId"=ov."colorId" AND m."mimeType" LIKE 'image/%'
        UNION ALL
        SELECT m."storagePath",1 AS priority,pgi."sortOrder"
        FROM product_gallery_images pgi JOIN media m ON m.id=pgi."mediaId"
        WHERE pgi."productId"=ov."productId" AND m."mimeType" LIKE 'image/%'
      ) source ORDER BY source.priority,source."sortOrder" LIMIT 1
    ) image ON TRUE
    WHERE a."orderNumber"=${orderNumber}
    ORDER BY oi.id
  `;
  const first = rows[0];
  if (!first?.telegramMessageId || !/^\d+$/.test(first.telegramMessageId)) return null;
  const route = resolveOrderTelegramRoute(first.cityId, process.env.TELEGRAM_BOT_TOKEN);
  if (!route) return null;
  const pii = decryptPii<{ name: string; phone: string; address: string; comment: string }>(first.encryptedPiiPayload);
  return {
    orderId: first.orderId,
    orderNumber: first.orderNumber,
    cityId: first.cityId,
    chatId: route.chatId,
    messageId: Number(first.telegramMessageId),
    notification: {
      requestNumber: first.orderNumber,
      city: first.city,
      status: telegramStatusFromOrderStatus(first.orderStatus),
      name: pii.name,
      phone: pii.phone,
      contactMethod: first.contactMethod,
      fulfillment: first.deliveryType,
      address: pii.address,
      comment: pii.comment,
      total: Number(first.totalAmount),
      promoCode: first.promoCode,
      discount: Number(first.discountAmount ?? 0),
      subtotal: Number(first.totalAmount) + Number(first.discountAmount ?? 0),
      items: rows.map((row) => ({
        productName: row.productNameSnapshot ?? row.skuSnapshot,
        variant: row.variantSnapshot,
        sku: row.skuSnapshot,
        quantity: row.quantity,
        unitPrice: Number(row.price),
        imageUrl: row.imagePath,
      })),
    },
  };
}

async function transitionOrder(input: {
  orderNumber: string;
  action: TelegramOrderAction;
  actorId: string;
  expectedCityId: string;
  expectedMessageId: number;
}): Promise<TelegramTransitionResult> {
  const client = db();
  const result = await client.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ orderId: string; cityId: string; status: string; telegramMessageId: string | null }>>`
      SELECT o.id AS "orderId",o."cityId",o.status::text AS status,a."telegramMessageId"
      FROM orders o JOIN order_attempts a ON a."orderId"=o.id
      WHERE a."orderNumber"=${input.orderNumber}
      LIMIT 1 FOR UPDATE OF o
    `;
    const row = rows[0];
    if (!row || row.cityId !== input.expectedCityId || row.telegramMessageId !== String(input.expectedMessageId)) return { kind: "not-found" as const, reason: "ORDER_CONTEXT_MISMATCH" };
    const currentStatus = telegramStatusFromOrderStatus(row.status);
    const decision = validateOrderTransition({ currentStatus, action: input.action });
    if (decision.kind === "invalid") return decision;
    if (decision.kind === "unchanged") return { kind: "unchanged" as const };

    const nextOrderStatus = orderStatusForAction(input.action);
    await tx.$executeRaw`UPDATE orders SET status=${nextOrderStatus}::"OrderStatus","updatedAt"=NOW() WHERE id=${row.orderId}`;
    const metadata = {
      source: "telegram",
      orderNumber: input.orderNumber,
      cityId: row.cityId,
      telegramUserId: input.actorId,
      telegramMessageId: input.expectedMessageId,
      telegramStatus: decision.target,
    };
    await tx.$executeRaw`
      INSERT INTO audit_logs (id,"userId",action,"entityType","entityId",changes,metadata,"sessionId","createdAt")
      VALUES (${randomUUID()},NULL,'order.telegram_status_updated','order',${row.orderId},${JSON.stringify({ status: { old: row.status, new: nextOrderStatus } })}::jsonb,${JSON.stringify(metadata)}::jsonb,NULL,NOW())
    `;
    return { kind: "changed" as const };
  }, { maxWait: 5000, timeout: 15000 });
  if (result.kind === "invalid" || result.kind === "not-found") return result;
  const order = await loadOrder(input.orderNumber);
  return order ? { kind: result.kind, order } : { kind: "not-found", reason: "ORDER_NOT_FOUND_AFTER_TRANSITION" };
}

const store: TelegramOrderCallbackStore = { load: loadOrder, transition: transitionOrder };

export async function processTelegramOrderUpdate(update: unknown, fetcher: typeof fetch = fetch) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return "ignored" as const;
  return handleTelegramOrderCallback(update as Parameters<typeof handleTelegramOrderCallback>[0], {
    store,
    allowedUserIds: process.env.TELEGRAM_MANAGER_USER_IDS,
    telegram: {
      async getChatMember(chatId, userId) {
        const result = await getTelegramChatMember(chatId, userId, { token, fetcher });
        return result.status === "found" ? { ok: true, status: result.memberStatus } : { ok: false };
      },
      async editMessage(order, text, keyboard) {
        const result = await editTelegramMessage(order.chatId, order.messageId, text, keyboard, { token, fetcher });
        return result.status === "edited";
      },
      async answer(callbackId, text, alert) {
        const result = await answerTelegramCallback(callbackId, text, alert, { token, fetcher });
        return result.status === "answered";
      },
    },
  });
}
