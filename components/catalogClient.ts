export type CatalogVariantDto = {
  id: string;
  sku: string;
  label: string;
  attributes: Record<string, unknown>;
  color: { id: string; name: string; nameRu?: string | null; slug: string; hex: string | null } | null;
  price: string | null;
  oldPrice: string | null;
  availability: "IN_STOCK" | "PREORDER" | "OUT_OF_STOCK" | "UNSPECIFIED";
  deliveryTime?: string | null;
};

export type CatalogProductDto = {
  id: string;
  slug: string;
  name: string;
  model?: string | null;
  generation?: string | null;
  chip?: string | null;
  displaySize?: string | null;
  releaseYear?: number | null;
  description: unknown;
  specifications?: unknown;
  isNew: boolean;
  isUsed?: boolean;
  brand: { id: string; name: string; slug: string };
  type: { id: string; name: string; slug: string; attributes?: unknown };
  category: { id: string; name: string; slug: string; parentId?: string | null };
  city: { name: string; slug: string };
  variants: CatalogVariantDto[];
  images: { id: string; src: string | null; alt: string; colorId: string | null; order: number }[];
  relatedProductIds?: string[];
};

export function variantAttribute(variant: CatalogVariantDto, key: string): string {
  const value = variant.attributes?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function formatFeatureValue(value: string) {
  return value.trim()
    .replace(/(\d+(?:[.,]\d+)?)\s*TB\b/gi, "$1 ТБ")
    .replace(/(\d+(?:[.,]\d+)?)\s*GB\b/gi, "$1 ГБ")
    .replace(/(\d+(?:[.,]\d+)?)\s*"/g, (_match, size: string) => `${size.replace(".", ",")}″`);
}

function normalizeFeature(value: string) {
  return value.toLocaleLowerCase("ru-RU").replace(/[^a-zа-яё0-9]/g, "");
}

export function getCatalogCharacteristics(product: CatalogProductDto, variant: CatalogVariantDto | null): string[] {
  const featureVariant = variant ?? product.variants[0] ?? null;
  if (!featureVariant) return [];
  const isIphone = product.brand.slug === "apple" && /^iphone(?:\b|-)/i.test(product.slug);
  const characteristics: string[] = [];
  const add = (value: string | null | undefined) => {
    const formatted = value ? formatFeatureValue(value) : "";
    if (formatted && !characteristics.some((item) => normalizeFeature(item) === normalizeFeature(formatted))) characteristics.push(formatted);
  };
  const read = (...keys: string[]) => keys.map((key) => variantAttribute(featureVariant, key)).find(Boolean) ?? "";
  const storage = read("storage", "memory");
  const ram = read("ram");
  if (storage && ram) add(`${formatFeatureValue(ram).replace(/\s*ГБ$/i, "")}/${formatFeatureValue(storage)}`);
  else add(storage || ram);
  const priority: Record<string, string[]> = {
    smartphones: ["chip", "generation", "simType", "resolution", "size"],
    tablets: ["chip", "simType", "resolution", "size", "material"],
    laptops: ["chip", "generation", "resolution", "size", "material"],
    gaming: ["resolution", "generation", "size", "material"],
    appliances: ["power", "size", "material", "resolution"],
    accessories: ["size", "material", "resolution"],
  };
  const priorityKeys = isIphone ? ["simType"] : priority[product.category.slug] ?? ["size", "material", "resolution"];
  for (const key of priorityKeys) {
    if (characteristics.length >= 2) break;
    add(key === "chip" ? product.chip : key === "generation" ? product.generation : read(key, key === "simType" ? "sim" : key));
  }
  const label = featureVariant.label.trim();
  const normalizedLabel = normalizeFeature(label);
  const generic = !label || ["вариант", "default", "defaultvariant"].includes(normalizedLabel);
  const repeats = characteristics.some((item) => normalizedLabel.includes(normalizeFeature(item))) || Boolean(featureVariant.color?.name && normalizedLabel.includes(normalizeFeature(featureVariant.color.name)));
  const unconfirmedDysonLabel = product.brand.slug === "dyson" && !featureVariant.color;
  if (characteristics.length < 2 && !generic && !repeats && !unconfirmedDysonLabel && !isIphone) add(label);
  return characteristics.slice(0, 2);
}

export function availabilityLabel(availability: CatalogVariantDto["availability"]) {
  if (availability === "IN_STOCK") return "В наличии";
  if (availability === "PREORDER") return "Под заказ";
  if (availability === "OUT_OF_STOCK") return "Нет в наличии";
  return "Наличие уточняйте";
}

export function productImage(product: CatalogProductDto): string {
  return product.images.find((image) => image.src)?.src ?? "";
}

export function productVariantImage(product: CatalogProductDto, variant: CatalogVariantDto | null): string {
  if (variant?.color?.id) {
    const colorImage = product.images.find((image) => image.colorId === variant.color?.id && image.src);
    if (colorImage?.src) return colorImage.src;
  }
  return productImage(product);
}

export function safeDescription(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((part): part is string => typeof part === "string").join(" ");
  if (value && typeof value === "object") return Object.values(value).filter((part): part is string => typeof part === "string").join(". ");
  return "";
}

export function selectCatalogDisplayVariant(product: CatalogProductDto) {
  const inStock = product.variants.filter((variant) => variant.availability === "IN_STOCK");
  const preorder = product.variants.filter((variant) => variant.availability === "PREORDER");
  const candidates = inStock.length ? inStock : preorder;
  if (!candidates.length) {
    return {
      variant: null,
      price: null,
      availability: product.variants.some((variant) => variant.availability === "OUT_OF_STOCK") ? "OUT_OF_STOCK" as const : "UNSPECIFIED" as const,
    };
  }
  const priced = candidates.filter((variant) => variant.price !== null && Number.isFinite(Number(variant.price)));
  const variant = priced.reduce((best, candidate) => Number(candidate.price) < Number(best.price) ? candidate : best, priced[0] ?? candidates[0]);
  const value = variant.price === null ? null : Number(variant.price);
  return { variant, price: Number.isFinite(value) ? value : null, availability: variant.availability };
}

export function selectCatalogVariant(product: CatalogProductDto, variantId?: string) {
  if (!variantId) return selectCatalogDisplayVariant(product);
  const variant = product.variants.find((entry) => entry.id === variantId) ?? null;
  if (!variant) return selectCatalogDisplayVariant(product);
  const value = variant.price === null ? null : Number(variant.price);
  return { variant, price: Number.isFinite(value) ? value : null, availability: variant.availability };
}
