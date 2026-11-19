import "server-only";

import { deliverNotification, notificationMode } from "@/lib/notification-transport";
import type { LeadNotification, OrderNotification } from "@/lib/telegram/formatters";
import { formatLeadNotification, formatOrderNotification } from "@/lib/telegram/formatters";
import { sendTelegramMessage, type TelegramInlineKeyboardMarkup, type TelegramSendResult } from "@/lib/telegram/client";

async function deliver(text: string, replyMarkup?: TelegramInlineKeyboardMarkup): Promise<TelegramSendResult> {
  try {
    if (notificationMode() === "mock") {
      await deliverNotification({ type: "telegram", recipient: "work-chat", text, createdAt: new Date().toISOString() });
      return { status: "sent", messageId: 0 };
    }
    return await sendTelegramMessage(text, { replyMarkup });
  } catch {
    return { status: "failed", reason: "NOTIFICATION_UNAVAILABLE" };
  }
}

export function notifyOrderCreated(order: OrderNotification) {
  try { return deliver(formatOrderNotification(order)); }
  catch { return Promise.resolve({ status: "failed", reason: "NOTIFICATION_UNAVAILABLE" } as const); }
}

export function notifyLeadCreated(lead: LeadNotification) {
  try {
    const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://icenter-store.com").replace(/\/$/, "");
    const replyMarkup = lead.requestId ? { inline_keyboard: [[{ text: "Открыть заявку", url: `${site}/admin/requests?request=${encodeURIComponent(lead.requestId)}`, style: "primary" as const }]] } : undefined;
    return deliver(formatLeadNotification(lead), replyMarkup);
  }
  catch { return Promise.resolve({ status: "failed", reason: "NOTIFICATION_UNAVAILABLE" } as const); }
}
