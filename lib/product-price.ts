export const OLD_PRICE_PERCENT = 15;

export function normalizeCurrentPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const price = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(price) && price > 0 ? price : null;
}

export function calculateOldPrice(value: unknown): number | null {
  const price = normalizeCurrentPrice(value);
  if (price === null) return null;

  const increased = (BigInt(price) * BigInt(115) + BigInt(99)) / BigInt(100);
  const distance = increased > BigInt(990) ? increased - BigInt(990) : BigInt(0);
  const steps = (distance + BigInt(999)) / BigInt(1000);
  const result = steps * BigInt(1000) + BigInt(990);
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
}
