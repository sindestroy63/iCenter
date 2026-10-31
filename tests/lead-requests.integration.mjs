import assert from "node:assert/strict";
import { createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL ?? "";
const target = new URL(databaseUrl);
assert.equal(target.protocol, "postgresql:");
assert.ok(["127.0.0.1", "localhost", "::1"].includes(target.hostname));
assert.equal(target.port, "55432", "Lead integration tests require isolated PostgreSQL port 55432");
assert.equal(decodeURIComponent(target.pathname.slice(1)), "icenter_test");
assert.equal(decodeURIComponent(target.username), "icenter_test");

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const uploadRoot = await mkdtemp(path.join(os.tmpdir(), "icenter-lead-integration-"));
const piiKey = randomBytes(32).toString("base64");
const port = 3107;
const baseUrl = `http://localhost:${port}`;
const keys = [`lead-trade-${randomUUID()}`, `lead-installment-${randomUUID()}`, `lead-photos-${randomUUID()}`, `lead-invalid-${randomUUID()}`];
let server;

function decrypt(payload) {
  const [version, iv, tag, ciphertext] = payload.split(".");
  assert.equal(version, "v1");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(piiKey, "base64"), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from("icenter:checkout-pii:v1", "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8"));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(`${baseUrl}/api/catalog/cities`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("TEST_APP_START_TIMEOUT");
}

async function row(key) {
  const rows = await prisma.$queryRawUnsafe('SELECT "requestNumber","idempotencyKey","encryptedPiiPayload","consentVersion" FROM trade_in_requests WHERE "idempotencyKey"=$1', key);
  assert.equal(rows.length, 1);
  return rows[0];
}

async function postLead(route, key, values, photos = []) {
  const form = new FormData();
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  for (const photo of photos) form.append("photos", photo.file, photo.name);
  return fetch(`${baseUrl}${route}`, { method: "POST", headers: { origin: baseUrl, "idempotency-key": key }, body: form });
}

try {
  const identity = await prisma.$queryRawUnsafe("SELECT current_database() AS db,current_user AS usr,current_setting('server_version') AS version");
  assert.equal(identity[0].db, "icenter_test");
  assert.equal(identity[0].usr, "icenter_test");
  assert.match(identity[0].version, /^16\./);
  const cityRows = await prisma.$queryRawUnsafe("SELECT slug FROM cities WHERE slug IN ('samara','moscow','saint-petersburg','orenburg') AND \"isActive\"=TRUE ORDER BY slug LIMIT 1");
  assert.equal(cityRows.length, 1, "icenter_test needs one supported active city");
  const city = cityRows[0].slug;

  server = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], {
    cwd: process.cwd(), stdio: "inherit", env: { ...process.env, DATABASE_URL: databaseUrl, REQUEST_PII_KEY: piiKey, UPLOAD_DIR: uploadRoot, NODE_ENV: "production", ICENTER_LOCAL_DEV: "1", ICENTER_NOTIFICATION_TRANSPORT: "mock", TELEGRAM_BOT_TOKEN: "", TELEGRAM_REQUESTS_CHAT_ID: "", ICENTER_NOTIFICATION_OUTBOX: path.join(uploadRoot, "notifications.jsonl") },
  });
  await waitForServer();
  const tradeValues = { name: "Integration Trade", phone: "+7 (999) 123-45-67", city, brand: "Apple", deviceType: "iPhone", device: "Integration Device", configuration: "128 ГБ", color: "Чёрный", batteryHealth: "90", condition: "Хорошее", comment: "integration", desiredDevice: "", personalDataConsent: "true", privacyConsent: "true" };
  const first = await postLead("/api/trade-in", keys[0], tradeValues);
  assert.equal(first.status, 201); const firstBody = await first.json();
  const tradeRow = await row(keys[0]); assert.equal(tradeRow.requestNumber, firstBody.requestNumber); assert.equal(tradeRow.consentVersion, "personal-data-v2");
  const tradePii = decrypt(tradeRow.encryptedPiiPayload); assert.equal(tradePii.requestType, "trade_in"); assert.equal(tradePii.consentEvidence.personalData.accepted, true); assert.equal(tradePii.consentEvidence.privacyPolicy.accepted, true); assert.deepEqual(tradePii.photoUrls, []);
  const replay = await postLead("/api/trade-in", keys[0], tradeValues); assert.equal(replay.status, 200); assert.equal((await replay.json()).requestNumber, firstBody.requestNumber);
  const count = await prisma.$queryRawUnsafe('SELECT count(*)::int AS count FROM trade_in_requests WHERE "idempotencyKey"=$1', keys[0]); assert.equal(count[0].count, 1);

  const png = new Blob([Buffer.from([137,80,78,71,13,10,26,10])], { type: "image/png" });
  const jpeg = new Blob([Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1])], { type: "image/jpeg" });
  const webp = new Blob([Buffer.from([82,73,70,70,20,0,0,0,87,69,66,80])], { type: "image/webp" });
  const withPhotos = await postLead("/api/trade-in", keys[2], tradeValues, [
    { file: png, name: "device.png" },
    { file: jpeg, name: "device.jpg" },
    { file: webp, name: "device.webp" },
  ]);
  assert.equal(withPhotos.status, 201);
  const photoRow = await row(keys[2]);
  const photoPii = decrypt(photoRow.encryptedPiiPayload);
  assert.equal(photoPii.photoUrls.length, 3);
  for (const relative of photoPii.photoUrls) assert.equal(await stat(path.join(uploadRoot, relative.slice("/uploads/".length))).then(() => true), true);
  const bad = await postLead("/api/trade-in", keys[3], tradeValues, [{ file: new Blob(["not an image"], { type: "text/plain" }), name: "device.txt" }]);
  assert.equal(bad.status, 400); assert.equal((await bad.json()).error, "INVALID_UPLOAD");
  const badRows = await prisma.$queryRawUnsafe('SELECT count(*)::int AS count FROM trade_in_requests WHERE "idempotencyKey"=$1', keys[3]); assert.equal(badRows[0].count, 0);
  const installment = await postLead("/api/installment", keys[1], { name: "Integration Installment", phone: "+7 (999) 123-45-67", city, desiredDevice: "Integration Product", personalDataConsent: "true", privacyConsent: "true" });
  assert.equal(installment.status, 201); const installmentRow = await row(keys[1]); const installmentPii = decrypt(installmentRow.encryptedPiiPayload); assert.equal(installmentPii.requestType, "installment"); assert.equal(installmentPii.consentEvidence.privacyPolicy.accepted, true);
  console.log("Trade-in and installment integration path passed on isolated icenter_test");
} finally {
  if (server) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await exited;
  }
  for (const key of keys) await prisma.$executeRawUnsafe('DELETE FROM trade_in_requests WHERE "idempotencyKey"=$1', key).catch(() => {});
  await prisma.$disconnect();
  await rm(uploadRoot, { recursive: true, force: true });
}
