export const CATALOG_MENU_ROOTS = [
  { key: "apple", label: "Apple" },
  { key: "samsung", label: "Samsung" },
  { key: "dyson", label: "Dyson" },
  { key: "consoles", label: "Консоли" },
  { key: "accessories", label: "Аксессуары" },
  { key: "trade-in", label: "Trade-in" },
] as const;

export type CatalogMenuRootKey = (typeof CATALOG_MENU_ROOTS)[number]["key"];
export type CatalogMenuBanner = { key: CatalogMenuRootKey; enabled: boolean; imageMediaId: string | null; alt: string; description: string };

export function parseCatalogMenuBanners(value: unknown): CatalogMenuBanner[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const items = (value as { banners?: unknown }).banners;
  if (!Array.isArray(items)) return [];
  const validKeys = new Set<string>(CATALOG_MENU_ROOTS.map((item) => item.key));
  const seen = new Set<string>();
  return items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.key !== "string" || !validKeys.has(candidate.key) || seen.has(candidate.key)) return [];
    if (typeof candidate.enabled !== "boolean" || (candidate.imageMediaId !== null && typeof candidate.imageMediaId !== "string") || typeof candidate.alt !== "string") return [];
    seen.add(candidate.key);
    return [{ key: candidate.key as CatalogMenuRootKey, enabled: candidate.enabled, imageMediaId: candidate.imageMediaId as string | null, alt: candidate.alt.slice(0, 300), description: typeof candidate.description === "string" ? candidate.description.slice(0, 240) : "" }];
  });
}
