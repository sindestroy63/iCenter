import assert from "node:assert/strict";

const { sendTelegramMessage } = await import("../lib/telegram/client.ts");
const { formatLeadNotification, formatOrderNotification } = await import("../lib/telegram/formatters.ts");

function assertTelegramHtml(text) {
  const tags = text.match(/<\/?(?:b|i)>/g) ?? [];
  const stack = [];
  for (const tag of tags) {
    if (tag.startsWith("</")) assert.equal(stack.pop(), tag.slice(2, -1));
    else stack.push(tag.slice(1, -1));
  }
  assert.deepEqual(stack, []);
  assert.doesNotMatch(text, /\n\n\n/);
}

let calls = 0;
const sent = await sendTelegramMessage("<b>hello</b>", {
  token: "test-token",
  chatId: "test-chat",
  fetcher: async (url, init) => {
    calls += 1;
    assert.match(url, /bottest-token\/sendMessage$/);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.chat_id, "test-chat");
    assert.equal(body.parse_mode, "HTML");
    assert.equal(body.text, "<b>hello</b>");
    return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 });
  },
});
assert.deepEqual(sent, { status: "sent", messageId: 42 });
assert.equal(calls, 1);

const rejected = await sendTelegramMessage("hello", {
  token: "test-token", chatId: "test-chat",
  fetcher: async () => new Response(JSON.stringify({ ok: false }), { status: 400 }),
});
assert.deepEqual(rejected, { status: "failed", reason: "TELEGRAM_REJECTED" });

const timeout = await sendTelegramMessage("hello", {
  token: "test-token", chatId: "test-chat", timeoutMs: 5,
  fetcher: (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))),
});
assert.deepEqual(timeout, { status: "failed", reason: "TIMEOUT" });

const order = formatOrderNotification({
  requestNumber: "IC-20261101-AB12", city: "samara", name: "Алиса <script>alert(1)</script>", phone: "+7 999 111-22-33",
  contactMethod: "Телефон", fulfillment: "DELIVERY", address: "Ленина, 1", comment: "Позвонить после 18:00",
  total: 199_990, items: [{
    productName: "iPhone 18 Pro", sku: "SKU-18P", quantity: 1, unitPrice: 199_990,
    variant: { label: "256 GB", attributes: { color: "Тёмный", storage: "256 GB", simType: "Dual eSIM", connectivity: { internal: "must not leak" } } },
  }],
});
assert.match(order, /🛒 <b>НОВЫЙ ЗАКАЗ<\/b>/);
assert.match(order, /№ <b>IC-20261101-AB12<\/b> · 📍 Самара/);
assert.match(order, /👤 Имя: Алиса/);
assert.match(order, /Способ: Доставка/);
assert.match(order, /<b>Клиент<\/b>/);
assert.match(order, /<b>1\. iPhone 18 Pro<\/b>\nХарактеристики: 256 GB · Цвет: Тёмный · SIM: Dual eSIM/);
assert.match(order, /Алиса &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.match(order, /<b>Итого: 199\s?990,00\s?₽<\/b>/);
assert.doesNotMatch(order, /<script>|\[object Object\]|must not leak/);
assertTelegramHtml(order);

const deduplicated = formatOrderNotification({
  requestNumber: "IC-DUP", city: "Самара", name: "Клиент", phone: "+7 900", total: 1000,
  items: [{ productName: "iPhone 18 Pro 256 GB", variant: { label: "256 GB", attributes: { storage: "256 GB", color: "Тёмный" } }, quantity: 1, unitPrice: 1000 }],
});
assert.equal((deduplicated.match(/256 GB/g) ?? []).length, 1);

const pickup = formatOrderNotification({
  requestNumber: "IC-PICKUP", city: "unknown-city", name: "Клиент", phone: "+7 900", fulfillment: "PICKUP", total: 1000,
  items: [{ productName: "Phone", quantity: 1, unitPrice: 1000 }],
});
assert.match(pickup, /📍 unknown-city/);
assert.match(pickup, /Способ: Самовывоз/);
assert.match(pickup, /👤 Имя: Клиент/);

const tradeIn = formatLeadNotification({
  requestType: "trade_in", requestNumber: "TI-1", city: "moscow", name: "Борис", phone: "+7 900",
  device: "iPhone 14", color: "Синий", batteryHealth: 87, equipment: ["Коробка", "Кабель"], condition: "Хорошее", comment: "Без царапин",
});
assert.match(tradeIn, /🔄 <b>НОВАЯ ЗАЯВКА TRADE-IN<\/b>/);
assert.match(tradeIn, /№ <b>TI-1<\/b> · 📍 Москва/);
assert.match(tradeIn, /👤 Имя: Борис/);
assert.match(tradeIn, /iPhone 14 · Синий/);
assert.match(tradeIn, /Состояние<\/b>\nБатарея: 87%/);
assert.match(tradeIn, /Коробка, Кабель/);
assert.match(tradeIn, /Комплектация<\/b>[\s\S]*\n\n🧾 <b>Состояние<\/b>/);
assert.doesNotMatch(tradeIn, /\n\n\n/);
assertTelegramHtml(tradeIn);

const installment = formatLeadNotification({
  requestType: "installment", requestNumber: "IN-1", city: "kazan", name: "Анна", phone: "+7 901", productName: "MacBook Air",
});
assert.match(installment, /💳 <b>НОВАЯ ЗАЯВКА НА РАССРОЧКУ<\/b>/);
assert.match(installment, /MacBook Air/);
assert.match(installment, /📍 kazan/);
assert.match(installment, /👤 Имя: Анна/);
assert.doesNotMatch(installment, /Комментарий:|Состояние батареи:|undefined|null/);
assertTelegramHtml(installment);
assert.match(order, /Товары<\/b>\n<b>1\./);
assert.match(order, /Получение<\/b>[\s\S]*\n\n💬 <b>Комментарий<\/b>/);
assert.doesNotMatch(order, /\n\n\n/);

const long = formatOrderNotification({
  requestNumber: "IC-LONG", city: "Самара", name: "Клиент", phone: "+7 900 000-00-00", total: 123456,
  comment: "комментарий ".repeat(1000),
  items: Array.from({ length: 30 }, (_, index) => ({
    productName: `Товар ${index} `.repeat(30), sku: `SKU-${index}`, quantity: 1, unitPrice: 1000,
    variant: { label: `Характеристика ${index} `.repeat(20), attributes: { color: `Цвет ${index}` } },
  })),
});
assert.ok(long.length <= 4096);
assert.match(long, /IC-LONG/);
assert.match(long, /Клиент/);
assert.match(long, /\+7 900 000-00-00/);
assert.match(long, /Итого:/);
assert.doesNotMatch(long, /\[object Object\]/);
assertTelegramHtml(long);
assert.equal((long.match(/<b>\d+\. Товар/g) ?? []).length, (long.match(/Количество: 1/g) ?? []).length);
assert.equal((long.match(/<b>\d+\. Товар/g) ?? []).length, (long.match(/Цена: 1 000,00 ₽/g) ?? []).length);

assert.deepEqual(await sendTelegramMessage("no env", { fetcher: async () => { throw new Error("must not call"); } }), { status: "skipped", reason: "NOT_CONFIGURED" });
console.log("Telegram templates and client checks passed");
