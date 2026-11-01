export type TelegramSendResult =
  | { status: "sent"; messageId: number }
  | { status: "skipped" | "failed"; reason: string };

type TelegramClientOptions = {
  token?: string;
  chatId?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export async function sendTelegramMessage(text: string, options: TelegramClientOptions = {}): Promise<TelegramSendResult> {
  const token = options.token ?? process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = options.chatId ?? process.env.TELEGRAM_WORK_CHAT_ID?.trim();
  if (!token || !chatId) return { status: "skipped", reason: "NOT_CONFIGURED" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  try {
    const response = await (options.fetcher ?? fetch)(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; result?: { message_id?: number } } | null;
    if (!response.ok || payload?.ok !== true || typeof payload.result?.message_id !== "number") {
      return { status: "failed", reason: "TELEGRAM_REJECTED" };
    }
    return { status: "sent", messageId: payload.result.message_id };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR" };
  } finally {
    clearTimeout(timeout);
  }
}
