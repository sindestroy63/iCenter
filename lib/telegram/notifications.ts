import "server-only";

import { deliverNotification, notificationMode } from "@/lib/notification-transport";
import type { LeadNotification, OrderNotification } from "@/lib/telegram/formatters";
import { formatLeadNotification, formatOrderNotification } from "@/lib/telegram/formatters";
import { sendTelegramMessage, type TelegramSendResult } from "@/lib/telegram/client";

async function deliver(text: string): Promise<TelegramSendResult> {
  try {
    if (notificationMode() === "mock") {
      await deliverNotification({ type: "telegram", recipient: "work-chat", text, createdAt: new Date().toISOString() });
      return { status: "sent", messageId: 0 };
    }
    return await sendTelegramMessage(text);
  } catch {
    return { status: "failed", reason: "NOTIFICATION_UNAVAILABLE" };
  }
}

export function notifyOrderCreated(order: OrderNotification) {
  try { return deliver(formatOrderNotification(order)); }
  catch { return Promise.resolve({ status: "failed", reason: "NOTIFICATION_UNAVAILABLE" } as const); }
}

export function notifyLeadCreated(lead: LeadNotification) {
  try { return deliver(formatLeadNotification(lead)); }
  catch { return Promise.resolve({ status: "failed", reason: "NOTIFICATION_UNAVAILABLE" } as const); }
}
