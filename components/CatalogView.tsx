"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpDown, Check, ChevronDown, Grid2X2, List, PackageOpen, Search, SlidersHorizontal, X } from "lucide-react";
import { useStoreState } from "./StoreState";
import { selectCatalogDisplayVariant, variantAttribute, type CatalogProductDto } from "./catalogClient";
import { compareMemoryValues } from "@/lib/product-dictionaries";
import { catalogColorHex, catalogColorLabel } from "@/lib/catalog-colors";
import CatalogProductCard from "./CatalogProductCard";
import ColorName from "./ColorName";

async function loadCatalogUniverse(city: string, signal: AbortSignal): Promise<CatalogProductDto[]> {
  const all: CatalogProductDto[] = [];
  for (let offset = 0; offset <= 10000; offset += 100) {
    const response = await fetch(`/api/catalog/products?city=${encodeURIComponent(city)}&limit=100&offset=${offset}`, { signal, cache: "no-store" });
    if (!response.ok) throw new Error("Catalog metadata request failed");
    const body = await response.json() as { data: CatalogProductDto[] };
    const page = Array.isArray(body.data) ? body.data : [];
    all.push(...page);
    if (page.length < 100) break;
  }
  return all;
}

function ProductTile({ product }: { product: CatalogProductDto }) {
  const { city } = useStoreState();
  return <CatalogProductCard product={product} city={city} layout="catalog" />;
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <section className={`filter-group${expanded ? " expanded" : ""}`}><button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><strong>{title}</strong><ChevronDown size={16} aria-hidden="true" /></button><div className="filter-group-panel"><div>{children}</div></div></section>;
}

const sortOptions = [
  ["name", "По названию"],
  ["category", "По категории"],
  ["new", "Сначала новинки"],
  ["priceAsc", "Сначала дешёвые"],
  ["priceDesc", "Сначала дорогие"],
] as const;

function CatalogSort({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, sortOptions.findIndex(([option]) => option === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel = sortOptions.find(([option]) => option === value)?.[1] ?? sortOptions[0][1];
  useEffect(() => { setActiveIndex(Math.max(0, sortOptions.findIndex(([option]) => option === value))); }, [value]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const choose = (next: string) => { onChange(next); setOpen(false); };
  return <div className={`catalog-sort${open ? " open" : ""}`} ref={rootRef} onKeyDown={(event) => {
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActiveIndex((index) => event.key === "ArrowDown" ? Math.min(index + 1, sortOptions.length - 1) : Math.max(index - 1, 0)); }
    if (event.key === "Enter" && open) { event.preventDefault(); choose(sortOptions[activeIndex][0]); }
  }}>
    <button className="catalog-sort-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}><ArrowUpDown size={16} aria-hidden="true" /><span>{selectedLabel}</span><ChevronDown size={15} aria-hidden="true" /></button>
    {open && <div className="catalog-sort-menu" role="listbox" aria-label="Сортировка товаров">{sortOptions.map(([option, label], index) => <button key={option} type="button" role="option" aria-selected={value === option} className={activeIndex === index ? "active" : ""} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}><span>{label}</span>{value === option && <Check size={15} aria-hidden="true" />}</button>)}</div>}
  </div>;
}

function productMinPrice(product: CatalogProductDto) {
  return selectCatalogDisplayVariant(product).price;
}

function parsePrice(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized || !/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const price = Number(normalized);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function productCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "товаров";
  if (last === 1) return "товар";
  if (last >= 2 && last <= 4) return "товара";
  return "товаров";
}

function globalType(product: CatalogProductDto) {
  const source = `${product.type.slug} ${product.type.name}`.toLocaleLowerCase("ru-RU");
  if (/galaxy|iphone/.test(source)) return { slug: "smartphone", name: "Смартфон" };
  if (/ipad|tablet|планшет/.test(source)) return { slug: "tablet", name: "Планшет" };
  if (/playstation|console|консол/.test(source)) return { slug: "console", name: "Игровая консоль" };
  if (/vacuum|пылесос|dyson/.test(source)) return { slug: "vacuum", name: "Пылесос" };
  return null;
}

export default function CatalogView({ query = "", title = "Каталог", brand = "", category = "", memory = "", color = "", sim = "", ram = "", typeFilter = "" }: { query?: string; title?: string; brand?: string; category?: string; memory?: string; color?: string; sim?: string; ram?: string; typeFilter?: string }) {
  const { city, toggleFavorite, isFavorite } = useStoreState();
  const [search, setSearch] = useState(query);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [sort, setSort] = useState("name");
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
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedConnectivity, setSelectedConnectivity] = useState("");
  const [products, setProducts] = useState<CatalogProductDto[]>([]);
  const [catalogUniverse, setCatalogUniverse] = useState<CatalogProductDto[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<[string, string][]>([]);
  const [typeOptions, setTypeOptions] = useState<[string, string][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const pathname = usePathname();
  const [brandOptions, setBrandOptions] = useState<[string, string][]>([]);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSearch(query); }, [query]);
  useEffect(() => { setSelectedCategory(category); }, [category]);
  useEffect(() => { setSelectedBrand(brand); }, [brand]);
  useEffect(() => { setSelectedMemory(memory); }, [memory]);
  useEffect(() => { setSelectedColor(color); }, [color]);
  useEffect(() => { setSelectedSim(sim); }, [sim]);
  useEffect(() => { setSelectedRam(ram); }, [ram]);
  useEffect(() => { setSelectedType(typeFilter); }, [typeFilter]);
  useEffect(() => {
    if (!showSuggestions) return;
    const close = (event: PointerEvent) => { if (!searchRef.current?.contains(event.target as Node)) setShowSuggestions(false); };
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
    const initialSort = params.get("sort");
    if (["name", "category", "new", "priceAsc", "priceDesc"].includes(initialSort ?? "")) setSort(initialSort!);
    setMinPrice(params.get("minPrice") ?? "");
    setMaxPrice(params.get("maxPrice") ?? "");
    setSelectedModel(params.get("productModel") ?? "");
    setSelectedConnectivity(params.get("connectivity") ?? "");
    setUrlReady(true);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/catalog/categories", { signal: controller.signal, cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ data: { slug: string; name: string }[] }>; }),
      fetch("/api/catalog/product-types", { signal: controller.signal, cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ data: { slug: string; name: string }[] }>; }),
    ]).then(([categoryBody, typeBody]) => {
      setCategoryOptions((categoryBody.data ?? []).map((item) => [item.slug, item.name]));
      setTypeOptions((typeBody.data ?? []).map((item) => [item.slug, item.name]));
    }).catch(() => { if (!controller.signal.aborted) { setCategoryOptions([]); setTypeOptions([]); } });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/catalog/brands", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error("Brands request failed"); return response.json() as Promise<{ data: { slug: string; name: string }[] }>; })
      .then((body) => setBrandOptions(Array.isArray(body.data) ? body.data.map((item) => [item.slug, item.name]) : []))
      .catch(() => setBrandOptions([]));
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadCatalogUniverse(city, controller.signal)
      .then(setCatalogUniverse)
      .catch((cause: unknown) => { if (!(cause instanceof DOMException && cause.name === "AbortError")) setCatalogUniverse([]); });
    return () => controller.abort();
  }, [city]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ city, limit: "100" });
    if (search.trim()) params.set("q", search.trim());
    if (selectedCategory) params.set("category", selectedCategory);
    if (selectedBrand) params.set("brand", brandOptions.find(([slug, name]) => slug === selectedBrand || name === selectedBrand)?.[0] ?? selectedBrand);
    if (selectedType) params.set("type", selectedType);
    if (selectedModel) params.set("productModel", selectedModel);
    if (selectedConnectivity) params.set("connectivity", selectedConnectivity);
    if (selectedMemory) params.set("memory", selectedMemory);
    if (selectedColor) params.set("color", selectedColor);
    if (selectedRam) params.set("ram", selectedRam);
    if (selectedSim) params.set("sim", selectedSim);
    setLoading(true); setError(false);
    fetch(`/api/catalog/products?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error("Catalog request failed"); return response.json() as Promise<{ data: CatalogProductDto[] }>; })
      .then((body) => { if (!Array.isArray(body.data)) throw new Error("Invalid catalog response"); setProducts(body.data); })
      .catch((cause: unknown) => { if (!(cause instanceof DOMException && cause.name === "AbortError")) { setProducts([]); setError(true); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [city, search, selectedCategory, selectedBrand, selectedType, selectedModel, selectedConnectivity, selectedMemory, selectedColor, selectedSim, selectedRam, brandOptions, retry]);

  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (selectedCategory) params.set("category", selectedCategory);
    if (selectedBrand) params.set("brand", selectedBrand);
    if (selectedType) params.set("type", selectedType);
    if (selectedMemory) params.set("memory", selectedMemory);
    if (selectedColor) params.set("color", selectedColor);
    if (selectedSim) params.set("sim", selectedSim);
    if (selectedRam) params.set("ram", selectedRam);
    if (selectedModel) params.set("productModel", selectedModel);
    if (selectedConnectivity) params.set("connectivity", selectedConnectivity);
    const min = parsePrice(minPrice);
    const max = parsePrice(maxPrice);
    if (min !== null) params.set("minPrice", String(min));
    if (max !== null) params.set("maxPrice", String(max));
    if (sort !== "name") params.set("sort", sort);
    const basePath = pathname === "/search" ? "/search" : "/catalog";
    const nextUrl = `${basePath}${params.size ? `?${params}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) window.history.replaceState(null, "", nextUrl);
  }, [urlReady, pathname, search, selectedCategory, selectedBrand, selectedType, selectedMemory, selectedColor, selectedSim, selectedRam, selectedModel, selectedConnectivity, minPrice, maxPrice, sort]);

  const optionProducts = catalogUniverse.length ? catalogUniverse : products;
  const categories = useMemo(() => categoryOptions.length ? categoryOptions : Array.from(new Map(optionProducts.map((p) => [p.category.slug, p.category.name])).entries()), [optionProducts, categoryOptions]);
  const brands = useMemo(() => brandOptions.length ? brandOptions : Array.from(new Map(optionProducts.map((p) => [p.brand.slug, p.brand.name])).entries()), [optionProducts, brandOptions]);
  const memories = useMemo(() => Array.from(new Set(optionProducts.flatMap((p) => p.variants.map((v) => variantAttribute(v, "storage")).filter(Boolean)))).sort(compareMemoryValues), [optionProducts]);
  const colors = useMemo(() => Array.from(new Map(optionProducts.flatMap((p) => p.variants.flatMap((v) => v.color ? [[v.color.id, v.color] as const] : []))).values()).sort((a,b) => catalogColorLabel(a).localeCompare(catalogColorLabel(b),"ru")), [optionProducts]);
  const sims = useMemo(() => Array.from(new Set(optionProducts.flatMap((p) => p.variants.map((v) => variantAttribute(v, "simType")).filter(Boolean)))), [optionProducts]);
  const rams = useMemo(() => Array.from(new Set(optionProducts.flatMap((p) => p.variants.map((v) => variantAttribute(v, "ram")).filter(Boolean)))).sort(compareMemoryValues), [optionProducts]);
  const types = useMemo(() => Array.from(new Map(optionProducts.map(globalType).filter((item): item is NonNullable<ReturnType<typeof globalType>> => Boolean(item)).map((item) => [item.slug, item.name])).entries()), [optionProducts]);
  const additionalFilters: Array<[string, string[]]> = [];
  const models = useMemo(() => Array.from(new Set(optionProducts.map((p) => p.model ?? "").filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru")), [optionProducts]);
  const connectivityOptions = useMemo(() => Array.from(new Set(optionProducts.flatMap((p) => p.variants.map((v) => variantAttribute(v, "connectivity")).filter(Boolean)))).sort((a, b) => a.localeCompare(b, "ru")), [optionProducts]);
  const minPriceValue = parsePrice(minPrice);
  const maxPriceValue = parsePrice(maxPrice);
  const invalidPriceRange = minPriceValue !== null && maxPriceValue !== null && minPriceValue > maxPriceValue;
  const filtered = useMemo(() => products.filter((p) => {
    if (selectedType && globalType(p)?.slug !== selectedType) return false;
    if (selectedModel && p.model !== selectedModel && p.slug !== selectedModel) return false;
    const price = productMinPrice(p);
    if (invalidPriceRange || minPriceValue !== null && (price === null || price < minPriceValue) || maxPriceValue !== null && (price === null || price > maxPriceValue)) return false;
    return p.variants.some((v) => (!selectedMemory || variantAttribute(v, "storage") === selectedMemory) && (!selectedColor || v.color?.name === selectedColor || v.color?.id === selectedColor) && (!selectedRam || variantAttribute(v, "ram") === selectedRam) && (!selectedSim || variantAttribute(v, "simType") === selectedSim) && (!selectedConnectivity || variantAttribute(v, "connectivity") === selectedConnectivity));
  }).sort((a, b) => {
    if (sort === "name") return search.trim() ? 0 : a.name.localeCompare(b.name, "ru");
    if (sort === "category") return a.category.name.localeCompare(b.category.name, "ru");
    if (sort === "priceAsc" || sort === "priceDesc") {
      const left = productMinPrice(a);
      const right = productMinPrice(b);
      if (left === null) return right === null ? a.name.localeCompare(b.name, "ru") : 1;
      if (right === null) return -1;
      return (sort === "priceAsc" ? left - right : right - left) || a.name.localeCompare(b.name, "ru");
    }
    return Number(b.isNew) - Number(a.isNew);
  }), [products, search, selectedType, selectedModel, selectedConnectivity, selectedMemory, selectedColor, selectedSim, selectedRam, minPriceValue, maxPriceValue, invalidPriceRange, sort]);
  const suggestions = products.slice(0, 4);
  const reset = () => { setSearch(""); setSelectedCategory(""); setSelectedBrand(""); setSelectedType(""); setSelectedModel(""); setSelectedConnectivity(""); setSelectedMemory(""); setSelectedColor(""); setSelectedSim(""); setSelectedRam(""); setMinPrice(""); setMaxPrice(""); setShowSuggestions(false); };
  const clearSearch = () => { setSearch(""); setShowSuggestions(true); };
  const tile = (product: CatalogProductDto) => <ProductTile key={product.slug} product={product} />;

  return <div className="catalog-page layout-container">

    <div className="catalog-heading"><div className="catalog-heading-copy"><span>Каталог iCenter</span><div><h1>{title}</h1><p>{loading ? "Загрузка каталога…" : <><strong>{filtered.length}</strong><span>{productCountLabel(filtered.length)}</span></>}</p></div></div><button className="mobile-filter-btn" onClick={() => setMobileFilters((v) => !v)}><SlidersHorizontal size={17} />Фильтры</button></div>
    <div className="catalog-search-row" ref={searchRef} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setShowSuggestions(false); }}><label className="catalog-search"><Search size={19} /><input value={search} aria-expanded={showSuggestions} aria-controls="catalog-search-suggestions" autoComplete="off" onFocus={() => setShowSuggestions(true)} onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }} onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter") setShowSuggestions(false); }} placeholder="Поиск товаров" />{search && <button type="button" aria-label="Очистить поиск" onClick={clearSearch}><X size={17} /></button>}</label>{showSuggestions && <div className="autocomplete" id="catalog-search-suggestions" role="listbox"><div className="autocomplete-products"><strong>{search.trim() ? "Результаты поиска" : "Товары каталога"}</strong>{loading ? <div className="catalog-suggestion-state">Поиск…</div> : suggestions.length ? suggestions.map((p) => { const price = selectCatalogDisplayVariant(p).price; const suggestionImage = p.images.find((i) => i.src)?.src; return <Link href={`/product/${p.slug}`} role="option" aria-selected="false" key={p.slug} onClick={() => setShowSuggestions(false)}><span className="suggestion-image">{suggestionImage ? <img src={suggestionImage} alt="" /> : <PackageOpen size={18} />}</span><span className="catalog-suggestion-copy"><b>{p.name}</b><small>{p.model ? `${p.brand.name} · ${p.model}` : `${p.category.name} · ${p.brand.name}`}</small></span><em>{price === null ? "Уточнить цену" : `от ${price.toLocaleString("ru-RU")} ₽`}</em><span className="suggestion-arrow">›</span></Link>; }) : <div className="catalog-suggestion-state"><PackageOpen size={18} /><span>Товары не найдены</span></div>}</div></div>}</div>
    <div className="catalog-layout">{mobileFilters && <button type="button" className="filters-backdrop" aria-label="Закрыть фильтры" onClick={() => setMobileFilters(false)} />}<aside className={`filters ${mobileFilters ? "filters-open" : ""}`}><div className="filters-title"><strong>Фильтры</strong><button onClick={() => setMobileFilters(false)} aria-label="Закрыть фильтры"><X size={18} /></button></div>
      <FilterGroup title="Категория"><div className="filter-list"><label className={!selectedCategory ? "selected" : ""}><input type="radio" name="category" checked={!selectedCategory} onChange={() => setSelectedCategory("")} />Все результаты <span>{products.length}</span></label>{categories.map(([slug, name]) => <label className={selectedCategory === slug ? "selected" : ""} key={slug}><input type="radio" name="category" checked={selectedCategory === slug} onChange={() => setSelectedCategory(slug)} />{name}<span>{products.filter((p) => p.category.slug === slug).length}</span></label>)}</div></FilterGroup>
      <FilterGroup title="Бренд"><div className="check-list"><label><input type="radio" name="brand" checked={!selectedBrand} onChange={() => setSelectedBrand("")} />Все бренды</label>{brands.map(([slug, name]) => <label key={slug}><input type="radio" name="brand" checked={selectedBrand === slug || selectedBrand === name} onChange={() => setSelectedBrand(slug)} />{name}</label>)}</div></FilterGroup><FilterGroup title="Тип товара"><div className="check-list"><label><input type="radio" name="type" checked={!selectedType} onChange={() => setSelectedType("")} />Все типы</label>{types.map(([slug, name]) => <label key={slug}><input type="radio" name="type" checked={selectedType === slug} onChange={() => setSelectedType(slug)} />{name}</label>)}</div></FilterGroup>
      {[["Объём памяти", selectedMemory, setSelectedMemory, memories], ["SIM", selectedSim, setSelectedSim, sims]].map(([titleText, selected, setter, values]) => <FilterGroup key={titleText as string} title={titleText as string}><div className="check-list"><label><input type="radio" name={titleText as string} checked={!selected} onChange={() => (setter as (v: string) => void)("")} />Любой</label>{(values as string[]).map((value) => <label key={value}><input type="radio" name={titleText as string} checked={selected === value} onChange={() => (setter as (v: string) => void)(value)} />{value}</label>)}</div></FilterGroup>)}
      <FilterGroup title="Цвет"><div className="check-list color-filter-list"><label><input type="radio" name="Цвет" checked={!selectedColor} onChange={() => setSelectedColor("")} />Любой</label>{colors.map((color) => { const hex=catalogColorHex(color); return <label key={color.id}><input type="radio" name="Цвет" checked={selectedColor === color.name || selectedColor === color.id} onChange={() => setSelectedColor(color.name)} /><i className={hex ? "catalog-color-swatch" : "catalog-color-swatch neutral-color"} style={hex ? { background: hex } : undefined} aria-hidden="true" /><ColorName color={color} compact /></label>; })}</div></FilterGroup>
      <FilterGroup title="RAM"><div className="check-list"><label><input type="radio" name="ram" checked={!selectedRam} onChange={() => setSelectedRam("")} />Любой</label>{rams.map((value) => <label key={value}><input type="radio" name="ram" checked={selectedRam === value} onChange={() => setSelectedRam(value)} />{value}</label>)}</div></FilterGroup>
      <FilterGroup title="Модель"><div className="check-list"><label><input type="radio" name="productModel" checked={!selectedModel} onChange={() => setSelectedModel("")} />Любая</label>{models.map((value) => <label key={value}><input type="radio" name="productModel" checked={selectedModel === value} onChange={() => setSelectedModel(value)} />{value}</label>)}</div></FilterGroup>
      <FilterGroup title="Подключение"><div className="check-list"><label><input type="radio" name="connectivity" checked={!selectedConnectivity} onChange={() => setSelectedConnectivity("")} />Любое</label>{connectivityOptions.map((value) => <label key={value}><input type="radio" name="connectivity" checked={selectedConnectivity === value} onChange={() => setSelectedConnectivity(value)} />{value}</label>)}</div></FilterGroup>
      <FilterGroup title="Цена, ₽"><div className="catalog-price-filter"><label>От<input type="text" inputMode="decimal" value={minPrice} aria-invalid={Boolean(minPrice.trim()) && minPriceValue === null} onChange={(event) => setMinPrice(event.target.value)} placeholder="0" /></label><label>До<input type="text" inputMode="decimal" value={maxPrice} aria-invalid={Boolean(maxPrice.trim()) && maxPriceValue === null} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Без лимита" /></label>{(Boolean(minPrice.trim()) && minPriceValue === null || Boolean(maxPrice.trim()) && maxPriceValue === null) && <small>Введите цену числом</small>}{invalidPriceRange && <small role="alert">Минимальная цена выше максимальной</small>}</div></FilterGroup>
      <button className="filter-reset" onClick={reset}>Сбросить фильтры</button></aside><section className="catalog-results"><div className="catalog-toolbar"><CatalogSort value={sort} onChange={setSort} /><div className="view-toggle"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Сетка" aria-pressed={view === "grid"}><Grid2X2 size={18} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="Список" aria-pressed={view === "list"}><List size={18} /></button></div></div>
      {error ? <div className="empty-state"><h2>Не удалось загрузить каталог</h2><p>Проверьте соединение и попробуйте снова.</p><button onClick={() => setRetry((value) => value + 1)}>Повторить</button></div> : loading ? <div className="loading-state">Загрузка каталога…</div> : filtered.length ? <div className={`catalog-grid ${view === "list" ? "list-view" : ""}`}>{filtered.map(tile)}</div> : <div className="empty-state"><Search size={32} /><h2>Ничего не найдено</h2><p>Для выбранного города подходящих товаров нет.</p><button onClick={reset}>Сбросить фильтры</button></div>}</section></div>
  </div>;
}
