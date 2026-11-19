export type CatalogMenuRule = { field: "brand" | "type" | "category" | "model" | "tradeIn"; value: string | true };
export type CatalogMenuAction =
  | { type: "url"; href: string }
  | { type: "category"; categoryId: string }
  | { type: "group"; groupId: string }
  | { type: "filters"; rules: CatalogMenuRule[] };
export type CatalogMenuBanner = { enabled: boolean; imageMediaId: string | null; alt: string; description: string };
export type CatalogMenuNode = {
  id: string; parentId: string | null; title: string; description: string; visible: boolean; sortOrder: number;
  action: CatalogMenuAction | null; banner?: CatalogMenuBanner; promoBanner?: CatalogMenuBanner;
};
export type CatalogMenuConfig = { version: 1; items: CatalogMenuNode[] };
export type CatalogMenuCategoryLinkNode = {
  id?: string;
  title?: string;
  href: string | null;
  action?: CatalogMenuAction | null;
  productIds?: string[];
  children?: CatalogMenuCategoryLinkNode[];
};
export type MenuTaxonomy = {
  brands: Array<{ id: string; slug: string; name: string }>;
  types: Array<{ id: string; slug: string; name: string; brandId?: string; brandSlug?: string; globalProductTypeId?: string }>;
  models: Array<{ id: string; name: string; brandId: string; globalProductTypeId: string; brandName?: string; typeName?: string }>;
  categories: Array<{ id: string; slug: string; name: string; parentId: string | null }>;
  groups?: Array<{ id: string; slug: string; title: string; isActive: boolean }>;
};

export const CATALOG_MENU_SETTING_KEY = "catalog.megaMenu";
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;

type CatalogCategoryLinkProduct = {
  id: string;
  brand: { id: string };
  type: { id: string };
  category: { id: string };
};

export function catalogProductCategoryHref(nodes: CatalogMenuCategoryLinkNode[], product: CatalogCategoryLinkProduct) {
  let bestHref: string | null = null;
  let bestScore = 0;
  let bestDepth = 0;
  const visit = (items: CatalogMenuCategoryLinkNode[], depth: number) => items.forEach((item) => {
    const href = item.href && item.href !== "/catalog" && item.href.startsWith("/catalog/") ? item.href : null;
    const action = item.action;
    let score = 0;
    if (href && action?.type === "group" && item.productIds?.includes(product.id)) score = 100;
    else if (href && action?.type === "category" && action.categoryId === product.category.id) score = 80;
    else if (href && action?.type === "filters") {
      const rules = action.rules.filter((rule) => rule.field !== "tradeIn");
      const matches = rules.length > 0 && rules.every((rule) => rule.field === "brand" ? rule.value === product.brand.id
        : rule.field === "type" ? rule.value === product.type.id
        : rule.field === "category" ? rule.value === product.category.id
        : false);
      const hasCategoryOrType = rules.some((rule) => rule.field === "category" || rule.field === "type");
      const nonRootBrandSection = depth > 1 && rules.some((rule) => rule.field === "brand");
      if (matches && (hasCategoryOrType || nonRootBrandSection)) score = rules.length > 1 ? 90 + rules.length : 70;
    }
    if (href && score && (score > bestScore || score === bestScore && depth > bestDepth)) {
      bestHref = href;
      bestScore = score;
      bestDepth = depth;
    }
    visit(item.children ?? [], depth + 1);
  });
  visit(nodes, 1);
  return bestHref;
}

export function menuModelMatchesScope(model: MenuTaxonomy["models"][number], brandId?: string, globalProductTypeId?: string) {
  return (!brandId || model.brandId === brandId) && (!globalProductTypeId || model.globalProductTypeId === globalProductTypeId);
}

export function filterMenuModels(models: MenuTaxonomy["models"], brandId?: string, globalProductTypeId?: string) {
  return models.filter((model) => menuModelMatchesScope(model, brandId, globalProductTypeId));
}

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
      else if (candidate.type === "group" && typeof candidate.groupId === "string" && candidate.groupId.length <= 160) action = { type: "group", groupId: candidate.groupId };
      else if (candidate.type === "filters" && Array.isArray(candidate.rules) && candidate.rules.length > 0 && candidate.rules.length <= 8) {
        const rules: CatalogMenuRule[] = [];
        for (const rawRule of candidate.rules) {
          if (!rawRule || typeof rawRule !== "object" || Array.isArray(rawRule)) return null;
          const rule = rawRule as Record<string, unknown>;
          if (rule.field === "tradeIn" && rule.value === true) rules.push({ field: "tradeIn", value: true });
          else if (["brand", "type", "category", "model"].includes(String(rule.field)) && typeof rule.value === "string" && rule.value.length > 0 && rule.value.length <= 160) rules.push({ field: rule.field as "brand" | "type" | "category" | "model", value: rule.value });
          else return null;
        }
        action = { type: "filters", rules };
      } else return null;
    }
    const parseBanner = (value: unknown): CatalogMenuBanner | undefined => {
      if (value === undefined) return undefined;
      if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
      const rawBanner = value as Record<string, unknown>;
      if (typeof rawBanner.enabled !== "boolean" || rawBanner.imageMediaId !== null && typeof rawBanner.imageMediaId !== "string" || typeof rawBanner.alt !== "string" || typeof rawBanner.description !== "string") return undefined;
      return { enabled: rawBanner.enabled, imageMediaId: rawBanner.imageMediaId as string | null, alt: rawBanner.alt.slice(0, 300), description: rawBanner.description.slice(0, 240) };
    };
    const banner = parseBanner(item.banner);
    const promoBanner = parseBanner(item.promoBanner);
    if (item.banner !== undefined && !banner || item.promoBanner !== undefined && !promoBanner) return null;
    ids.add(item.id);
    items.push({ id: item.id, parentId: item.parentId as string | null, title: item.title.trim(), description: item.description, visible: item.visible, sortOrder: Number(item.sortOrder), action, ...(banner ? { banner } : {}), ...(promoBanner ? { promoBanner } : {}) });
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of items) {
    if (item.parentId !== null && !byId.has(item.parentId)) return null;
    const seen = new Set<string>();
    let current: CatalogMenuNode | undefined = item;
    while (current?.parentId !== null) {
      if (seen.has(current.id)) return null;
      seen.add(current.id);
      current = byId.get(current.parentId);
      if (!current) return null;
    }
  }
  return { version: 1, items };
}

export function mapCatalogMenuProductTypes(
  config: CatalogMenuConfig,
  legacyMappings: Array<{ legacyProductTypeId: string; globalProductTypeId: string }>,
): CatalogMenuConfig {
  if (!legacyMappings.length) return config;
  const globalTypeByLegacyId = new Map(legacyMappings.map((mapping) => [mapping.legacyProductTypeId, mapping.globalProductTypeId]));
  return {
    ...config,
    items: config.items.map((item) => item.action?.type === "filters"
      ? {
          ...item,
          action: {
            ...item.action,
            rules: item.action.rules.map((rule) => rule.field === "type"
              ? { ...rule, value: globalTypeByLegacyId.get(String(rule.value)) ?? rule.value }
              : rule),
          },
        }
      : item),
  };
}

function matches(item: { slug: string; name: string }, pattern: RegExp) { return pattern.test(`${item.slug} ${item.name}`.toLocaleLowerCase("ru-RU")); }
function filtersFor(brandId?: string, typeId?: string): CatalogMenuAction {
  return { type: "filters", rules: [...(brandId ? [{ field: "brand" as const, value: brandId }] : []), ...(typeId ? [{ field: "type" as const, value: typeId }] : [])] };
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
      const type = brand && taxonomy.types.find((entry) => matches(entry, pattern));
      const category = brand && taxonomy.categories.find((entry) => matches(entry, pattern));
      items.push(node(childId, id, label, index, type && brand
        ? filtersFor(brand.id, type.id)
        : category && brand
          ? { type: "filters", rules: [{ field: "brand", value: brand.id }, { field: "category", value: category.id }] }
          : null));
    });
  };
  addBrand("apple", "Apple", 0, [["apple-iphone", "iPhone", /iphone/], ["apple-ipad", "iPad", /ipad/], ["apple-macbook", "MacBook", /mac.?book/], ["apple-airpods", "AirPods", /air.?pods/]]);
  addBrand("samsung", "Samsung", 1, [["samsung-smartphones", "Смартфоны", /galaxy|smartphone|смартф/], ["samsung-headphones", "Наушники", /buds|headphone|earphone|науш/], ["samsung-watches", "Часы", /watch|часы|смарт.?час/]]);
  addBrand("dyson", "Dyson", 2, [["dyson-straighteners", "Выпрямители", /straighten|выпрям/], ["dyson-stylers", "Стайлеры", /styler|airwrap|стайлер/], ["dyson-air-purifiers", "Очистители воздуха", /air.?purif|purifier|очистител.*воздух/], ["dyson-vacuums", "Пылесосы", /vacuum|пылесос/]]);
  const consolesCategory = taxonomy.categories.find((item) => matches(item, /gaming|console|игров.*консол|консол/));
  const consoleRoot = node("consoles", null, "Консоли", 3, consolesCategory ? { type: "category", categoryId: consolesCategory.id } : null); items.push(consoleRoot);
  [["consoles-playstation", "Sony PlayStation", /playstation/], ["consoles-nintendo", "Nintendo Switch", /nintendo|switch/], ["consoles-xbox", "Xbox", /xbox/]].forEach(([id, label, pattern], index) => {
    const type = taxonomy.types.find((entry) => matches(entry, pattern as RegExp));
    items.push(node(id as string, "consoles", label as string, index, type ? filtersFor("", type.id) : null));
  });
  const accessoryRoot = taxonomy.categories.find((item) => matches(item, /accessor|аксесс/));
  items.push(node("accessories", null, "Аксессуары", 4, accessoryRoot ? { type: "category", categoryId: accessoryRoot.id } : null));
  [["accessories-glass", "Защитные стёкла", /screen.?protector|protective.?glass|защит.*ст[ёе]кл/], ["accessories-cases", "Чехлы", /(^|[-\s])case(s)?($|[-\s])|cover|чехл/], ["accessories-charging", "Зарядные устройства и кабели", /charg|cable|заряд|кабел/], ["accessories-other", "Другие аксессуары", /accessor|аксесс/]].forEach(([id, label, pattern], index) => {
    const category = taxonomy.categories.find((entry) => entry.parentId === accessoryRoot?.id && matches(entry, pattern as RegExp));
    const type = taxonomy.types.find((entry) => matches(entry, pattern as RegExp));
    const action = id === "accessories-other"
      ? accessoryRoot ? { type: "category" as const, categoryId: accessoryRoot.id } : null
      : category ? { type: "category" as const, categoryId: category.id } : type ? filtersFor("", type.id) : null;
    items.push(node(id as string, "accessories", label as string, index, action));
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

export function resolveCatalogMenu(
  savedConfig: CatalogMenuConfig | null,
  taxonomy: MenuTaxonomy,
  legacyBanners: unknown,
  legacyMappings: Array<{ legacyProductTypeId: string; globalProductTypeId: string }>,
): CatalogMenuConfig {
  const defaults = createDefaultCatalogMenu(taxonomy, legacyBanners);
  const defaultById = new Map(defaults.items.map((item) => [item.id, item]));
  const config = savedConfig
    ? {
        ...savedConfig,
        items: savedConfig.items.map((item) => {
          const fallback = defaultById.get(item.id);
          return item.action === null && fallback?.action && fallback.parentId === item.parentId
            ? { ...item, action: fallback.action }
            : item;
        }),
      }
    : defaults;
  return mapCatalogMenuProductTypes(config, legacyMappings);
}

export function catalogMenuTree(config: CatalogMenuConfig, parentId: string | null = null): Array<CatalogMenuNode & { children: ReturnType<typeof catalogMenuTree> }> {
  return config.items.filter((item) => item.visible && item.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru")).map((item) => ({ ...item, children: catalogMenuTree(config, item.id) }));
}

export function findCatalogMenuNode(config: CatalogMenuConfig, id: string) {
  return config.items.find((item) => item.id === id) ?? null;
}
