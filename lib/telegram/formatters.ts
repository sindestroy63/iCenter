export type OrderNotification = {
  requestNumber: string;
  city: string;
  name: string;
  phone: string;
  contactMethod: string;
  fulfillment: string;
  address?: string;
  comment?: string;
  total: number;
  items: Array<{ productName: string; variant: string; sku: string; quantity: number; unitPrice: number }>;
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

function value(text: string | null | undefined) {
  return text?.replace(/[\r\n\t]+/g, " ").trim() || "не указано";
}

function money(amount: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(amount);
}

export function formatOrderNotification(order: OrderNotification) {
  const lines = order.items.map((item) =>
    `- ${value(item.productName)} / ${value(item.variant)} (SKU ${value(item.sku)}): ${item.quantity} x ${money(item.unitPrice)} = ${money(item.quantity * item.unitPrice)}`,
  );
  return [
    `Новый заказ ${value(order.requestNumber)}`,
    `Город: ${value(order.city)}`,
    `Клиент: ${value(order.name)}`,
    `Телефон: ${value(order.phone)}`,
    `Связь: ${value(order.contactMethod)}`,
    `Получение: ${value(order.fulfillment)}`,
    order.address ? `Адрес: ${value(order.address)}` : "",
    "Товары:",
    ...lines,
    `Итого: ${money(order.total)}`,
    order.comment ? `Комментарий: ${value(order.comment)}` : "",
  ].filter(Boolean).join("\n");
}

export function formatLeadNotification(lead: LeadNotification) {
  const title = lead.requestType === "installment" ? "Новая заявка на рассрочку" : "Новая заявка Trade-in";
  const device = [lead.productName, lead.brand, lead.deviceType, lead.device, lead.desiredDevice, lead.configuration, lead.color]
    .filter((part) => part?.trim())
    .map((part) => value(part))
    .filter((part, index, all) => all.indexOf(part) === index)
    .join(" / ");
  const details = [
    lead.requestType === "trade_in" && lead.batteryHealth !== null && lead.batteryHealth !== undefined ? `Состояние батареи: ${lead.batteryHealth}%` : "",
    lead.equipment?.length ? `Комплектация: ${lead.equipment.map(value).join(", ")}` : "",
    lead.condition ? `Состояние: ${value(lead.condition)}` : "",
  ];
  return [
    `${title} ${value(lead.requestNumber)}`,
    `Город: ${value(lead.city)}`,
    `Клиент: ${value(lead.name)}`,
    `Телефон: ${value(lead.phone)}`,
    device ? `Устройство/товар: ${device}` : "",
    ...details,
    lead.comment ? `Комментарий: ${value(lead.comment)}` : "",
  ].filter(Boolean).join("\n");
}
