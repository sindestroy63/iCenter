import assert from "node:assert/strict";

const { sendTelegramMessage } = await import("../lib/telegram/client.ts");
const { formatLeadNotification, formatOrderNotification } = await import("../lib/telegram/formatters.ts");

let calls = 0;
const sent = await sendTelegramMessage("hello", {
  token: "test-token",
  chatId: "-100123",
  fetcher: async (url, init) => {
    calls += 1;
    assert.match(url, /bottest-token\/sendMessage$/);
    assert.equal(JSON.parse(String(init?.body)).chat_id, "-100123");
    return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 });
  },
});
assert.deepEqual(sent, { status: "sent", messageId: 42 });
assert.equal(calls, 1);

const rejected = await sendTelegramMessage("hello", {
  token: "test-token", chatId: "-100123",
  fetcher: async () => new Response(JSON.stringify({ ok: false }), { status: 400 }),
});
assert.deepEqual(rejected, { status: "failed", reason: "TELEGRAM_REJECTED" });

const timeout = await sendTelegramMessage("hello", {
  token: "test-token", chatId: "-100123", timeoutMs: 5,
  fetcher: (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))),
});
assert.deepEqual(timeout, { status: "failed", reason: "TIMEOUT" });

const order = formatOrderNotification({
  requestNumber: "IC-1", city: "Самара", name: "Алиса\n<script>", phone: "+7 999", contactMethod: "phone", fulfillment: "pickup", total: 1000,
  items: [{ productName: "Phone", variant: "128 GB", sku: "SKU-1", quantity: 2, unitPrice: 500 }],
});
assert.match(order, /Алиса <script>/);
assert.match(order, /2 x/);

const lead = formatLeadNotification({ requestType: "trade_in", requestNumber: "TI-1", city: "Москва", name: "Bob", phone: "+7", device: "iPhone", comment: "line\nbreak" });
assert.match(lead, /Новая заявка Trade-in TI-1/);
assert.match(lead, /line break/);
const installment = formatLeadNotification({ requestType: "installment", requestNumber: "IN-1", city: "Самара", name: "Alice", phone: "+7", productName: "Phone" });
assert.match(installment, /Новая заявка на рассрочку IN-1/);

assert.deepEqual(await sendTelegramMessage("no env", { fetcher: async () => { throw new Error("must not call"); } }), { status: "skipped", reason: "NOT_CONFIGURED" });
console.log("Telegram notification client and formatter checks passed");
