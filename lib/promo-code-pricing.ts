export function normalizePromoCode(value: string) { return value.trim().toUpperCase(); }

export function parseMoneyCents(value: string) {
  const match = value.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error("INVALID_MONEY");
  return BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
}

export function formatMoneyCents(value: bigint) {
  const whole = value / BigInt(100);
  const fraction = String(value % BigInt(100)).padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function fixedDiscountCents(discountRubles: string, subtotalCents: bigint) {
  const discount = parseMoneyCents(discountRubles);
  if (discount % BigInt(100) !== BigInt(0)) throw new Error("INVALID_MONEY");
  return discount < subtotalCents ? discount : subtotalCents;
}

export function isPromoEligible(value: { isActive: boolean; startsAt: Date | null; endsAt: Date | null; usageLimit: number | null; usageCount: number }, now = new Date()) {
  return value.isActive && (!value.startsAt || value.startsAt <= now) && (!value.endsAt || value.endsAt >= now) && (value.usageLimit === null || value.usageCount < value.usageLimit);
}
