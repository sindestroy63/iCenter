"use client";

import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PackageOpen, Search } from "lucide-react";
import { useStoreState } from "./StoreState";
import { selectCatalogDisplayVariant, type CatalogProductDto } from "./catalogClient";
import { normalizeCatalogSearchQuery } from "@/lib/catalog-search";

export default function StoreSearch() {
  const router = useRouter();
  const { city } = useStoreState();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CatalogProductDto[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const normalized = normalizeCatalogSearchQuery(debouncedQuery);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query), 180); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ city, limit: "5" }); if (normalized) params.set("q", normalized);
    fetch(`/api/catalog/products?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error("Search failed"); return r.json() as Promise<{ data: CatalogProductDto[] }>; })
      .then((body) => setSuggestions(Array.isArray(body.data) ? body.data : []))
      .catch((cause: unknown) => { if (!(cause instanceof DOMException && cause.name === "AbortError")) setSuggestions([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [city, normalized, open]);
  useEffect(() => setActive(-1), [normalized]);
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const selected = suggestions[active];
    setOpen(false);
    if (selected && active >= 0) { router.push(`/product/${selected.slug}`); return; }
    const params = new URLSearchParams(window.location.search);
    const searchQuery = normalizeCatalogSearchQuery(query);
    if (searchQuery) params.set("q", searchQuery);
    else params.delete("q");
    router.push(`/search${params.size ? `?${params}` : ""}`);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Escape") setOpen(false); if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((v) => Math.min(v + 1, suggestions.length - 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setActive((v) => Math.max(v - 1, -1)); } };
  return <div className="store-search-wrap"><form className="search" role="search" onSubmit={submit}><Search size={19} /><input aria-label="Поиск товаров" aria-expanded={open} aria-controls="store-search-suggestions" autoComplete="off" value={query} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 140)} onKeyDown={onKeyDown} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} placeholder="Поиск товаров" /></form>{open && <div className="store-search-suggestions" id="store-search-suggestions" role="listbox">{loading ? <p>Поиск…</p> : suggestions.length ? suggestions.map((product, index) => { const image = product.images.find((entry) => entry.src)?.src; const price = selectCatalogDisplayVariant(product).price; return <button type="button" role="option" aria-selected={active === index} key={product.slug} onMouseDown={(event) => event.preventDefault()} onClick={() => { setOpen(false); router.push(`/product/${product.slug}`); }}><span className="search-result-image">{image ? <img src={image} alt="" /> : <PackageOpen size={18} />}</span><span><b>{product.name}</b><small>{product.brand.name} · {product.model || product.category.name}</small></span><em>{price === null ? "Уточнить цену" : `от ${price.toLocaleString("ru-RU")} ₽`}</em></button>; }) : <p>Совпадений в каталоге нет.</p>}<button className="search-all" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => submit()}>Все результаты поиска</button></div>}</div>;
}
