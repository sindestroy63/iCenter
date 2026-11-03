import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

const outbox = path.resolve(".tmp", `notification-transport-test-${randomUUID()}.jsonl`);
if (!process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL_REQUIRED");
process.env.ICENTER_NOTIFICATION_TRANSPORT = "mock";
process.env.ICENTER_NOTIFICATION_OUTBOX = outbox;
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_WORK_CHAT_ID;
await rm(outbox, { force: true });

const { deliverNotification, notificationTestTransport } = await import("../lib/notification-transport.ts");
assert.equal(notificationTestTransport(), true);
await deliverNotification({ type: "telegram", recipient: "test-chat", text: "synthetic test notification", createdAt: new Date().toISOString() });
const saved = await readFile(outbox, "utf8");
assert.match(saved, /synthetic test notification/);
await rm(outbox, { force: true });

process.env.TELEGRAM_BOT_TOKEN = "must-not-be-accepted";
assert.throws(() => notificationTestTransport(), /REAL_NOTIFICATION_CONFIGURATION_FORBIDDEN/);
console.log("notification mock isolation passed");
