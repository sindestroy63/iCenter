export type TelegramSendResult =
  | { status: "sent"; messageId: number }
  | { status: "skipped" | "failed"; reason: string };

export type TelegramInlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{
    text: string;
    callback_data?: string;
    url?: string;
    style?: "danger" | "success" | "primary";
  }>>;
};

type TelegramClientOptions = {
  token?: string;
  chatId?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  replyMarkup?: TelegramInlineKeyboardMarkup;
};

type TelegramApiOptions = Pick<TelegramClientOptions, "token" | "fetcher" | "timeoutMs">;

async function callTelegramApi(method: string, body: Record<string, unknown>, options: TelegramApiOptions = {}) {
  const token = options.token ?? process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { ok: false as const, reason: "NOT_CONFIGURED" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  try {
    const response = await (options.fetcher ?? fetch)(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; result?: unknown } | null;
    return response.ok && payload?.ok === true
      ? { ok: true as const, result: payload.result }
      : {
          ok: false as const,
          reason: "TELEGRAM_REJECTED",
          notModified: typeof (payload as { description?: unknown } | null)?.description === "string"
            && (payload as { description: string }).description === "Bad Request: message is not modified",
        };
  } catch (error) {
    return { ok: false as const, reason: error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR", notModified: false };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendTelegramMessage(text: string, options: TelegramClientOptions = {}): Promise<TelegramSendResult> {
  const token = options.token ?? process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = options.chatId ?? process.env.TELEGRAM_WORK_CHAT_ID?.trim();
  if (!token || !chatId) return { status: "skipped", reason: "NOT_CONFIGURED" };
  const result = await callTelegramApi("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4096),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
  }, options);
  const messageId = result.ok && typeof result.result === "object" && result.result !== null
    ? (result.result as { message_id?: unknown }).message_id
    : null;
  return typeof messageId === "number"
    ? { status: "sent", messageId }
    : { status: "failed", reason: result.ok ? "INVALID_RESPONSE" : result.reason };
}

export async function editTelegramMessage(
  chatId: string,
  messageId: number,
  text: string,
  replyMarkup: TelegramInlineKeyboardMarkup,
  options: TelegramApiOptions = {},
) {
  const result = await callTelegramApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: text.slice(0, 4096),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  }, options);
  return result.ok || (!result.ok && result.notModified)
    ? { status: "edited" as const }
    : { status: "failed" as const, reason: result.reason };
}

export async function answerTelegramCallback(callbackQueryId: string, text: string, showAlert = false, options: TelegramApiOptions = {}) {
  const result = await callTelegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text.slice(0, 200),
    show_alert: showAlert,
  }, options);
  return result.ok ? { status: "answered" as const } : { status: "failed" as const, reason: result.reason };
}

export async function getTelegramChatMember(chatId: string, userId: number, options: TelegramApiOptions = {}) {
  const result = await callTelegramApi("getChatMember", { chat_id: chatId, user_id: userId }, options);
  const status = result.ok && typeof result.result === "object" && result.result !== null
    ? (result.result as { status?: unknown }).status
    : null;
  return typeof status === "string"
    ? { status: "found" as const, memberStatus: status }
    : { status: "failed" as const, reason: result.ok ? "INVALID_RESPONSE" : result.reason };
}
