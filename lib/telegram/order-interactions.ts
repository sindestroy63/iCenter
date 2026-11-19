import type { TelegramInlineKeyboardMarkup } from "@/lib/telegram/client";

export type TelegramOrderAction = "accept";
export type TelegramOrderStatus = "NEW" | "ACCEPTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

const CALLBACK_PREFIX = "ico";
const actionCodes: Record<TelegramOrderAction, string> = { accept: "a" };
const codeActions = new Map(Object.entries(actionCodes).map(([action, code]) => [code, action as TelegramOrderAction]));

export function telegramStatusFromOrderStatus(status: string): TelegramOrderStatus {
  if (status === "CONFIRMED") return "ACCEPTED";
  if (status === "PROCESSING" || status === "SHIPPING") return "IN_PROGRESS";
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "CANCELLED") return "CANCELLED";
  return "NEW";
}

export function orderStatusForAction(_action: TelegramOrderAction) {
  return "CONFIRMED";
}

export function buildOrderCallbackData(orderNumber: string, action: TelegramOrderAction) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(orderNumber)) throw new Error("INVALID_ORDER_NUMBER");
  const data = `${CALLBACK_PREFIX}:${actionCodes[action]}:${orderNumber}`;
  if (Buffer.byteLength(data, "utf8") > 64) throw new Error("CALLBACK_DATA_TOO_LONG");
  return data;
}

export function parseOrderCallbackData(data: unknown): { action: TelegramOrderAction; orderNumber: string } | null {
  if (typeof data !== "string" || Buffer.byteLength(data, "utf8") > 64) return null;
  const [prefix, code, orderNumber, extra] = data.split(":");
  const action = codeActions.get(code);
  if (prefix !== CALLBACK_PREFIX || !action || extra !== undefined || !/^[A-Za-z0-9_-]{1,40}$/.test(orderNumber ?? "")) return null;
  return { action, orderNumber };
}

export function isAllowedTelegramManager(memberStatus: string, userId: number, allowedUserIds = process.env.TELEGRAM_MANAGER_USER_IDS) {
  if (memberStatus === "creator" || memberStatus === "administrator") return true;
  const allowed = new Set((allowedUserIds ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  return (memberStatus === "member" || memberStatus === "restricted") && allowed.has(String(userId));
}

function adminOrderUrl(orderNumber: string, action: "call" | "open") {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(orderNumber)) throw new Error("INVALID_ORDER_NUMBER");
  const fallbackOrigin = "https://icenter-store.com";
  let origin = fallbackOrigin;
  try {
    const configured = new URL(process.env.NEXT_PUBLIC_SITE_URL || fallbackOrigin);
    if (configured.protocol === "https:") origin = configured.origin;
  } catch {}
  const encodedOrderNumber = encodeURIComponent(orderNumber);
  return action === "call"
    ? `${origin}/admin/requests/${encodedOrderNumber}/call`
    : `${origin}/admin/requests?request=${encodedOrderNumber}`;
}

export function buildOrderKeyboard(input: { orderNumber: string; status: TelegramOrderStatus }): TelegramInlineKeyboardMarkup {
  const accepted = input.status === "ACCEPTED" || input.status === "IN_PROGRESS" || input.status === "COMPLETED";
  return {
    inline_keyboard: [
      [
        { text: accepted ? "✓ Принято" : "Принять", callback_data: buildOrderCallbackData(input.orderNumber, "accept"), style: "success" },
        { text: "Позвонить", url: adminOrderUrl(input.orderNumber, "call"), style: "primary" },
      ],
      [{ text: "Открыть заявку", url: adminOrderUrl(input.orderNumber, "open") }],
    ],
  };
}

export function validateOrderTransition(input: {
  currentStatus: TelegramOrderStatus;
  action: TelegramOrderAction;
}) {
  if (input.action !== "accept") return { kind: "invalid" as const, reason: "INVALID_TRANSITION" };
  if (input.currentStatus === "NEW") return { kind: "change" as const, target: "ACCEPTED" as const };
  if (input.currentStatus === "ACCEPTED" || input.currentStatus === "IN_PROGRESS" || input.currentStatus === "COMPLETED") {
    return { kind: "unchanged" as const, target: input.currentStatus };
  }
  return { kind: "invalid" as const, reason: "INVALID_TRANSITION" };
}
