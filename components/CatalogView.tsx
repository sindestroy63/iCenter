"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp, Grid2X2, Heart, List, Search, ShoppingCart, SlidersHorizontal, X } from "lucide-react";
import { useStoreState } from "./StoreState";
import { products, type StoreProduct } from "./storeData";

const suggestions = ["iphone", "айфон", "samsung", "macbook", "dyson", "playstation"];

function normalize(value: string) {
  return value.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/айфон/g, "iphone").replace(/самсунг/g, "samsung").replace(/плейстейшн/g, "playstation");
}

function productCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14 ? "товаров" : last === 1 ? "товар" : last >= 2 && last <= 4 ? "товара" : "товаров";
  return `Найдено ${count} ${noun}`;
}

function ProductTile({ product, index }: { product: StoreProduct; index: number }) {
  const { toggleFavorite, isFavorite } = useStoreState();
  const favorite = isFavorite(product.slug);
  return <article className="catalog-product-card">
    <div className="catalog-card-top"><span className={index < 3 ? "badge badge-pink" : "badge badge-purple"}>{index < 3 ? "Новинка" : "Каталог"}</span><button className={`catalog-favorite ${favorite ? "active" : ""}`} aria-label={favorite ? "Удалить из избранного" : "Добавить в избранное"} onClick={() => toggleFavorite(product.slug)}><Heart size={21} fill={favorite ? "currentColor" : "none"} /></button></div>
    <Link href={`/product/${product.slug}`} className="catalog-product-link"><div className="catalog-product-image"><img src={product.image} alt={product.name} /></div><h3>{product.name}</h3><p>{product.detail}</p></Link>
    <div className="catalog-product-bottom"><strong>Уточнить цену</strong><Link className="cart-mini" href={`/product/${product.slug}`} aria-label="Выбрать вариант товара"><ShoppingCart size={17} /></Link></div>
  </article>;
}

function FilterGroup({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [expanded, setExpanded] = useState(open);
  return <section className="filter-group"><button onClick={() => setExpanded((value) => !value)}><strong>{title}</strong>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{expanded && children}</section>;
}

export default function CatalogView({ query = "", title = "Каталог", crumb = "Каталог", brand = "", category = "", memory = "", color = "", sim = "" }: { query?: string; title?: string; crumb?: string; brand?: string; category?: string; memory?: string; color?: string; sim?: string }) {
  const [search, setSearch] = useState(query);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [sort, setSort] = useState("name");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedCategory, setSelectedCategory] = useState(category);
  const [selectedBrand, setSelectedBrand] = useState(brand === "SAMSUNG" ? "Samsung" : brand === "PlayStation" ? "Sony" : brand);
  const [selectedMemory, setSelectedMemory] = useState(memory);
  const [selectedColor, setSelectedColor] = useState(color);
  const [selectedSim, setSelectedSim] = useState(sim);
  const pathname = usePathname();

  useEffect(() => setSearch(query), [query]);
  useEffect(() => setSelectedCategory(category), [category]);
  useEffect(() => setSelectedBrand(brand === "SAMSUNG" ? "Samsung" : brand === "PlayStation" ? "Sony" : brand), [brand]);
  useEffect(() => setSelectedMemory(memory), [memory]);
  useEffect(() => setSelectedColor(color), [color]);
  useEffect(() => setSelectedSim(sim), [sim]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (selectedCategory) params.set("category", selectedCategory);
    if (selectedBrand) params.set("brand", selectedBrand);
    if (selectedMemory) params.set("memory", selectedMemory);
    if (selectedColor) params.set("color", selectedColor);
    if (selectedSim) params.set("sim", selectedSim);
    const basePath = pathname === "/search" ? "/search" : "/catalog";
    const nextUrl = `${basePath}${params.size ? `?${params.toString()}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) window.history.replaceState(null, "", nextUrl);
  }, [pathname, search, selectedCategory, selectedBrand, selectedMemory, selectedColor, selectedSim]);
  const categoryOptions = useMemo(() => Array.from(new Set(products.map((product) => product.category))), []);
  const brandOptions = useMemo(() => Array.from(new Set(products.map((product) => product.brand))), []);
  const memoryOptions = useMemo(() => Array.from(new Set(products.flatMap((product) => product.memory ?? []))), []);
  const colorOptions = useMemo(() => Array.from(new Set(products.flatMap((product) => product.colors?.map((color) => color.label) ?? []))), []);
  const simOptions = useMemo(() => Array.from(new Set(products.flatMap((product) => product.sim ?? []))), []);
  const filtered = useMemo(() => {
    const normalized = normalize(search.trim());
    const result = products.filter((product) => {
      const text = normalize(`${product.name} ${product.category} ${product.brand} ${product.detail}`);
      return (!normalized || text.includes(normalized) || (normalized === "iphone" && product.brand === "Apple")) && (!selectedCategory || product.category === selectedCategory) && (!selectedBrand || product.brand === selectedBrand) && (!selectedMemory || product.memory?.includes(selectedMemory)) && (!selectedColor || product.colors?.some((color) => color.label === selectedColor)) && (!selectedSim || product.sim?.includes(selectedSim));
    });
    return [...result].sort((left, right) => sort === "name" ? left.name.localeCompare(right.name, "ru") : sort === "category" ? left.category.localeCompare(right.category, "ru") : 0);
  }, [search, selectedCategory, selectedBrand, selectedMemory, selectedColor, selectedSim, sort]);
  const reset = () => { setSearch(""); setSelectedCategory(""); setSelectedBrand(""); setSelectedMemory(""); setSelectedColor(""); setSelectedSim(""); setShowSuggestions(false); };
  return <div className="catalog-page container">
    <div className="catalog-breadcrumbs"><Link href="/">Главная</Link><span>›</span><span>{crumb}</span></div>
    <div className="catalog-heading"><div><h1>{title}</h1><p>{filtered.length ? productCountLabel(filtered.length) : "Ничего не найдено"}<span className="demo-inline">  · Локальные демонстрационные данные, API не подключено</span></p></div><button className="mobile-filter-btn" onClick={() => setMobileFilters((value) => !value)}><SlidersHorizontal size={17} />Фильтры</button></div>
    <div className="catalog-search-row"><label className="catalog-search"><Search size={19} /><input value={search} onFocus={() => setShowSuggestions(true)} onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)} onChange={(event) => { setSearch(event.target.value); setShowSuggestions(true); }} onKeyDown={(event) => { if (event.key === "Escape") setShowSuggestions(false); if (event.key === "Enter") setShowSuggestions(false); }} placeholder="Поиск товаров" /><button aria-label="Очистить поиск" onClick={reset}><X size={17} /></button></label>{showSuggestions && <div className="autocomplete"><div className="autocomplete-popular"><strong>Популярные запросы</strong>{suggestions.map((suggestion) => <button key={suggestion} onMouseDown={(event) => event.preventDefault()} onClick={() => { setSearch(suggestion); setShowSuggestions(false); }}><Search size={16} />{suggestion}</button>)}</div><div className="autocomplete-products"><strong>Товары</strong>{products.slice(0, 4).map((product) => <Link href={`/product/${product.slug}`} key={product.slug}><img src={product.image} alt="" /><span><b>{product.name}</b><small>{product.category}  · {product.brand}</small></span><em>Уточнить цену</em><span className="suggestion-arrow">›</span></Link>)}</div></div>}</div>
    <div className="catalog-layout"><aside className={`filters ${mobileFilters ? "filters-open" : ""}`}><div className="filters-title"><strong>Фильтры</strong><button onClick={() => setMobileFilters(false)} aria-label="Закрыть фильтры"><X size={18} /></button></div><FilterGroup title="Категория"><div className="filter-list"><label className={!selectedCategory ? "selected" : ""}><input type="radio" name="category" checked={!selectedCategory} onChange={() => setSelectedCategory("")} />Все результаты  <span>{products.length}</span></label>{categoryOptions.map((category) => <label className={selectedCategory === category ? "selected" : ""} key={category}><input type="radio" name="category" checked={selectedCategory === category} onChange={() => setSelectedCategory(category)} />{category} <span>{products.filter((product) => product.category === category).length}</span></label>)}</div></FilterGroup><FilterGroup title="Бренд"><div className="check-list"><label><input type="radio" name="brand" checked={!selectedBrand} onChange={() => setSelectedBrand("")} />Все бренды</label>{brandOptions.map((option) => <label key={option}><input type="radio" name="brand" checked={selectedBrand === option} onChange={() => setSelectedBrand(option)} />{option} <span>{products.filter((product) => product.brand === option).length}</span></label>)}</div></FilterGroup><FilterGroup title="Объем памяти" open={memoryOptions.length > 0}><div className="check-list"><label><input type="radio" name="memory" checked={!selectedMemory} onChange={() => setSelectedMemory("")} />Любой</label>{memoryOptions.map((option) => <label key={option}><input type="radio" name="memory" checked={selectedMemory === option} onChange={() => setSelectedMemory(option)} />{option}</label>)}</div></FilterGroup><FilterGroup title="Цвет" open={colorOptions.length > 0}><div className="check-list"><label><input type="radio" name="color" checked={!selectedColor} onChange={() => setSelectedColor("")} />Любой</label>{colorOptions.map((option) => <label key={option}><input type="radio" name="color" checked={selectedColor === option} onChange={() => setSelectedColor(option)} />{option}</label>)}</div></FilterGroup><button className="filter-reset" onClick={reset}>Сбросить фильтры</button></aside><section className="catalog-results"><div className="catalog-toolbar"><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Сортировка"><option value="name">По названию</option><option value="category">По категории</option></select><div className="view-toggle"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Сетка"><Grid2X2 size={18} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="Список"><List size={18} /></button></div></div>{filtered.length ? <div className={`catalog-grid ${view === "list" ? "list-view" : ""}`}>{filtered.map((product, index) => <ProductTile product={product} index={index} key={product.slug} />)}</div> : <div className="empty-state"><Search size={32} /><h2>Ничего не найдено</h2><p>Попробуйте изменить запрос или очистить фильтры.</p><button onClick={reset}>Сбросить фильтры</button></div>}</section></div>
  </div>;
}
