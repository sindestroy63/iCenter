"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Grid2X2,
  List,
  PackageOpen,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useStoreState } from "./StoreState";
import {
  catalogAttributeLabel,
  productVariantImage,
  variantAttribute,
  type CatalogProductDto,
  type CatalogVariantDto,
} from "./catalogClient";
import {
  compareMemoryValues,
  dictionaryValuesMatch,
  normalizeMemory,
} from "@/lib/product-dictionaries";
import { catalogColorHex, catalogColorLabel } from "@/lib/catalog-colors";
import {
  catalogSearchProductIdentityMatches,
  expandCatalogSearchQuery,
  normalizeCatalogSearchQuery,
} from "@/lib/catalog-search";
import CatalogProductCard from "./CatalogProductCard";
import ColorName from "./ColorName";
import { catalogSectionTitle } from "@/lib/catalog-section-context";
import { catalogProductCategoryHref } from "@/lib/catalog-menu";
import { catalogProductMinPrices, catalogSortFromQuery, catalogSortQueryParam, compareCatalogPriceEntries, DEFAULT_CATALOG_SORT, type CatalogSort as CatalogSortValue } from "@/lib/catalog-sort";

async function loadCatalogProducts(
  city: string,
  signal: AbortSignal,
  filters?: URLSearchParams,
): Promise<CatalogProductDto[]> {
  const all: CatalogProductDto[] = [];
  for (let offset = 0; offset <= 10000; offset += 100) {
    const params = new URLSearchParams(filters);
    params.set("city", city);
    params.set("limit", "100");
    params.set("offset", String(offset));
    const response = await fetch(`/api/catalog/products?${params}`, {
      signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Catalog metadata request failed");
    const body = (await response.json()) as { data: CatalogProductDto[] };
    const page = Array.isArray(body.data) ? body.data : [];
    all.push(...page);
    if (page.length < 100) break;
  }
  return all;
}

type DynamicAttributeFacet = { code: string; label: string; values: string[] };
type SelectedDynamicAttributes = Record<string, string[]>;

const STANDARD_ATTRIBUTE_FILTERS = new Set([
  "color",
  "storage",
  "memory",
  "ram",
  "sim",
  "simType",
  "connectivity",
]);

function normalizeAttributeValue(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

function readDynamicAttributes(searchParams: URLSearchParams): SelectedDynamicAttributes {
  const selected: SelectedDynamicAttributes = {};
  for (const entry of searchParams.getAll("attribute")) {
    const separator = entry.indexOf(":");
    if (separator <= 0) continue;
    const code = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim().replace(/\s+/g, " ");
    if (!code || !value || STANDARD_ATTRIBUTE_FILTERS.has(code)) continue;
    const values = selected[code] ?? [];
    if (!values.some((current) => normalizeAttributeValue(current) === normalizeAttributeValue(value))) values.push(value);
    selected[code] = values;
  }
  return selected;
}

function appendDynamicAttributes(params: URLSearchParams, selected: SelectedDynamicAttributes) {
  for (const [code, values] of Object.entries(selected)) {
    for (const value of values) params.append("attribute", `${code}:${value}`);
  }
}

type CatalogEntry = { product: CatalogProductDto; variant: CatalogVariantDto };
type CatalogMenuChild = { id: string; parentId: string | null; title: string; description?: string; visible: boolean; href: string | null; action: { type: "url"; href: string } | { type: "category"; categoryId: string } | { type: "group"; groupId: string } | { type: "filters"; rules: Array<{ field: "brand" | "type" | "category" | "model" | "tradeIn"; value: string | true }> } | null; productIds?: string[]; filters?: { brand?: string; type?: string; category?: string | null; modelId?: string } | null; children: CatalogMenuChild[]; banner?: { imageUrl: string | null; alt?: string } | null };
type CatalogMenuSibling = { id: string; title: string; href: string | null; banner?: { imageUrl: string | null; alt?: string } | null };
type CatalogModelNavigation = { typeHref: string; models: CatalogMenuSibling[]; selectedId: string | null };

function catalogEntries(products: CatalogProductDto[]): CatalogEntry[] {
  const seen = new Set<string>();
  return products.flatMap((product) =>
    product.variants.flatMap((variant) => {
      if (seen.has(variant.id)) return [];
      seen.add(variant.id);
      return [{ product, variant }];
    }),
  );
}

function ProductTile({ entry, categoryHref }: { entry: CatalogEntry; categoryHref?: string | null }) {
  const { city } = useStoreState();
  return (
    <CatalogProductCard
      product={entry.product}
      variantId={entry.variant.id}
      city={city}
      categoryHref={categoryHref}
      layout="catalog"
    />
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className={`filter-group${expanded ? " expanded" : ""}`}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <strong>{title}</strong>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div className="filter-group-panel">
        <div>{children}</div>
      </div>
    </section>
  );
}

const sortOptions = [
  ["priceAsc", "Сначала дешёвые"],
  ["priceDesc", "Сначала дорогие"],
  ["name", "По названию"],
  ["category", "По категории"],
  ["new", "Сначала новинки"],
] as const;

function CatalogSort({
  value,
  onChange,
}: {
  value: CatalogSortValue;
  onChange: (value: CatalogSortValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      sortOptions.findIndex(([option]) => option === value),
    ),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel =
    sortOptions.find(([option]) => option === value)?.[1] ?? sortOptions[0][1];
  useEffect(() => {
    setActiveIndex(
      Math.max(
        0,
        sortOptions.findIndex(([option]) => option === value),
      ),
    );
  }, [value]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const choose = (next: CatalogSortValue) => {
    onChange(next);
    setOpen(false);
  };
  return (
    <div
      className={`catalog-sort${open ? " open" : ""}`}
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setOpen(true);
          setActiveIndex((index) =>
            event.key === "ArrowDown"
              ? Math.min(index + 1, sortOptions.length - 1)
              : Math.max(index - 1, 0),
          );
        }
        if (event.key === "Enter" && open) {
          event.preventDefault();
          choose(sortOptions[activeIndex][0]);
        }
      }}
    >
      <button
        className="catalog-sort-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ArrowUpDown size={16} aria-hidden="true" />
        <span>{selectedLabel}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="catalog-sort-menu"
          role="listbox"
          aria-label="Сортировка товаров"
        >
          {sortOptions.map(([option, label], index) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={value === option}
              className={activeIndex === index ? "active" : ""}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              <span>{label}</span>
              {value === option && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function variantPrice(variant: CatalogVariantDto) {
  const value = variant.price === null ? null : Number(variant.price);
  return Number.isFinite(value) ? value : null;
}

function entryMatchesSearch(entry: CatalogEntry, query: string) {
  const normalized = normalizeCatalogSearchQuery(query);
  if (!normalized) return true;
  const { product, variant } = entry;
  if (!catalogSearchProductIdentityMatches([product.brand.name, product.name, product.model, product.generation].filter(Boolean).join(" "), query)) return false;
  const haystack = normalizeCatalogSearchQuery(
    [
      product.name,
      product.brand.name,
      product.category.name,
      product.type.name,
      variant.sku,
      variant.label,
      variant.color?.name,
      variant.color?.nameRu,
      ...Object.values(variant.attributes ?? {}).filter(
        (value): value is string | number =>
          typeof value === "string" || typeof value === "number",
      ),
    ]
      .filter(Boolean)
      .join(" "),
  );
  return expandCatalogSearchQuery(normalized).some((candidate) =>
    candidate.split(" ").every((token) => haystack.includes(token)),
  );
}

function parsePrice(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized || !/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const price = Number(normalized);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function globalType(product: CatalogProductDto) {
  const source = `${product.type.slug} ${product.type.name}`.toLocaleLowerCase(
    "ru-RU",
  );
  if (/galaxy|iphone/.test(source))
    return { slug: "smartphone", name: "Смартфон" };
  if (/ipad|tablet|планшет/.test(source))
    return { slug: "tablet", name: "Планшет" };
  if (/playstation|console|консол/.test(source))
    return { slug: "console", name: "Игровая консоль" };
  if (/vacuum|пылесос|dyson/.test(source))
    return { slug: "vacuum", name: "Пылесос" };
  return null;
}

export default function CatalogView({
  query = "",
  title = "Каталог",
  brand = "",
  category = "",
  memory = "",
  color = "",
  sim = "",
  ram = "",
  typeFilter = "",
  section = "",
  menuItem = "",
  browse = "",
  modelId = "",
  scopeBrand = "",
  scopeCategory = "",
  scopeType = "",
}: {
  query?: string;
  title?: string;
  brand?: string;
  category?: string;
  memory?: string;
  color?: string;
  sim?: string;
  ram?: string;
  typeFilter?: string;
  section?: string;
  menuItem?: string;
  browse?: string;
  modelId?: string;
  scopeBrand?: string;
  scopeCategory?: string;
  scopeType?: string;
}) {
  const { city, toggleFavorite, isFavorite } = useStoreState();
  const pathname = usePathname();
  const isSearchPage = pathname === "/search";
  const [search, setSearch] = useState(isSearchPage ? query : "");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [sort, setSort] = useState<CatalogSortValue>(DEFAULT_CATALOG_SORT);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [urlReady, setUrlReady] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedCategory, setSelectedCategory] = useState(category);
  const [selectedBrand, setSelectedBrand] = useState(brand);
  const [selectedMemory, setSelectedMemory] = useState(memory);
  const [selectedColor, setSelectedColor] = useState(color);
  const [selectedSim, setSelectedSim] = useState(sim);
  const [selectedRam, setSelectedRam] = useState(ram);
  const [selectedType, setSelectedType] = useState(typeFilter);
  const [selectedConnectivity, setSelectedConnectivity] = useState("");
  const [selectedModelId, setSelectedModelId] = useState(modelId);
  const [selectedAvailability, setSelectedAvailability] = useState("");
  const [selectedDynamicAttributes, setSelectedDynamicAttributes] = useState<SelectedDynamicAttributes>({});
  const [products, setProducts] = useState<CatalogProductDto[]>([]);
  const [catalogUniverse, setCatalogUniverse] = useState<CatalogProductDto[]>(
    [],
  );
  const [catalogUniverseLoaded, setCatalogUniverseLoaded] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<[string, string][]>(
    [],
  );
  const [typeOptions, setTypeOptions] = useState<[string, string][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [brandOptions, setBrandOptions] = useState<[string, string][]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const [menuTitle, setMenuTitle] = useState("");
  const [menuScope, setMenuScope] = useState<{
    brand?: string;
    type?: string;
    category?: string;
    modelId?: string;
  } | null>(null);
  const [menuScopeLoaded, setMenuScopeLoaded] = useState(false);
  const [catalogMenu, setCatalogMenu] = useState<CatalogMenuChild[]>([]);
  const [menuCleared, setMenuCleared] = useState(false);
  const [menuNode, setMenuNode] = useState<{ id: string; title: string; description?: string; href: string | null; action?: CatalogMenuChild["action"]; filters?: { brand?: string; type?: string; category?: string | null; modelId?: string } | null; children: CatalogMenuChild[]; siblings: CatalogMenuSibling[]; parent: { title: string; href: string; filters?: CatalogMenuChild["filters"]; action?: CatalogMenuChild["action"] } | null; path: Array<{ id: string; title: string; href: string | null }>; modelNavigation: CatalogModelNavigation | null } | null>(null);
  const effectiveMenuItem = menuCleared ? "" : menuItem;
  const browsingChildren = Boolean(menuItem && browse === menuItem && menuNode?.filters?.type);
  const pageTitle = menuTitle || catalogSectionTitle(section) || title;

  useEffect(() => {
    setSearch(isSearchPage ? query : "");
  }, [isSearchPage, query]);
  useEffect(() => {
    setSelectedCategory(category);
  }, [category]);
  useEffect(() => {
    setSelectedBrand(brand);
  }, [brand]);
  useEffect(() => {
    setSelectedMemory(memory);
  }, [memory]);
  useEffect(() => {
    setSelectedColor(color);
  }, [color]);
  useEffect(() => {
    setSelectedSim(sim);
  }, [sim]);
  useEffect(() => {
    setSelectedRam(ram);
  }, [ram]);
  useEffect(() => {
    setSelectedType(typeFilter);
  }, [typeFilter]);
  useEffect(() => {
    const controller = new AbortController();
    setMenuScopeLoaded(false);
    setMenuNode(null);
    fetch(`/api/catalog/menu?city=${encodeURIComponent(city)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((body) => {
        type MenuScopeNode = CatalogMenuChild;
        const roots = Array.isArray(body.data) ? body.data as MenuScopeNode[] : [];
        setCatalogMenu(roots);
        const findPath = (nodes: MenuScopeNode[], path: MenuScopeNode[] = []): MenuScopeNode[] | null => { for (const node of nodes) { const next = [...path, node]; if (node.id === menuItem) return next; const nested = findPath(node.children ?? [], next); if (nested) return nested; } return null; };
        const normalizeBrand = (value: string | undefined) => value?.trim().toLocaleLowerCase("ru-RU") ?? "";
        const requestedBrand = normalizeBrand(brand);
        const nodeMatchesBrand = (node: MenuScopeNode): boolean => {
          const candidates = [node.filters?.brand, node.title].filter(Boolean).map((value) => normalizeBrand(value));
          if (candidates.some((value) => value === requestedBrand || value.includes(requestedBrand) || requestedBrand.includes(value))) return true;
          return false;
        };
        const findBrandPath = (nodes: MenuScopeNode[], path: MenuScopeNode[] = []): MenuScopeNode[] | null => { for (const node of nodes) { const next = [...path, node]; if (nodeMatchesBrand(node)) return next; const nested = findBrandPath(node.children ?? [], next); if (nested) return nested; } return null; };
        const path = menuItem ? findPath(roots) : brand ? findBrandPath(roots) : [];
        const node = path?.at(-1);
        const parentNode = path && path.length > 1 ? path[path.length - 2] : null;
        const grandparentNode = path && path.length > 2 ? path[path.length - 3] : null;
        const isTypeWithModels = (candidate: MenuScopeNode | null | undefined): candidate is MenuScopeNode => Boolean(
          candidate?.action?.type === "filters" && candidate.action.rules.some((rule) => rule.field === "brand") &&
          candidate.filters?.brand && (candidate.filters.type || candidate.filters.category) &&
          candidate.children.some((child) => child.visible && (child.action?.type === "group" || child.filters?.modelId || (child.action?.type === "filters" && child.action.rules.some((rule) => rule.field === "model")))),
        );
        const isModelTerminal = Boolean(
          node && parentNode && grandparentNode && node.children.length === 0 &&
          (node.action?.type === "group" || node.filters?.modelId || (node.action?.type === "filters" && node.action.rules.some((rule) => rule.field === "model"))) &&
          (parentNode.filters?.type || parentNode.filters?.category) && grandparentNode.filters?.brand &&
          parentNode.filters.brand === grandparentNode.filters.brand && !grandparentNode.filters.type && !grandparentNode.filters.category,
        );
        const parent = parentNode
          ? {
              title: isModelTerminal && grandparentNode ? grandparentNode.title : parentNode.title,
              href: isModelTerminal && grandparentNode
                ? `/catalog?menuItem=${encodeURIComponent(grandparentNode.id)}`
                : `/catalog?menuItem=${encodeURIComponent(parentNode.id)}&browse=${encodeURIComponent(parentNode.id)}`,
              filters: isModelTerminal && grandparentNode ? grandparentNode.filters : parentNode.filters,
              action: isModelTerminal && grandparentNode ? grandparentNode.action : parentNode.action,
            }
          : (node ? { title: "Каталог", href: "/catalog" } : null);
        const siblingSource = parentNode?.children ?? roots;
        const siblings = node ? siblingSource.filter((entry) => entry.id !== node.id).map((entry) => ({ id: entry.id, title: entry.title, href: entry.href, banner: entry.banner })) : [];
        const typeNode = isTypeWithModels(node) ? node : isTypeWithModels(parentNode) ? parentNode : null;
        const modelNavigation = typeNode ? {
          typeHref: typeNode.href ?? `/catalog?menuItem=${encodeURIComponent(typeNode.id)}`,
          models: typeNode.children.filter((child) => child.visible && (child.action?.type === "group" || child.filters?.modelId || (child.action?.type === "filters" && child.action.rules.some((rule) => rule.field === "model")))).map((child) => ({ id: child.id, title: child.title, href: child.href, banner: child.banner })),
          selectedId: node?.id === typeNode.id ? null : node?.id ?? null,
        } : null;
        setMenuNode(node
          ? { id: node.id, title: node.title, description: node.description, href: node.href, action: node.action, filters: node.filters, children: (node.children ?? []) as CatalogMenuChild[], siblings, parent, path: path!.map((entry) => ({ id: entry.id, title: entry.title, href: entry.href })), modelNavigation }
          : !menuItem && !brand ? { id: "catalog-root", title: "Каталог", description: "", href: null, children: roots as CatalogMenuChild[], siblings: [], parent: null, path: [], modelNavigation: null } : null);
        setMenuTitle(node?.title ?? "Каталог");
        setMenuScope(
          node?.filters
            ? {
                brand: node.filters.brand ?? undefined,
                type: node.filters.type ?? undefined,
                category: node.filters.category ?? undefined,
                modelId: node.filters.modelId ?? undefined,
              }
            : null,
        );
        setMenuScopeLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMenuTitle("Каталог");
          setCatalogMenu([]);
          setMenuScope(null);
          setMenuNode(!menuItem && !brand ? { id: "catalog-root", title: "Каталог", description: "", href: null, children: [], siblings: [], parent: null, path: [], modelNavigation: null } : null);
          setMenuScopeLoaded(true);
        }
      });
    return () => controller.abort();
  }, [city, menuItem, brand]);
  useEffect(() => {
    if (!menuItem || !menuScopeLoaded || !menuScope) return;
    setSelectedBrand(menuScope.brand ?? "");
    setSelectedType(menuScope.type ?? "");
    setSelectedCategory(menuScope.category ?? "");
    setSelectedModelId(menuScope.modelId ?? "");
  }, [menuItem, menuScopeLoaded, menuScope]);
  useEffect(() => {
    setMenuCleared(false);
    setSelectedBrand("");
    setSelectedType("");
    setSelectedCategory("");
    setSelectedModelId("");
    setSelectedMemory("");
    setSelectedColor("");
    setSelectedSim("");
    setSelectedRam("");
    setSelectedConnectivity("");
    setSelectedAvailability("");
    setMinPrice("");
    setMaxPrice("");
  }, [menuItem]);
  useEffect(() => { setSelectedModelId(modelId); }, [modelId]);
  useEffect(() => {
    if (!showSuggestions) return;
    const close = (event: PointerEvent) => {
      if (!searchRef.current?.contains(event.target as Node))
        setShowSuggestions(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [showSuggestions]);
  useEffect(() => {
    if (!mobileFilters) return;
    const previousOverflow = document.body.style.overflow;
    const media = window.matchMedia("(max-width: 900px)");
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileFilters(false);
    };
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) setMobileFilters(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    media.addEventListener("change", closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      media.removeEventListener("change", closeOnDesktop);
    };
  }, [mobileFilters]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSort(catalogSortFromQuery(params.get("sort")));
    setMinPrice(params.get("minPrice") ?? "");
    setMaxPrice(params.get("maxPrice") ?? "");
    setSelectedConnectivity(params.get("connectivity") ?? "");
    setSelectedAvailability(params.get("availability") ?? "");
    setSelectedDynamicAttributes(readDynamicAttributes(params));
    setUrlReady(true);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/catalog/categories", {
        signal: controller.signal,
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{
          data: { slug: string; name: string }[];
        }>;
      }),
      fetch("/api/catalog/product-types", {
        signal: controller.signal,
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{
          data: { slug: string; name: string }[];
        }>;
      }),
    ])
      .then(([categoryBody, typeBody]) => {
        setCategoryOptions(
          (categoryBody.data ?? []).map((item) => [item.slug, item.name]),
        );
        setTypeOptions(
          (typeBody.data ?? []).map((item) => [item.slug, item.name]),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCategoryOptions([]);
          setTypeOptions([]);
        }
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/catalog/brands", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Brands request failed");
        return response.json() as Promise<{
          data: { slug: string; name: string }[];
        }>;
      })
      .then((body) =>
        setBrandOptions(
          Array.isArray(body.data)
            ? body.data.map((item) => [item.slug, item.name])
            : [],
        ),
      )
      .catch(() => setBrandOptions([]));
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setCatalogUniverseLoaded(false);
    const filters = new URLSearchParams();
    if (isSearchPage && search.trim()) filters.set("q", search.trim());
    if (selectedCategory) filters.set("category", selectedCategory);
    if (selectedBrand) filters.set("brand", selectedBrand);
    if (selectedType) filters.set("type", selectedType);
    if (scopeBrand) filters.set("scopeBrand", scopeBrand);
    if (scopeCategory) filters.set("scopeCategory", scopeCategory);
    if (scopeType) filters.set("scopeType", scopeType);
    if (effectiveMenuItem) filters.set("menuItem", effectiveMenuItem);
    if (selectedModelId) filters.set("modelId", selectedModelId);
    loadCatalogProducts(city, controller.signal, filters)
      .then((data) => { setCatalogUniverse(data); setCatalogUniverseLoaded(true); })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError"))
          { setCatalogUniverse([]); setCatalogUniverseLoaded(true); }
      });
    return () => controller.abort();
  }, [city, isSearchPage, search, selectedCategory, selectedBrand, selectedType, scopeBrand, scopeCategory, scopeType, effectiveMenuItem, selectedModelId]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (isSearchPage && search.trim()) params.set("q", search.trim());
    if (selectedCategory) params.set("category", selectedCategory);
    if (selectedBrand)
      params.set(
        "brand",
        brandOptions.find(
          ([slug, name]) => slug === selectedBrand || name === selectedBrand,
        )?.[0] ?? selectedBrand,
      );
    if (selectedType) params.set("type", selectedType);
    if (scopeBrand) params.set("scopeBrand", scopeBrand);
    if (scopeCategory) params.set("scopeCategory", scopeCategory);
    if (scopeType) params.set("scopeType", scopeType);
    if (effectiveMenuItem) params.set("menuItem", effectiveMenuItem);
    if (selectedModelId) params.set("modelId", selectedModelId);
    if (selectedConnectivity) params.set("connectivity", selectedConnectivity);
    if (selectedMemory) params.set("memory", selectedMemory);
    if (selectedColor) params.set("color", selectedColor);
    if (selectedRam) params.set("ram", selectedRam);
    if (selectedSim) params.set("sim", selectedSim);
    appendDynamicAttributes(params, selectedDynamicAttributes);
    setLoading(true);
    setError(false);
    loadCatalogProducts(city, controller.signal, params)
      .then(setProducts)
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setProducts([]);
          setError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    city,
    isSearchPage,
    search,
    selectedCategory,
    selectedBrand,
    selectedType,
    selectedConnectivity,
    selectedMemory,
    selectedColor,
    selectedSim,
    selectedRam,
    selectedDynamicAttributes,
    effectiveMenuItem,
    selectedModelId,
    scopeBrand,
    scopeCategory,
    scopeType,
    brandOptions,
    retry,
  ]);

  useEffect(() => {
    if (!urlReady) return;
    const isSeoCatalogPath = pathname.startsWith("/catalog/");
    const params = new URLSearchParams();
    if (section) params.set("section", section);
    if (scopeBrand) params.set("scopeBrand", scopeBrand);
    if (scopeCategory) params.set("scopeCategory", scopeCategory);
    if (scopeType) params.set("scopeType", scopeType);
    if (!isSeoCatalogPath && effectiveMenuItem) params.set("menuItem", effectiveMenuItem);
    if (!isSeoCatalogPath && browsingChildren) params.set("browse", menuItem);
    if (!isSeoCatalogPath && selectedModelId) params.set("modelId", selectedModelId);
    if (isSearchPage && search.trim()) params.set("q", search.trim());
    if (selectedCategory) params.set("category", selectedCategory);
    if (selectedBrand) params.set("brand", selectedBrand);
    if (selectedType) params.set("type", selectedType);
    if (selectedMemory) params.set("memory", selectedMemory);
    if (selectedColor) params.set("color", selectedColor);
    if (selectedSim) params.set("sim", selectedSim);
    if (selectedRam) params.set("ram", selectedRam);
    if (selectedConnectivity) params.set("connectivity", selectedConnectivity);
    if (selectedAvailability) params.set("availability", selectedAvailability);
    appendDynamicAttributes(params, selectedDynamicAttributes);
    const min = parsePrice(minPrice);
    const max = parsePrice(maxPrice);
    if (min !== null) params.set("minPrice", String(min));
    if (max !== null) params.set("maxPrice", String(max));
    const sortParam = catalogSortQueryParam(sort);
    if (sortParam) params.set("sort", sortParam);
    const basePath = pathname === "/search" ? "/search" : isSeoCatalogPath ? pathname : "/catalog";
    const nextUrl = `${basePath}${params.size ? `?${params}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl)
      window.history.replaceState(null, "", nextUrl);
  }, [
    urlReady,
    pathname,
    section,
    effectiveMenuItem,
    browsingChildren,
    menuItem,
    selectedModelId,
    scopeBrand,
    scopeCategory,
    scopeType,
    isSearchPage,
    search,
    selectedCategory,
    selectedBrand,
    selectedType,
    selectedMemory,
    selectedColor,
    selectedSim,
    selectedRam,
    selectedConnectivity,
    selectedAvailability,
    selectedDynamicAttributes,
    minPrice,
    maxPrice,
    sort,
  ]);

  const optionProducts = effectiveMenuItem ? catalogUniverse : catalogUniverseLoaded ? catalogUniverse : products;
  const categories = useMemo(
    () =>
      categoryOptions.length
        ? categoryOptions
        : Array.from(
            new Map(
              optionProducts.map((p) => [p.category.slug, p.category.name]),
            ).entries(),
          ),
    [optionProducts, categoryOptions],
  );
  const brands = useMemo(
    () =>
      brandOptions.length
        ? brandOptions
        : Array.from(
            new Map(
              optionProducts.map((p) => [p.brand.slug, p.brand.name]),
            ).entries(),
          ),
    [optionProducts, brandOptions],
  );
  const memories = useMemo(
    () => {
      const options = new Map<string, string>();
      for (const value of optionProducts.flatMap((product) => product.variants.map((variant) => variantAttribute(variant, "storage")).filter(Boolean))) {
        const normalized = normalizeMemory(value);
        const key = normalized?.canonicalKey ?? value.trim().toLocaleLowerCase("ru-RU");
        if (!options.has(key)) options.set(key, normalized?.label ?? value.trim());
      }
      return Array.from(options.values()).sort(compareMemoryValues);
    },
    [optionProducts],
  );
  const colors = useMemo(
    () =>
      Array.from(
        new Map(
          optionProducts.flatMap((p) =>
            p.variants.flatMap((v) =>
              v.color ? [[v.color.id, v.color] as const] : [],
            ),
          ),
        ).values(),
      ).sort((a, b) =>
        catalogColorLabel(a).localeCompare(catalogColorLabel(b), "ru"),
      ),
    [optionProducts],
  );
  const sims = useMemo(
    () =>
      Array.from(
        new Set(
          optionProducts.flatMap((p) =>
            p.variants
              .map((v) => variantAttribute(v, "simType"))
              .filter(Boolean),
          ),
        ),
      ),
    [optionProducts],
  );
  const rams = useMemo(
    () =>
      Array.from(
        new Set(
          optionProducts.flatMap((p) =>
            p.variants.map((v) => variantAttribute(v, "ram")).filter(Boolean),
          ),
        ),
      ).sort(compareMemoryValues),
    [optionProducts],
  );
  const types = useMemo(
    () =>
      Array.from(
        new Map(
          optionProducts
            .map(globalType)
            .filter(
              (item): item is NonNullable<ReturnType<typeof globalType>> =>
                Boolean(item),
            )
            .map((item) => [item.slug, item.name]),
        ).entries(),
      ),
    [optionProducts],
  );
  const dynamicAttributeFacets = useMemo<DynamicAttributeFacet[]>(() => {
    const facets = new Map<string, { label: string; values: Map<string, string> }>();
    for (const product of optionProducts) {
      for (const variant of product.variants) {
        for (const [code, rawValue] of Object.entries(variant.attributes ?? {})) {
          if (STANDARD_ATTRIBUTE_FILTERS.has(code)) continue;
          if (typeof rawValue !== "string" && typeof rawValue !== "number" && typeof rawValue !== "boolean") continue;
          const value = String(rawValue).trim().replace(/\s+/g, " ");
          if (!value) continue;
          const facet = facets.get(code) ?? {
            label: variant.attributeLabels?.[code]?.trim() || catalogAttributeLabel(code),
            values: new Map<string, string>(),
          };
          const normalized = normalizeAttributeValue(value);
          if (!facet.values.has(normalized)) facet.values.set(normalized, value);
          facets.set(code, facet);
        }
      }
    }
    return Array.from(facets, ([code, facet]) => ({
      code,
      label: facet.label,
      values: Array.from(facet.values.values()).sort((left, right) => left.localeCompare(right, "ru", { numeric: true })),
    })).filter((facet) => facet.values.length > 0).sort((left, right) => left.label.localeCompare(right.label, "ru"));
  }, [optionProducts]);
  const connectivityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          optionProducts.flatMap((p) =>
            p.variants
              .map((v) => variantAttribute(v, "connectivity"))
              .filter(Boolean),
          ),
        ),
      ).sort((a, b) => a.localeCompare(b, "ru")),
    [optionProducts],
  );
  const availabilityOptions = useMemo(() => Array.from(new Set(optionProducts.flatMap((product) => product.variants.map((variant) => variant.availability).filter(Boolean)))), [optionProducts]);
  const productEntries = useMemo(() => catalogEntries(products), [products]);
  const universeEntries = useMemo(
    () => catalogEntries(optionProducts),
    [optionProducts],
  );
  const hasPriceFacet = universeEntries.some(({ variant }) => variantPrice(variant) !== null);
  const hasMemoryFacet = memories.length > 1;
  const hasColorFacet = colors.length > 1;
  const hasSimFacet = sims.length > 1;
  const hasRamFacet = rams.length > 1;
  const hasConnectivityFacet = connectivityOptions.length > 1;
  const hasAvailabilityFacet = availabilityOptions.filter((value) => value !== "UNSPECIFIED").length > 1;
  const hasCatalogFacets = hasPriceFacet || hasMemoryFacet || hasColorFacet || hasSimFacet || hasRamFacet || hasConnectivityFacet || hasAvailabilityFacet || dynamicAttributeFacets.length > 0 || (!effectiveMenuItem && (categories.length > 1 || brands.length > 1 || types.length > 1));
  const minPriceValue = parsePrice(minPrice);
  const maxPriceValue = parsePrice(maxPrice);
  const invalidPriceRange =
    minPriceValue !== null &&
    maxPriceValue !== null &&
    minPriceValue > maxPriceValue;
  const filtered = useMemo(
    () => {
      const entries = productEntries.filter(({ product, variant }) => {
          if (!entryMatchesSearch({ product, variant }, search)) return false;
          if (
            selectedMemory &&
            !dictionaryValuesMatch(
              "memory",
              variantAttribute(variant, "storage"),
              selectedMemory,
            )
          )
            return false;
          if (
            selectedColor &&
            variant.color?.name !== selectedColor &&
            variant.color?.id !== selectedColor &&
            variant.color?.slug !== selectedColor
          )
            return false;
          if (
            selectedRam &&
            !dictionaryValuesMatch(
              "ram",
              variantAttribute(variant, "ram"),
              selectedRam,
            )
          )
            return false;
          if (
            selectedSim &&
            !dictionaryValuesMatch(
              "sim",
              variantAttribute(variant, "simType"),
              selectedSim,
            )
          )
            return false;
          if (
            selectedConnectivity &&
            variantAttribute(variant, "connectivity") !== selectedConnectivity
          )
            return false;
          if (
            selectedAvailability &&
            variant.availability !== selectedAvailability
          )
            return false;
          if (Object.entries(selectedDynamicAttributes).some(([code, values]) => {
            const rawActual = variant.attributes?.[code];
            const actual = typeof rawActual === "string" || typeof rawActual === "number" || typeof rawActual === "boolean" ? String(rawActual) : "";
            return values.length > 0 && !values.some((value) => normalizeAttributeValue(value) === normalizeAttributeValue(actual));
          })) return false;
          const price = variantPrice(variant);
          if (
            invalidPriceRange ||
            (minPriceValue !== null &&
              (price === null || price < minPriceValue)) ||
            (maxPriceValue !== null &&
              (price === null || price > maxPriceValue))
          )
            return false;
          return true;
        });
      const productPrices = catalogProductMinPrices(entries);
      return entries.sort((a, b) => {
          if (sort === "name")
            return search.trim()
              ? 0
              : a.product.name.localeCompare(b.product.name, "ru") ||
                  a.variant.label.localeCompare(b.variant.label, "ru");
          if (sort === "category")
            return (
              a.product.category.name.localeCompare(
                b.product.category.name,
                "ru",
              ) || a.product.name.localeCompare(b.product.name, "ru")
            );
          if (sort === "priceAsc" || sort === "priceDesc")
            return compareCatalogPriceEntries(a, b, sort, productPrices);
          return (
            Number(b.product.isNew) - Number(a.product.isNew) ||
            a.product.name.localeCompare(b.product.name, "ru")
          );
        });
    },
    [
      productEntries,
      search,
      selectedType,
      selectedConnectivity,
      selectedAvailability,
      selectedMemory,
      selectedColor,
      selectedSim,
      selectedRam,
      selectedDynamicAttributes,
      minPriceValue,
      maxPriceValue,
      invalidPriceRange,
      sort,
    ],
  );
  const suggestions = filtered.slice(0, 4);
  const reset = () => {
    setSearch("");
    setMenuCleared(false);
    setSelectedCategory(menuScope?.category ?? "");
    setSelectedBrand(menuScope?.brand ?? "");
    setSelectedType(menuScope?.type ?? "");
    setSelectedModelId(menuScope?.modelId ?? "");
    setSelectedConnectivity("");
    setSelectedAvailability("");
    setSelectedMemory("");
    setSelectedColor("");
    setSelectedSim("");
    setSelectedRam("");
    setSelectedDynamicAttributes({});
    setMinPrice("");
    setMaxPrice("");
    setShowSuggestions(false);
  };
  const chooseBrand = (value: string) => {
    if (menuScope?.brand && value !== menuScope.brand) setMenuCleared(true);
    setSelectedBrand(value);
    setSelectedDynamicAttributes({});
  };
  const chooseType = (value: string) => {
    if (menuScope?.type && value !== menuScope.type) setMenuCleared(true);
    setSelectedType(value);
    setSelectedDynamicAttributes({});
  };
  const chooseCategory = (value: string) => {
    if (menuScope?.category && value !== menuScope.category)
      setMenuCleared(true);
    setSelectedCategory(value);
    setSelectedDynamicAttributes({});
  };
  const toggleDynamicAttribute = (code: string, value: string) => {
    setSelectedDynamicAttributes((current) => {
      const selected = current[code] ?? [];
      const normalized = normalizeAttributeValue(value);
      const nextValues = selected.some((entry) => normalizeAttributeValue(entry) === normalized)
        ? selected.filter((entry) => normalizeAttributeValue(entry) !== normalized)
        : [...selected, value];
      const next = { ...current };
      if (nextValues.length) next[code] = nextValues;
      else delete next[code];
      return next;
    });
  };
  const clearSearch = () => {
    setSearch("");
    setShowSuggestions(true);
  };
  const tile = (entry: CatalogEntry) => (
    <ProductTile key={entry.variant.id} entry={entry} categoryHref={catalogProductCategoryHref(catalogMenu, entry.product)} />
  );
  const visualCatalog = Boolean(
    menuScopeLoaded && menuNode &&
      !menuNode.modelNavigation &&
      (menuNode.id === "catalog-root" || menuNode.children.length > 0 || Boolean(brand && menuNode.path.length === 1)) &&
      !browsingChildren &&
      !search.trim() &&
      !menuCleared &&
      !category && !typeFilter && !modelId && !memory && !color && !sim && !ram &&
      (!selectedBrand || Boolean(menuItem) || Boolean(brand && !menuItem && menuNode.path.length === 1)) &&
      !selectedMemory && !selectedColor && !selectedSim && !selectedRam &&
      Object.keys(selectedDynamicAttributes).length === 0 &&
      !selectedConnectivity && !selectedAvailability && !minPrice.trim() && !maxPrice.trim(),
  );
  const menuPending = Boolean(menuItem && (!menuScopeLoaded || !menuNode || menuNode.id !== menuItem));
  const siblingNav = menuNode && menuNode.siblings.length > 0 ? <nav className="catalog-sibling-nav" aria-label="Соседние разделы"><div className="catalog-sibling-track">{menuNode.siblings.map((sibling) => sibling.href ? <Link className="catalog-sibling-card" href={sibling.href} key={sibling.id}>{sibling.title}</Link> : <span className="catalog-sibling-card is-disabled" key={sibling.id} aria-disabled="true">{sibling.title}</span>)}</div></nav> : null;
  const parentNav = menuNode?.parent ? <Link className="catalog-parent-link" href={menuNode.parent.href}>← {menuNode.parent.title}</Link> : null;
  const modelSelection = menuNode?.modelNavigation;
  const modelNavigation = modelSelection ? <nav className="catalog-sibling-nav" aria-label="Модели"><div className="catalog-sibling-track"><Link className={`catalog-sibling-card${modelSelection.selectedId === null ? " active" : ""}`} href={modelSelection.typeHref} aria-current={modelSelection.selectedId === null ? "page" : undefined}>Все</Link>{modelSelection.models.map((model) => model.href ? <Link className={`catalog-sibling-card${modelSelection.selectedId === model.id ? " active" : ""}`} href={model.href} key={model.id} aria-current={modelSelection.selectedId === model.id ? "page" : undefined}>{model.title}</Link> : <span className="catalog-sibling-card is-disabled" key={model.id} aria-disabled="true">{model.title}</span>)}</div></nav> : null;

  return (
    <div className="catalog-page layout-container">
      <div className="catalog-heading">
        <div className="store-page-heading">
          <h1>{pageTitle}</h1>
          <p>Выбирайте технику и аксессуары по выгодным ценам</p>
        </div>
        {!visualCatalog && !menuPending && hasCatalogFacets && <button
          className="mobile-filter-btn"
          onClick={() => setMobileFilters((v) => !v)}
        >
          <SlidersHorizontal size={17} />
          Фильтры
        </button>}
      </div>
      {visualCatalog && !menuPending && menuNode && <section className="visual-catalog" aria-label="Разделы каталога">
        {(parentNav || siblingNav) && <div className="catalog-navigation-context">{parentNav}{siblingNav}</div>}
        {menuNode.children.length > 0 ? <div className="visual-catalog-grid">{menuNode.children.map((child) => child.href ? <Link className="visual-catalog-card" href={child.href} key={child.id}><span className="visual-catalog-card-media">{child.banner?.imageUrl ? <img src={child.banner.imageUrl} alt={child.banner.alt ?? ""} /> : <PackageOpen size={34} />}</span><span className="visual-catalog-card-overlay" /><strong className="visual-catalog-card-title">{child.title}</strong>{child.description && <small>{child.description}</small>}</Link> : <div className="visual-catalog-card" key={child.id} aria-disabled="true"><span className="visual-catalog-card-media">{child.banner?.imageUrl ? <img src={child.banner.imageUrl} alt={child.banner.alt ?? ""} /> : <PackageOpen size={34} />}</span><span className="visual-catalog-card-overlay" /><strong className="visual-catalog-card-title">{child.title}</strong>{child.description && <small>{child.description}</small>}</div>)}</div> : <div className="empty-state"><PackageOpen size={32} /><h2>Разделы пока не настроены</h2><p>В этом разделе нет доступных подразделов.</p></div>}
      </section>}
      {menuPending && <section className="catalog-loading-shell" aria-label="Загрузка каталога" aria-busy="true"><div className="catalog-loading-sidebar"><span /><span /><span /><span /></div><div className="catalog-loading-content"><span className="catalog-loading-toolbar" /><div className="catalog-loading-grid">{[1, 2, 3, 4].map((item) => <span key={item} />)}</div></div></section>}
      {!visualCatalog && !menuPending && <>
      {isSearchPage && <div
        className="catalog-search-row"
        ref={searchRef}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setShowSuggestions(false);
        }}
      >
        <label className="catalog-search">
          <Search size={19} />
          <input
            value={search}
            aria-expanded={showSuggestions}
            aria-controls="catalog-search-suggestions"
            autoComplete="off"
            onFocus={() => setShowSuggestions(true)}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowSuggestions(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" || e.key === "Enter")
                setShowSuggestions(false);
            }}
            placeholder="Поиск товаров"
          />
          {search && (
            <button
              type="button"
              aria-label="Очистить поиск"
              onClick={clearSearch}
            >
              <X size={17} />
            </button>
          )}
        </label>
        {showSuggestions && (
          <div
            className="autocomplete"
            id="catalog-search-suggestions"
            role="listbox"
          >
            <div className="autocomplete-products">
              <strong>
                {search.trim() ? "Результаты поиска" : "Товары каталога"}
              </strong>
              {loading ? (
                <div className="catalog-suggestion-state">Поиск…</div>
              ) : suggestions.length ? (
                suggestions.map(({ product, variant }) => {
                  const price = variantPrice(variant);
                  const oldPrice = price !== null && variant.oldPrice !== null ? Number(variant.oldPrice) : null;
                  const suggestionImage = productVariantImage(product, variant);
                  const structuredDescription = [
                    variant.color?.name,
                    variantAttribute(variant, "storage"),
                    variantAttribute(variant, "simType"),
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  const variantDescription =
                    structuredDescription ||
                    (product.brand.slug === "dyson"
                      ? product.category.name
                      : variant.label || product.category.name);
                  return (
                    <Link
                      href={`/product/${encodeURIComponent(product.slug)}?variant=${encodeURIComponent(variant.id)}`}
                      role="option"
                      aria-selected="false"
                      key={variant.id}
                      onClick={() => setShowSuggestions(false)}
                    >
                      <span className="suggestion-image">
                        {suggestionImage ? (
                          <img src={suggestionImage} alt="" />
                        ) : (
                          <PackageOpen size={18} />
                        )}
                      </span>
                      <span className="catalog-suggestion-copy">
                        <b>{product.name}</b>
                        <small>{variantDescription}</small>
                      </span>
                      <em className="catalog-suggestion-price">
                        {price === null
                          ? "Уточнить цену"
                          : <>{price.toLocaleString("ru-RU")} ₽{oldPrice !== null && Number.isFinite(oldPrice) && <s>{oldPrice.toLocaleString("ru-RU")} ₽</s>}</>}
                      </em>
                      <span className="suggestion-arrow">›</span>
                    </Link>
                  );
                })
              ) : (
                <div className="catalog-suggestion-state">
                  <PackageOpen size={18} />
                  <span>Товары не найдены</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>}
      {(parentNav || modelNavigation || siblingNav) && <div className="catalog-navigation-context">{parentNav}{modelNavigation ?? siblingNav}</div>}
      <div className={`catalog-layout${hasCatalogFacets ? "" : " filterless"}`}>
        {mobileFilters && (
          <button
            type="button"
            className="filters-backdrop"
            aria-label="Закрыть фильтры"
            onClick={() => setMobileFilters(false)}
          />
        )}
        <div className="catalog-sidebar-column">
          <div className="catalog-toolbar">
            <CatalogSort value={sort} onChange={setSort} />
            <div className="view-toggle">
              <button
                className={view === "grid" ? "active" : ""}
                onClick={() => setView("grid")}
                aria-label="Сетка"
                aria-pressed={view === "grid"}
              >
                <Grid2X2 size={18} />
              </button>
              <button
                className={view === "list" ? "active" : ""}
                onClick={() => setView("list")}
                aria-label="Список"
                aria-pressed={view === "list"}
              >
                <List size={18} />
              </button>
            </div>
          </div>
        {hasCatalogFacets && <aside className={`filters ${mobileFilters ? "filters-open" : ""}`}>
          <div className="filters-title">
            <strong>Фильтры</strong>
            <button
              onClick={() => setMobileFilters(false)}
              aria-label="Закрыть фильтры"
            >
              <X size={18} />
            </button>
          </div>
          {!effectiveMenuItem && categories.length > 1 && <FilterGroup title="Категория">
            <div className="filter-list">
              <label className={!selectedCategory ? "selected" : ""}>
                <input
                  type="radio"
                  name="category"
                  checked={!selectedCategory}
                  onChange={() => chooseCategory("")}
                />
                Все результаты <span>{universeEntries.length}</span>
              </label>
              {categories.map(([slug, name]) => (
                <label
                  className={selectedCategory === slug ? "selected" : ""}
                  key={slug}
                >
                  <input
                    type="radio"
                    name="category"
                    checked={selectedCategory === slug}
                    onChange={() => chooseCategory(slug)}
                  />
                  {name}
                  <span>
                    {
                      universeEntries.filter((entry) =>
                        slug === "trade-in"
                          ? entry.product.isUsed
                          : entry.product.category.slug === slug,
                      ).length
                    }
                  </span>
                </label>
              ))}
            </div>
          </FilterGroup>}
          {!effectiveMenuItem && brands.length > 1 && <FilterGroup title="Бренд">
            <div className="check-list">
              <label>
                <input
                  type="radio"
                  name="brand"
                  checked={!selectedBrand}
                  onChange={() => chooseBrand("")}
                />
                Все бренды
              </label>
              {brands.map(([slug, name]) => (
                <label key={slug}>
                  <input
                    type="radio"
                    name="brand"
                    checked={selectedBrand === slug || selectedBrand === name}
                    onChange={() => chooseBrand(slug)}
                  />
                  {name}
                </label>
              ))}
            </div>
          </FilterGroup>}
          {!effectiveMenuItem && types.length > 1 && <FilterGroup title="Тип товара">
            <div className="check-list">
              <label>
                <input
                  type="radio"
                  name="type"
                  checked={!selectedType}
                  onChange={() => chooseType("")}
                />
                Все типы
              </label>
              {types.map(([slug, name]) => (
                <label key={slug}>
                  <input
                    type="radio"
                    name="type"
                    checked={selectedType === slug}
                    onChange={() => chooseType(slug)}
                  />
                  {name}
                </label>
              ))}
            </div>
          </FilterGroup>}
          {[
            [
              "Объём памяти",
              "memory",
              selectedMemory,
              setSelectedMemory,
              memories,
            ],
            ["SIM", "sim", selectedSim, setSelectedSim, sims],
          ].filter((entry) => (entry[4] as string[]).length > 1).map(([titleText, dictionary, selected, setter, values]) => (
            <FilterGroup key={titleText as string} title={titleText as string}>
              <div className="check-list">
                <label>
                  <input
                    type="radio"
                    name={titleText as string}
                    checked={!selected}
                    onChange={() => (setter as (v: string) => void)("")}
                  />
                  Любой
                </label>
                {(values as string[]).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name={titleText as string}
                      checked={
                        Boolean(selected) &&
                        dictionaryValuesMatch(
                          dictionary as "memory" | "sim",
                          selected as string,
                          value,
                        )
                      }
                      onChange={() => (setter as (v: string) => void)(value)}
                    />
                    {value}
                  </label>
                ))}
              </div>
            </FilterGroup>
          ))}
          {hasColorFacet && <FilterGroup title="Цвет">
            <div className="check-list color-filter-list">
              <label>
                <input
                  type="radio"
                  name="Цвет"
                  checked={!selectedColor}
                  onChange={() => setSelectedColor("")}
                />
                Любой
              </label>
              {colors.map((color) => {
                const hex = catalogColorHex(color);
                return (
                  <label key={color.id}>
                    <input
                      type="radio"
                      name="Цвет"
                      checked={
                        selectedColor === color.name ||
                        selectedColor === color.id
                      }
                      onChange={() => setSelectedColor(color.name)}
                    />
                    <i
                      className={
                        hex
                          ? "catalog-color-swatch"
                          : "catalog-color-swatch neutral-color"
                      }
                      style={hex ? { background: hex } : undefined}
                      aria-hidden="true"
                    />
                    <ColorName color={color} compact />
                  </label>
                );
              })}
            </div>
          </FilterGroup>}
          {hasRamFacet && <FilterGroup title="RAM">
            <div className="check-list">
              <label>
                <input
                  type="radio"
                  name="ram"
                  checked={!selectedRam}
                  onChange={() => setSelectedRam("")}
                />
                Любой
              </label>
              {rams.map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="ram"
                    checked={selectedRam === value}
                    onChange={() => setSelectedRam(value)}
                  />
                  {value}
                </label>
              ))}
            </div>
          </FilterGroup>}
          {hasConnectivityFacet && <FilterGroup title="Подключение">
            <div className="check-list">
              <label>
                <input
                  type="radio"
                  name="connectivity"
                  checked={!selectedConnectivity}
                  onChange={() => setSelectedConnectivity("")}
                />
                Любое
              </label>
              {connectivityOptions.map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="connectivity"
                    checked={selectedConnectivity === value}
                    onChange={() => setSelectedConnectivity(value)}
                  />
                  {value}
                </label>
              ))}
            </div>
          </FilterGroup>}
          {dynamicAttributeFacets.map((facet) => {
            const selectedValues = selectedDynamicAttributes[facet.code] ?? [];
            return <FilterGroup key={facet.code} title={facet.label}>
              <div className="check-list">
                {facet.values.map((value) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      name={`attribute-${facet.code}`}
                      checked={selectedValues.some((entry) => normalizeAttributeValue(entry) === normalizeAttributeValue(value))}
                      onChange={() => toggleDynamicAttribute(facet.code, value)}
                    />
                    {value}
                  </label>
                ))}
              </div>
            </FilterGroup>;
          })}
          {hasAvailabilityFacet && <FilterGroup title="Наличие">
            <div className="check-list">
              <label>
                <input
                  type="radio"
                  name="availability"
                  checked={!selectedAvailability}
                  onChange={() => setSelectedAvailability("")}
                />
                Любое
              </label>
              <label>
                <input
                  type="radio"
                  name="availability"
                  checked={selectedAvailability === "IN_STOCK"}
                  onChange={() => setSelectedAvailability("IN_STOCK")}
                />
                В наличии
              </label>
              <label>
                <input
                  type="radio"
                  name="availability"
                  checked={selectedAvailability === "PREORDER"}
                  onChange={() => setSelectedAvailability("PREORDER")}
                />
                Под заказ
              </label>
              <label>
                <input
                  type="radio"
                  name="availability"
                  checked={selectedAvailability === "OUT_OF_STOCK"}
                  onChange={() => setSelectedAvailability("OUT_OF_STOCK")}
                />
                Нет в наличии
              </label>
            </div>
          </FilterGroup>}
          {hasPriceFacet && <FilterGroup title="Цена, ₽">
            <div className="catalog-price-filter">
              <label>
                От
                <input
                  type="text"
                  inputMode="decimal"
                  value={minPrice}
                  aria-invalid={
                    Boolean(minPrice.trim()) && minPriceValue === null
                  }
                  onChange={(event) => setMinPrice(event.target.value)}
                  placeholder="0"
                />
              </label>
              <label>
                До
                <input
                  type="text"
                  inputMode="decimal"
                  value={maxPrice}
                  aria-invalid={
                    Boolean(maxPrice.trim()) && maxPriceValue === null
                  }
                  onChange={(event) => setMaxPrice(event.target.value)}
                  placeholder="Без лимита"
                />
              </label>
              {((Boolean(minPrice.trim()) && minPriceValue === null) ||
                (Boolean(maxPrice.trim()) && maxPriceValue === null)) && (
                <small>Введите цену числом</small>
              )}
              {invalidPriceRange && (
                <small role="alert">Минимальная цена выше максимальной</small>
              )}
            </div>
          </FilterGroup>}
          <button className="filter-reset" onClick={reset}>
            Сбросить фильтры
          </button>
        </aside>}
        </div>
        <section className="catalog-results">
          {error ? (
            <div className="empty-state">
              <h2>Не удалось загрузить каталог</h2>
              <p>Проверьте соединение и попробуйте снова.</p>
              <button onClick={() => setRetry((value) => value + 1)}>
                Повторить
              </button>
            </div>
          ) : loading ? (
            <div className="loading-state">Загрузка каталога…</div>
          ) : filtered.length ? (
            <div
              className={`catalog-grid ${view === "list" ? "list-view" : ""}`}
            >
              {filtered.map(tile)}
            </div>
          ) : (
            <div className="empty-state">
              <Search size={32} />
              <h2>Ничего не найдено</h2>
              <p>Для выбранного города подходящих товаров нет.</p>
              <button onClick={reset}>Сбросить фильтры</button>
            </div>
          )}
        </section>
      </div>
      </>}
    </div>
  );
}
