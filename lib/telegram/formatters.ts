export type OrderNotification = {
  requestNumber: string;
  city: string;
  name: string;
  phone: string;
  contactMethod?: string;
  fulfillment?: string;
  address?: string;
  comment?: string;
  total: number;
  items: Array<{ productName: string; variant?: unknown; sku?: string; quantity: number; unitPrice: number }>;
};

export type LeadNotification = {
  requestType: "installment" | "trade_in";
  requestNumber: string;
  city: string;
  name: string;
  phone: string;
  productName?: string;
  brand?: string;
  deviceType?: string;
  device?: string;
  configuration?: string;
  color?: string;
  batteryHealth?: number | null;
  equipment?: string[];
  condition?: string;
  desiredDevice?: string;
  comment?: string;
};

const MESSAGE_LIMIT = 4096;
const OUTPUT_LIMIT = 3900;

function plain(value: unknown, maxLength = 300): string {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return "";
  return String(value).replace(/[\r\n\t\u0000-\u001f]+/g, " ").trim().slice(0, maxLength);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function optional(label: string, value: unknown, maxLength = 300) {
  const text = plain(value, maxLength);
  return text ? `${label}: ${escapeHtml(text)}` : "";
}

function money(amount: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(amount);
}

function normalizeForMatch(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ru").replace(/[^0-9a-zа-яё]+/gi, "");
}

function variantDetails(value: unknown, productName: string): string[] {
  let variant = value;
  if (typeof variant === "string") {
    try { variant = JSON.parse(variant) as unknown; }
    catch { return plain(variant, 180) ? [escapeHtml(plain(variant, 180))] : []; }
  }
  if (!variant || typeof variant !== "object" || Array.isArray(variant)) return [];

  const record = variant as Record<string, unknown>;
  const details: string[] = [];
  const label = plain(record.label, 180);
  const productKey = normalizeForMatch(productName);
  const labelKey = normalizeForMatch(label);
  if (label && !productKey.includes(labelKey)) details.push(label);

  const attributes = record.attributes && typeof record.attributes === "object" && !Array.isArray(record.attributes)
    ? record.attributes as Record<string, unknown>
    : {};
  const fields: Array<[string, string[]]> = [
    ["Цвет", ["color", "colorName", "colorNameRu"]],
    ["Память", ["storage", "memory"]],
    ["ОЗУ", ["ram"]],
    ["SIM", ["simType", "sim"]],
    ["Связь", ["connectivity"]],
    ["Размер", ["size"]],
    ["Материал", ["material"]],
  ];
  const knownText = `${productKey}${labelKey}`;
  const seenValues = new Set<string>();
  for (const [title, keys] of fields) {
    const value = keys.map((key) => plain(attributes[key], 100)).find(Boolean);
    if (!value) continue;
    const key = normalizeForMatch(value);
    if (!key || knownText.includes(key) || seenValues.has(key)) continue;
    seenValues.add(key);
    details.push(`${title}: ${value}`);
  }
  return details.map((detail) => escapeHtml(detail)).filter((detail, index, all) => all.indexOf(detail) === index);
}

type MessageLine = { value: string; optional?: boolean };

function finish(lines: MessageLine[]) {
  let output = lines.filter((line) => line.value).map((line) => ({ ...line }));
  const length = () => output.reduce((total, line) => total + line.value.length + 1, 0);
  while (length() > OUTPUT_LIMIT) {
    const optionalIndex = output.findLastIndex((line) => line.optional);
    if (optionalIndex < 0) break;
    output.splice(optionalIndex, 1);
  }
  const result = output.map((line) => line.value).join("\n");
  if (result.length <= MESSAGE_LIMIT) return result;
  // All user-controlled optional lines have already been removed. Keep only
  // complete mandatory lines instead of cutting through an HTML tag.
  return lines.filter((line) => line.value && !line.optional).map((line) => line.value).join("\n").slice(0, MESSAGE_LIMIT);
}

export function formatOrderNotification(order: OrderNotification) {
  const items = order.items.map((item): MessageLine => {
    const productName = plain(item.productName, 180) || "Товар";
    const details = variantDetails(item.variant, productName);
    const sku = plain(item.sku, 80);
    const product = escapeHtml(productName);
    const description = [product, ...details].join(" · ");
    return {
      value: `• ${description}${sku ? ` <i>(${escapeHtml(sku)})</i>` : ""} × ${item.quantity} — ${money(item.unitPrice * item.quantity)}`,
      optional: true,
    };
  });
  return finish([
    { value: "🛒 <b>НОВЫЙ ЗАКАЗ</b>" },
    { value: `№ <b>${escapeHtml(plain(order.requestNumber, 120))}</b> · 📍 ${escapeHtml(plain(order.city, 120))}` },
    { value: "" },
    { value: "<b>Товары</b>" },
    ...items,
    { value: "" },
    { value: "<b>Клиент</b>" },
    { value: optional("👤 Клиент", order.name, 120) },
    { value: optional("📞 Телефон", order.phone, 40) },
    { value: optional("Связь", order.contactMethod, 80), optional: true },
    { value: "" },
    { value: `💰 <b>Итого: ${escapeHtml(money(order.total))}</b>` },
    { value: optional("🚚 Получение", order.fulfillment, 80), optional: true },
    { value: optional("Адрес", order.address, 300), optional: true },
    { value: optional("Комментарий", order.comment, 500), optional: true },
  ]);
}

export function formatLeadNotification(lead: LeadNotification) {
  const isTradeIn = lead.requestType === "trade_in";
  const title = isTradeIn ? "🔄 <b>НОВАЯ ЗАЯВКА TRADE-IN</b>" : "💳 <b>НОВАЯ ЗАЯВКА НА РАССРОЧКУ</b>";
  const deviceParts: string[] = [];
  const deviceKeys: string[] = [];
  for (const part of [lead.productName, lead.brand, lead.deviceType, lead.device, lead.desiredDevice, lead.configuration, lead.color]) {
    const text = plain(part, 180);
    const key = normalizeForMatch(text);
    if (!text || !key || deviceKeys.some((known) => known.includes(key))) continue;
    for (let index = deviceKeys.length - 1; index >= 0; index -= 1) {
      if (key.includes(deviceKeys[index])) {
        deviceKeys.splice(index, 1);
        deviceParts.splice(index, 1);
      }
    }
    deviceParts.push(text);
    deviceKeys.push(key);
  }
  const device = deviceParts
    .map(escapeHtml)
    .join(" · ");
  return finish([
    { value: title },
    { value: `№ <b>${escapeHtml(plain(lead.requestNumber, 120))}</b> · 📍 ${escapeHtml(plain(lead.city, 120))}` },
    { value: "" },
    { value: isTradeIn ? "<b>Устройство</b>" : "<b>Товар</b>" },
    { value: device ? `📱 ${device}` : "", optional: true },
    { value: optional("Состояние батареи", lead.batteryHealth === null || lead.batteryHealth === undefined ? "" : `${lead.batteryHealth}%`, 20), optional: true },
    { value: optional("Комплектация", lead.equipment?.filter((item) => typeof item === "string").join(", "), 300), optional: true },
    { value: optional("Состояние", lead.condition, 180), optional: true },
    { value: "" },
    { value: "<b>Клиент</b>" },
    { value: optional("👤 Клиент", lead.name, 120) },
    { value: optional("📞 Телефон", lead.phone, 40) },
    { value: optional("Комментарий", lead.comment, 500), optional: true },
  ]);
}
