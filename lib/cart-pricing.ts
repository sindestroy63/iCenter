export type PricedCartLine = { price?: number | null; quantity: number };

export function cartPriceSummary(items: PricedCartLine[]) {
  const known = items.filter((item) => typeof item.price === "number" && Number.isFinite(item.price));
  const subtotal = known.reduce((sum, item) => sum + item.price! * item.quantity, 0);
  return {
    knownCount: known.length,
    subtotal,
    totalLabel: known.length === items.length ? "known" : known.length ? "partial" : "unknown",
  } as const;
}

export function serverPriceForCity<T extends { city?: string; priceCity?: string; price?: number | null }>(item: T, selectedCity: string, pricesReady: boolean) {
  return pricesReady && item.city === selectedCity && item.priceCity === selectedCity && typeof item.price === "number" && Number.isFinite(item.price)
    ? item.price
    : null;
}
