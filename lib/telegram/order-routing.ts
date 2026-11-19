export const ORDER_CITY_CHAT_ENV = {
  cmv89sqr60000e1i0ybey0m05: "TELEGRAM_CHAT_ID_SAMARA",
  cmv89sqrp0001e1i0w1iofskc: "TELEGRAM_CHAT_ID_MOSCOW",
  cmv89sqru0002e1i0amnf9xd5: "TELEGRAM_CHAT_ID_SPB",
  cmv89sqry0003e1i0wuf73oxd: "TELEGRAM_CHAT_ID_ORENBURG",
} as const;

export type OrderTelegramRoute = { token: string; chatId: string };

export function resolveOrderTelegramRoute(
  cityId: string | null | undefined,
  token: string | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): OrderTelegramRoute | null {
  if (!cityId || !token) return null;
  const envKey = ORDER_CITY_CHAT_ENV[cityId as keyof typeof ORDER_CITY_CHAT_ENV];
  const chatId = (envKey ? env[envKey] : undefined)?.trim() || env.TELEGRAM_WORK_CHAT_ID?.trim();
  if (!chatId || !/^-?\d+$/.test(chatId)) return null;
  return { token, chatId };
}
