import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type NotificationEnvelope = {
  type: "telegram" | "email" | "webhook";
  recipient: string;
  text: string;
  createdAt: string;
};

function testDatabaseIdentity() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "postgresql:" &&
      ["127.0.0.1", "localhost", "::1"].includes(url.hostname) &&
      url.port === "55432" &&
      decodeURIComponent(url.pathname.slice(1)) === "icenter_test" &&
      decodeURIComponent(url.username) === "icenter_test";
  } catch {
    return false;
  }
}

export function notificationMode() {
  return process.env.ICENTER_NOTIFICATION_TRANSPORT ?? "real";
}

export function assertNotificationTestIsolation() {
  if (notificationMode() !== "mock") return;
  if (!testDatabaseIdentity()) throw new Error("NOTIFICATION_TEST_ISOLATION_REQUIRED");
  if (process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_REQUESTS_CHAT_ID || process.env.NOTIFICATION_EMAIL_TO || process.env.NOTIFICATION_WEBHOOK_URL) {
    throw new Error("REAL_NOTIFICATION_CONFIGURATION_FORBIDDEN");
  }
}

export async function deliverNotification(envelope: NotificationEnvelope) {
  if (notificationMode() !== "mock") return false;
  assertNotificationTestIsolation();
  const outbox = path.resolve(process.env.ICENTER_NOTIFICATION_OUTBOX ?? ".tmp/notification-outbox.jsonl");
  await mkdir(path.dirname(outbox), { recursive: true });
  await appendFile(outbox, `${JSON.stringify(envelope)}\n`, "utf8");
  return true;
}

export function notificationTestTransport() {
  assertNotificationTestIsolation();
  return notificationMode() === "mock";
}
