export const TRADE_IN_CATEGORY_SLUG = "trade-in";

export type TradeInProductDetails = {
  isUsed: boolean;
  condition: string;
  batteryHealth: number | null;
  defects: string;
  equipment: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function tradeInProductDetails(specifications: unknown): TradeInProductDetails {
  const value = record(specifications);
  const battery = value.tradeInBatteryHealth === "" || value.tradeInBatteryHealth == null ? NaN : typeof value.tradeInBatteryHealth === "number" ? value.tradeInBatteryHealth : Number(value.tradeInBatteryHealth);
  return {
    isUsed: value.tradeIn === true || value.tradeIn === "true",
    condition: typeof value.tradeInCondition === "string" ? value.tradeInCondition : "",
    batteryHealth: Number.isInteger(battery) && battery >= 0 && battery <= 100 ? battery : null,
    defects: typeof value.tradeInDefects === "string" ? value.tradeInDefects : "",
    equipment: typeof value.tradeInEquipment === "string" ? value.tradeInEquipment : "",
  };
}
