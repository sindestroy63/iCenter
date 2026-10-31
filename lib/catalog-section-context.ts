export const CATALOG_SECTION_TITLES = {
  apple: "Apple",
  "apple-iphone": "iPhone",
  "apple-ipad": "iPad",
  "apple-macbook": "MacBook",
  "apple-airpods": "AirPods",
  samsung: "Samsung",
  "samsung-smartphones": "Смартфоны Samsung",
  "samsung-headphones": "Наушники Samsung",
  "samsung-watches": "Часы Samsung",
  dyson: "Dyson",
  "dyson-straighteners": "Выпрямители Dyson",
  "dyson-stylers": "Стайлеры Dyson",
  "dyson-air-purifiers": "Очистители воздуха Dyson",
  "dyson-vacuums": "Пылесосы Dyson",
  consoles: "Консоли",
  "consoles-playstation": "Sony PlayStation",
  "consoles-nintendo": "Nintendo Switch",
  "consoles-xbox": "Xbox",
  accessories: "Аксессуары",
  "accessories-glass": "Защитные стёкла",
  "accessories-cases": "Чехлы",
  "accessories-charging": "Зарядные устройства и кабели",
  "accessories-other": "Другие аксессуары",
  "trade-in": "Trade-in — б/у товары",
} as const;

export type CatalogSectionKey = keyof typeof CATALOG_SECTION_TITLES;
export type CatalogSectionScope = { brand?: string; type?: string; category?: string };

export function catalogSectionTitle(value?: string | null) {
  return value && Object.hasOwn(CATALOG_SECTION_TITLES, value) ? CATALOG_SECTION_TITLES[value as CatalogSectionKey] : null;
}

export function catalogSectionHref(section: CatalogSectionKey, scope: CatalogSectionScope) {
  const params = new URLSearchParams({ section });
  if (scope.brand) params.set("scopeBrand", scope.brand);
  if (scope.type) params.set("scopeType", scope.type);
  if (scope.category) params.set("scopeCategory", scope.category);
  return `/catalog?${params.toString()}`;
}
