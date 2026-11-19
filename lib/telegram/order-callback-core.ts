// @ts-expect-error Node's strip-types test runner requires an explicit TypeScript extension.
import { formatOrderNotification, type OrderNotification } from "./formatters.ts";
// @ts-expect-error Node's strip-types test runner requires an explicit TypeScript extension.
import { buildOrderKeyboard, isAllowedTelegramManager, parseOrderCallbackData, type TelegramOrderAction } from "./order-interactions.ts";

export type TelegramOrderRecord = {
  orderId: string;
  orderNumber: string;
  cityId: string;
  chatId: string;
  messageId: number;
  notification: OrderNotification;
};

export type TelegramTransitionResult =
  | { kind: "changed" | "unchanged"; order: TelegramOrderRecord }
  | { kind: "invalid" | "not-found"; reason: string };

export type TelegramOrderCallbackStore = {
  load(orderNumber: string): Promise<TelegramOrderRecord | null>;
  transition(input: {
    orderNumber: string;
    action: TelegramOrderAction;
    actorId: string;
    expectedCityId: string;
    expectedMessageId: number;
  }): Promise<TelegramTransitionResult>;
};

export type TelegramOrderCallbackApi = {
  getChatMember(chatId: string, userId: number): Promise<{ ok: true; status: string } | { ok: false }>;
  editMessage(order: TelegramOrderRecord, text: string, keyboard: ReturnType<typeof buildOrderKeyboard>): Promise<boolean>;
  answer(callbackId: string, text: string, alert?: boolean): Promise<boolean>;
};

type CallbackUpdate = {
  callback_query?: {
    id?: unknown;
    data?: unknown;
    from?: { id?: unknown; is_bot?: unknown; first_name?: unknown; last_name?: unknown; username?: unknown };
    message?: { message_id?: unknown; chat?: { id?: unknown; type?: unknown } };
  };
};

export type TelegramCallbackOutcome = "updated" | "unchanged" | "rejected" | "sync-failed" | "telegram-unavailable" | "ignored";

export async function handleTelegramOrderCallback(
  update: CallbackUpdate,
  dependencies: { store: TelegramOrderCallbackStore; telegram: TelegramOrderCallbackApi; allowedUserIds?: string },
): Promise<TelegramCallbackOutcome> {
  const callback = update.callback_query;
  if (!callback || typeof callback.id !== "string") return "ignored";
  const parsed = parseOrderCallbackData(callback.data);
  const userId = callback.from?.id;
  const chatId = callback.message?.chat?.id;
  const chatType = callback.message?.chat?.type;
  const messageId = callback.message?.message_id;
  if (!parsed || typeof userId !== "number" || callback.from?.is_bot === true || (chatType !== "group" && chatType !== "supergroup") || (typeof chatId !== "number" && typeof chatId !== "string") || typeof messageId !== "number") {
    await dependencies.telegram.answer(callback.id, "Некорректная команда.", true);
    return "rejected";
  }

  const order = await dependencies.store.load(parsed.orderNumber);
  if (!order || order.chatId !== String(chatId) || order.messageId !== messageId) {
    await dependencies.telegram.answer(callback.id, "Эта кнопка не относится к заявке в данной группе.", true);
    return "rejected";
  }

  const member = await dependencies.telegram.getChatMember(order.chatId, userId);
  if (!member.ok) {
    await dependencies.telegram.answer(callback.id, "Не удалось проверить права менеджера. Повторите позже.", true);
    return "telegram-unavailable";
  }
  if (!isAllowedTelegramManager(member.status, userId, dependencies.allowedUserIds)) {
    await dependencies.telegram.answer(callback.id, "Недостаточно прав для изменения статуса.", true);
    return "rejected";
  }

  const transition = await dependencies.store.transition({
    orderNumber: parsed.orderNumber,
    action: parsed.action,
    actorId: String(userId),
    expectedCityId: order.cityId,
    expectedMessageId: messageId,
  });
  if (transition.kind === "invalid" || transition.kind === "not-found") {
    await dependencies.telegram.answer(callback.id, transition.kind === "not-found" ? "Заявка не найдена." : "Недопустимый переход статуса.", true);
    return "rejected";
  }

  if (!("order" in transition)) {
    await dependencies.telegram.answer(callback.id, "Не удалось загрузить актуальное состояние заявки.", true);
    return "rejected";
  }
  const current = transition.order;
  const keyboard = buildOrderKeyboard({
    orderNumber: current.orderNumber,
    status: current.notification.status ?? "NEW",
  });
  const synchronized = await dependencies.telegram.editMessage(
    current,
    formatOrderNotification(current.notification),
    keyboard,
  );
  if (!synchronized) {
    await dependencies.telegram.answer(callback.id, "Статус сохранён, но сообщение не синхронизировано. Повторите нажатие.", true);
    return "sync-failed";
  }
  await dependencies.telegram.answer(callback.id, transition.kind === "changed" ? "Статус заявки обновлён." : "Статус уже актуален.");
  return transition.kind === "changed" ? "updated" : "unchanged";
}
