export type CatalogMenuRule = { field: "brand" | "type" | "category" | "tradeIn"; value: string | true };
export type CatalogMenuAction =
  | { type: "url"; href: string }
  | { type: "category"; categoryId: string }
  | { type: "filters"; rules: CatalogMenuRule[] };
export type CatalogMenuBanner = { enabled: boolean; imageMediaId: string | null; alt: string; description: string };
export type CatalogMenuNode = {
  id: string; parentId: string | null; title: string; description: string; visible: boolean; sortOrder: number;
  action: CatalogMenuAction | null; banner?: CatalogMenuBanner;
};
export type CatalogMenuConfig = { version: 1; items: CatalogMenuNode[] };
export type MenuTaxonomy = {
  brands: Array<{ id: string; slug: string; name: string }>;
  types: Array<{ id: string; slug: string; name: string; brandId: string; brandSlug: string }>;
  categories: Array<{ id: string; slug: string; name: string; parentId: string | null }>;
};

export const CATALOG_MENU_SETTING_KEY = "catalog.megaMenu";
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;

export function isSafeInternalPath(path: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") && !/[\u0000-\u001f]/.test(path);
}

export function parseCatalogMenu(value: unknown): CatalogMenuConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.version !== 1 || !Array.isArray(input.items) || input.items.length > 500) return null;
  const items: CatalogMenuNode[] = [];
  const ids = new Set<string>();
  for (const raw of input.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== "string" || !idPattern.test(item.id) || ids.has(item.id)) return null;
    if (item.parentId !== null && typeof item.parentId !== "string") return null;
    if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 100) return null;
    if (typeof item.description !== "string" || item.description.length > 240) return null;
    if (typeof item.visible !== "boolean" || !Number.isInteger(item.sortOrder) || Number(item.sortOrder) < 0 || Number(item.sortOrder) > 10000) return null;
    let action: CatalogMenuAction | null = null;
    if (item.action !== null) {
      if (!item.action || typeof item.action !== "object" || Array.isArray(item.action)) return null;
      const candidate = item.action as Record<string, unknown>;
      if (candidate.type === "url" && typeof candidate.href === "string" && isSafeInternalPath(candidate.href)) action = { type: "url", href: candidate.href };
      else if (candidate.type === "category" && typeof candidate.categoryId === "string" && candidate.categoryId.length <= 160) action = { type: "category", categoryId: candidate.categoryId };
      else if (candidate.type === "filters" && Array.isArray(candidate.rules) && candidate.rules.length > 0 && candidate.rules.length <= 8) {
        const rules: CatalogMenuRule[] = [];
        for (const rawRule of candidate.rules) {
          if (!rawRule || typeof rawRule !== "object" || Array.isArray(rawRule)) return null;
          const rule = rawRule as Record<string, unknown>;
          if (rule.field === "tradeIn" && rule.value === true) rules.push({ field: "tradeIn", value: true });
          else if (["brand", "type", "category"].includes(String(rule.field)) && typeof rule.value === "string" && rule.value.length > 0 && rule.value.length <= 160) rules.push({ field: rule.field as "brand" | "type" | "category", value: rule.value });
          else return null;
        }
        action = { type: "filters", rules };
      } else return null;
    }
    let banner: CatalogMenuBanner | undefined;
    if (item.banner !== undefined) {
      if (!item.banner || typeof item.banner !== "object" || Array.isArray(item.banner)) return null;
      const rawBanner = item.banner as Record<string, unknown>;
      if (typeof rawBanner.enabled !== "boolean" || rawBanner.imageMediaId !== null && typeof rawBanner.imageMediaId !== "string" || typeof rawBanner.alt !== "string" || typeof rawBanner.description !== "string") return null;
      banner = { enabled: rawBanner.enabled, imageMediaId: rawBanner.imageMediaId as string | null, alt: rawBanner.alt.slice(0, 300), description: rawBanner.description.slice(0, 240) };
    }
    ids.add(item.id);
    items.push({ id: item.id, parentId: item.parentId as string | null, title: item.title.trim(), description: item.description, visible: item.visible, sortOrder: Number(item.sortOrder), action, ...(banner ? { banner } : {}) });
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of items) {
    if (item.parentId !== null) {
      const parent = byId.get(item.parentId);
      if (!parent || parent.parentId !== null) return null;
      if (item.banner) return null;
    }
  }
  return { version: 1, items };
}

function matches(item: { slug: string; name: string }, pattern: RegExp) { return pattern.test(`${item.slug} ${item.name}`.toLocaleLowerCase("ru-RU")); }
function filtersFor(brandId: string, typeId?: string): CatalogMenuAction {
  return { type: "filters", rules: [{ field: "brand", value: brandId }, ...(typeId ? [{ field: "type" as const, value: typeId }] : [])] };
}
function node(id: string, parentId: string | null, title: string, sortOrder: number, action: CatalogMenuAction | null): CatalogMenuNode {
  return { id, parentId, title, description: "", visible: true, sortOrder, action, ...(parentId === null ? { banner: { enabled: false, imageMediaId: null, alt: "", description: "" } } : {}) };
}

export function createDefaultCatalogMenu(taxonomy: MenuTaxonomy, legacyBanners: unknown): CatalogMenuConfig {
  const items: CatalogMenuNode[] = [];
  const addBrand = (id: string, title: string, sortOrder: number, childSpecs: Array<[string, string, RegExp]>) => {
    const brand = taxonomy.brands.find((item) => item.slug === id);
    items.push(node(id, null, title, sortOrder, brand ? filtersFor(brand.id) : null));
    childSpecs.forEach(([childId, label, pattern], index) => {
      const type = brand && taxonomy.types.find((entry) => entry.brandId === brand.id && matches(entry, pattern));
      items.push(node(childId, id, label, index, type && brand ? filtersFor(brand.id, type.id) : null));
    });
  };
  addBrand("apple", "Apple", 0, [["apple-iphone", "iPhone", /iphone/], ["apple-ipad", "iPad", /ipad/], ["apple-macbook", "MacBook", /mac.?book/], ["apple-airpods", "AirPods", /air.?pods/]]);
  addBrand("samsung", "Samsung", 1, [["samsung-smartphones", "Смартфоны", /galaxy|smartphone|смартф/], ["samsung-headphones", "Наушники", /buds|headphone|earphone|науш/], ["samsung-watches", "Часы", /watch|часы|смарт.?час/]]);
  addBrand("dyson", "Dyson", 2, [["dyson-straighteners", "Выпрямители", /straighten|выпрям/], ["dyson-stylers", "Стайлеры", /styler|airwrap|стайлер/], ["dyson-air-purifiers", "Очистители воздуха", /air.?purif|purifier|очистител.*воздух/], ["dyson-vacuums", "Пылесосы", /vacuum|пылесос/]]);
  const consolesCategory = taxonomy.categories.find((item) => matches(item, /gaming|console|игров.*консол|консол/));
  const consoleRoot = node("consoles", null, "Консоли", 3, consolesCategory ? { type: "category", categoryId: consolesCategory.id } : null); items.push(consoleRoot);
  [["consoles-playstation", "Sony PlayStation", /playstation/], ["consoles-nintendo", "Nintendo Switch", /nintendo|switch/], ["consoles-xbox", "Xbox", /xbox/]].forEach(([id, label, pattern], index) => {
    const type = taxonomy.types.find((entry) => matches(entry, pattern as RegExp));
    items.push(node(id as string, "consoles", label as string, index, type ? filtersFor(type.brandId, type.id) : null));
  });
  const accessoryRoot = taxonomy.categories.find((item) => matches(item, /accessor|аксесс/));
  items.push(node("accessories", null, "Аксессуары", 4, accessoryRoot ? { type: "category", categoryId: accessoryRoot.id } : null));
  [["accessories-glass", "Защитные стёкла", /screen.?protector|protective.?glass|защит.*ст[ёе]кл/], ["accessories-cases", "Чехлы", /(^|[-\s])case(s)?($|[-\s])|cover|чехл/], ["accessories-charging", "Зарядные устройства и кабели", /charg|cable|заряд|кабел/], ["accessories-other", "Другие аксессуары", /accessor|аксесс/]].forEach(([id, label, pattern], index) => {
    const category = taxonomy.categories.find((entry) => entry.parentId === accessoryRoot?.id && matches(entry, pattern as RegExp));
    const type = taxonomy.types.find((entry) => matches(entry, pattern as RegExp));
    items.push(node(id as string, "accessories", label as string, index, category ? { type: "category", categoryId: category.id } : type ? filtersFor(type.brandId, type.id) : null));
  });
  items.push(node("trade-in", null, "Trade-in", 5, { type: "category", categoryId: "trade-in" }));

  const rawLegacy = legacyBanners && typeof legacyBanners === "object" ? (legacyBanners as { banners?: unknown }).banners : null;
  if (Array.isArray(rawLegacy)) for (const raw of rawLegacy) {
    if (!raw || typeof raw !== "object") continue;
    const banner = raw as Record<string, unknown>;
    const root = items.find((item) => item.parentId === null && item.id === banner.key);
    if (root) root.banner = { enabled: banner.enabled === true, imageMediaId: typeof banner.imageMediaId === "string" ? banner.imageMediaId : null, alt: typeof banner.alt === "string" ? banner.alt.slice(0, 300) : "", description: typeof banner.description === "string" ? banner.description.slice(0, 240) : "" };
  }
  return { version: 1, items };
}

export function catalogMenuTree(config: CatalogMenuConfig, parentId: string | null = null): Array<CatalogMenuNode & { children: ReturnType<typeof catalogMenuTree> }> {
  return config.items.filter((item) => item.visible && item.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru")).map((item) => ({ ...item, children: catalogMenuTree(config, item.id) }));
}

export function findCatalogMenuNode(config: CatalogMenuConfig, id: string) {
  return config.items.find((item) => item.id === id) ?? null;
}
