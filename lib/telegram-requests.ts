import "server-only";

import { PrismaClient } from "@prisma/client";
import { decryptPii } from "@/lib/request-pii";
import { deliverNotification, notificationMode, assertNotificationTestIsolation } from "@/lib/notification-transport";
import { sendTelegramMessage, type TelegramInlineKeyboardMarkup } from "@/lib/telegram/client";
import { formatOrderNotification } from "@/lib/telegram/formatters";
import { buildOrderKeyboard, telegramStatusFromOrderStatus } from "@/lib/telegram/order-interactions";
import { resolveOrderTelegramRoute } from "@/lib/telegram/order-routing";

type TelegramResponse = { ok: boolean; result?: { message_id?: number }; description?: string };
type TelegramTransport = (token: string, chatId: string, text: string, replyMarkup?: TelegramInlineKeyboardMarkup) => Promise<TelegramResponse>;
const TELEGRAM_TIMEOUT_MS = 5_000;

declare global { var telegramPrisma: PrismaClient | undefined; }

const defaultTransport: TelegramTransport = async (token, chatId, text, replyMarkup) => {
  if (notificationMode() === "mock") {
    assertNotificationTestIsolation();
    await deliverNotification({ type: "telegram", recipient: "test-chat", text, createdAt: new Date().toISOString() });
    return { ok: true, result: { message_id: Date.now() } };
  }
  const result = await sendTelegramMessage(text, { token, chatId, timeoutMs: TELEGRAM_TIMEOUT_MS, replyMarkup });
  return result.status === "sent" ? { ok: true, result: { message_id: result.messageId } } : { ok: false, description: result.reason };
};

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  globalThis.telegramPrisma ??= new PrismaClient({ log: [] });
  return globalThis.telegramPrisma;
}

export type TelegramSendResult = "sent" | "already-sent" | "not-configured" | "failed";

export async function notifyRequest(orderNumber: string, transport: TelegramTransport = defaultTransport): Promise<TelegramSendResult> {
  const isTestTransport = transport !== defaultTransport;
  if (notificationMode() === "mock") assertNotificationTestIsolation();
  const token = process.env.TELEGRAM_BOT_TOKEN ?? (isTestTransport || notificationMode() === "mock" ? "test-token" : undefined);
  if (!token) return "not-configured";
  const client = db();
  const rows = await client.$queryRaw<any[]>`
    SELECT a.id,a."telegramMessageId",o."cityId",o.city,o.status::text AS "orderStatus",o."totalAmount",o."discountAmount",o."promoCode",o."encryptedPiiPayload",o."contactMethod",o."deliveryType",
      oi."productNameSnapshot",oi."skuSnapshot",oi."variantSnapshot",oi.quantity,oi.price
    FROM order_attempts a JOIN orders o ON o.id=a."orderId"
    LEFT JOIN order_items oi ON oi."orderId"=o.id
    WHERE a."orderNumber"=${orderNumber}
    ORDER BY oi.id
  `;
  if (!rows.length) return "failed";
  if (rows[0].telegramMessageId) return "already-sent";
  const testDelivery = isTestTransport || notificationMode() === "mock";
  const route = testDelivery
    ? { token, chatId: process.env.TELEGRAM_WORK_CHAT_ID ?? "test-chat" }
    : resolveOrderTelegramRoute(rows[0].cityId, token);
  if (!route) return "not-configured";
  // Claim the delivery before calling Telegram. This closes the replay race;
  // a stale PROCESSING claim is reclaimable after ten minutes.
  const claimed = await client.$queryRaw<Array<{ id: string }>>`
    UPDATE order_attempts
    SET status='PROCESSING'::"OrderAttemptStatus", "processingStartedAt"=NOW(),
        "errorCode"=NULL, "errorMessage"=NULL
    WHERE id=${rows[0].id} AND "telegramMessageId" IS NULL
      AND (status IN ('PENDING'::"OrderAttemptStatus", 'FAILED'::"OrderAttemptStatus")
        OR (status='PROCESSING'::"OrderAttemptStatus" AND "processingStartedAt" < NOW() - INTERVAL '10 minutes'))
    RETURNING id
  `;
  if (!claimed.length) {
    const state = await client.$queryRaw<Array<{ telegramMessageId: string | null; status: string }>>`
      SELECT "telegramMessageId", status::text AS status FROM order_attempts WHERE id=${rows[0].id}
    `;
    return state[0]?.telegramMessageId ? "already-sent" : "failed";
  }
  const pii = decryptPii<{ name: string; phone: string; address: string; comment: string }>(rows[0].encryptedPiiPayload);
  const text = formatOrderNotification({
    requestNumber: orderNumber,
    city: rows[0].city,
    name: pii.name,
    phone: pii.phone,
    contactMethod: rows[0].contactMethod,
    fulfillment: rows[0].deliveryType,
    address: pii.address,
    comment: pii.comment,
    promoCode: rows[0].promoCode,
    discount: Number(rows[0].discountAmount ?? 0),
    subtotal: Number(rows[0].totalAmount) + Number(rows[0].discountAmount ?? 0),
    total: Number(rows[0].totalAmount),
    items: rows.map((row) => ({ productName: row.productNameSnapshot ?? row.skuSnapshot, variant: row.variantSnapshot, sku: row.skuSnapshot, quantity: row.quantity, unitPrice: Number(row.price) })),
  });
  const keyboard = buildOrderKeyboard({ orderNumber, status: telegramStatusFromOrderStatus(rows[0].orderStatus) });
  try {
    const result = await transport(token, route.chatId, text, keyboard);
    if (!result.ok || result.result?.message_id == null) throw new Error(result.description ?? "Telegram rejected message");
    await client.$executeRaw`UPDATE order_attempts SET "telegramMessageId"=${String(result.result.message_id)}, "sentAt"=NOW(), status='SENT'::"OrderAttemptStatus", "errorCode"=NULL, "errorMessage"=NULL WHERE id=${rows[0].id} AND "telegramMessageId" IS NULL`;
    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Telegram request failed";
    await client.$executeRaw`UPDATE order_attempts SET status='FAILED'::"OrderAttemptStatus", "errorCode"='TELEGRAM_UNAVAILABLE', "errorMessage"=${message}, "processingStartedAt"=NULL WHERE id=${rows[0].id} AND "telegramMessageId" IS NULL`;
    return "failed";
  }
}

export function telegramTransportForTest(handler: TelegramTransport) { return handler; }
