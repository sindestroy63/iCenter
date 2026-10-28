import "server-only";

import { PrismaClient } from "@prisma/client";
import { decryptPii } from "@/lib/request-pii";

type TelegramResponse = { ok: boolean; result?: { message_id?: number }; description?: string };
type TelegramTransport = (token: string, chatId: string, text: string) => Promise<TelegramResponse>;
const TELEGRAM_TIMEOUT_MS = 10_000;

declare global { var telegramPrisma: PrismaClient | undefined; }

const defaultTransport: TelegramTransport = async (token, chatId, text) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      cache: "no-store",
      signal: controller.signal,
    });
    return await response.json() as TelegramResponse;
  } finally {
    clearTimeout(timeout);
  }
};

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  globalThis.telegramPrisma ??= new PrismaClient({ log: [] });
  return globalThis.telegramPrisma;
}

function money(value: number) { return `${value.toLocaleString("ru-RU")} ₽`; }

export type TelegramSendResult = "sent" | "already-sent" | "not-configured" | "failed";

export async function notifyRequest(orderNumber: string, transport: TelegramTransport = defaultTransport): Promise<TelegramSendResult> {
  const isTestTransport = transport !== defaultTransport;
  const token = process.env.TELEGRAM_BOT_TOKEN ?? (isTestTransport ? "test-token" : undefined);
  const chatId = process.env.TELEGRAM_REQUESTS_CHAT_ID ?? (isTestTransport ? "test-chat" : undefined);
  if (!token || !chatId) return "not-configured";
  const client = db();
  const rows = await client.$queryRaw<any[]>`
    SELECT a.id,a."telegramMessageId",o.city,o."totalAmount",o."encryptedPiiPayload",o."contactMethod",o."deliveryType",
      oi."productNameSnapshot",oi."skuSnapshot",oi."variantSnapshot",oi.quantity,oi.price
    FROM order_attempts a JOIN orders o ON o.id=a."orderId"
    LEFT JOIN order_items oi ON oi."orderId"=o.id
    WHERE a."orderNumber"=${orderNumber}
    ORDER BY oi.id
  `;
  if (!rows.length) return "failed";
  if (rows[0].telegramMessageId) return "already-sent";
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
  const lines = rows.map((row) => `- ${row.productNameSnapshot ?? row.skuSnapshot} × ${row.quantity} — ${money(Number(row.price))}`).join("\n");
  const text = [
    `Новая заявка ${orderNumber}`,
    `Город: ${rows[0].city}`,
    `Товары:\n${lines}`,
    `Итого: ${money(Number(rows[0].totalAmount))}`,
    `Клиент: ${pii.name}`,
    `Телефон: ${pii.phone}`,
    `Способ связи: ${rows[0].contactMethod}`,
    `Получение: ${rows[0].deliveryType}`,
    pii.address ? `Адрес: ${pii.address}` : "",
    pii.comment ? `Комментарий: ${pii.comment}` : "",
  ].filter(Boolean).join("\n");
  try {
    const result = await transport(token, chatId, text);
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
