export type CatalogSort = "name" | "category" | "new" | "priceAsc" | "priceDesc";

export const DEFAULT_CATALOG_SORT: CatalogSort = "priceAsc";

const catalogSortValues = new Set<CatalogSort>(["name", "category", "new", "priceAsc", "priceDesc"]);

export function catalogSortFromQuery(value: string | null): CatalogSort {
  return value && catalogSortValues.has(value as CatalogSort) ? value as CatalogSort : DEFAULT_CATALOG_SORT;
}

export function catalogSortQueryParam(value: CatalogSort): string | null {
  return value === DEFAULT_CATALOG_SORT ? null : value;
}

type PriceEntry = {
  product: { id: string; name: string };
  variant: { id: string; price: string | null; availability: string };
};

function sellablePrice(entry: PriceEntry): number | null {
  if (entry.variant.availability !== "IN_STOCK" && entry.variant.availability !== "PREORDER") return null;
  const price = entry.variant.price === null ? null : Number(entry.variant.price);
  return price !== null && Number.isFinite(price) ? price : null;
}

export function catalogProductMinPrices(entries: PriceEntry[]): Map<string, number> {
  const prices = new Map<string, number>();
  for (const entry of entries) {
    const price = sellablePrice(entry);
    if (price === null) continue;
    const current = prices.get(entry.product.id);
    if (current === undefined || price < current) prices.set(entry.product.id, price);
  }
  return prices;
}

export function compareCatalogPriceEntries(left: PriceEntry, right: PriceEntry, direction: "priceAsc" | "priceDesc", productPrices: Map<string, number>): number {
  const leftProductPrice = productPrices.get(left.product.id);
  const rightProductPrice = productPrices.get(right.product.id);
  if (leftProductPrice === undefined) return rightProductPrice === undefined ? left.product.name.localeCompare(right.product.name, "ru") || left.variant.id.localeCompare(right.variant.id) : 1;
  if (rightProductPrice === undefined) return -1;
  const productDifference = direction === "priceAsc" ? leftProductPrice - rightProductPrice : rightProductPrice - leftProductPrice;
  if (productDifference) return productDifference;
  const productDifferenceByName = left.product.name.localeCompare(right.product.name, "ru");
  if (left.product.id !== right.product.id) return productDifferenceByName || left.product.id.localeCompare(right.product.id);
  const leftVariantPrice = sellablePrice(left);
  const rightVariantPrice = sellablePrice(right);
  if (leftVariantPrice === null) return rightVariantPrice === null ? left.variant.id.localeCompare(right.variant.id) : 1;
  if (rightVariantPrice === null) return -1;
  return leftVariantPrice - rightVariantPrice || left.variant.id.localeCompare(right.variant.id);
}
