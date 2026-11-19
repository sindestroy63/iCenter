"use client";

import { FormEvent, KeyboardEvent, Ref, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PackageOpen, Search } from "lucide-react";
import { useStoreState } from "./StoreState";
import { selectCatalogDisplayVariant, type CatalogProductDto } from "./catalogClient";
import { catalogSearchProductIdentityMatches, catalogSearchTextMatches, normalizeCatalogSearchQuery } from "@/lib/catalog-search";

export default function StoreSearch({ inputRef }: { inputRef?: Ref<HTMLInputElement> }) {
  const router = useRouter();
  const { city } = useStoreState();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CatalogProductDto[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [placeholderNames, setPlaceholderNames] = useState<string[]>([]);
  const [placeholder, setPlaceholder] = useState("Поиск iPhone, Samsung, Dyson...");
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const normalized = normalizeCatalogSearchQuery(debouncedQuery);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/catalog/products?${new URLSearchParams({ city, limit: "100" })}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error("Placeholder products failed"); return response.json() as Promise<{ data?: CatalogProductDto[] }>; })
      .then((body) => {
        const names = Array.from(new Set((body.data ?? []).map((product) => (product.model?.trim() || product.name.trim())).filter(Boolean)));
        setPlaceholderNames(names);
      })
      .catch(() => { if (!controller.signal.aborted) setPlaceholderNames([]); });
    return () => controller.abort();
  }, [city]);
  useEffect(() => {
    if (reducedMotion || focused || query || !placeholderNames.length) return;
    let cancelled = false;
    let index = Math.floor(Math.random() * placeholderNames.length);
    let position = 0;
    let deleting = false;
    let timeout: number | undefined;
    const tick = () => {
      if (cancelled) return;
      const name = placeholderNames[index];
      position = deleting ? Math.max(0, position - 1) : Math.min(name.length, position + 1);
      setPlaceholder(name.slice(0, position));
      let delay = deleting ? 38 : 72;
      if (!deleting && position === name.length) { deleting = true; delay = 1150; }
      else if (deleting && position === 0) {
        deleting = false;
        if (placeholderNames.length > 1) { let next = index; while (next === index) next = Math.floor(Math.random() * placeholderNames.length); index = next; }
        delay = 260;
      }
      timeout = window.setTimeout(tick, delay);
    };
    setPlaceholder("");
    timeout = window.setTimeout(tick, 260);
    return () => { cancelled = true; if (timeout !== undefined) window.clearTimeout(timeout); };
  }, [focused, placeholderNames, query, reducedMotion]);
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
    if (selected && active >= 0) {
      const identityMatches = catalogSearchProductIdentityMatches([selected.brand.name, selected.name, selected.model, selected.generation].filter(Boolean).join(" "), query);
      const variant = identityMatches ? selected.variants.find((candidate) => catalogSearchTextMatches([
        selected.name,
        selected.model,
        selected.generation,
        selected.brand.name,
        candidate.sku,
        candidate.label,
        candidate.color?.name,
        candidate.color?.nameRu,
        candidate.color?.slug,
        ...Object.values(candidate.attributes),
      ].filter(Boolean).join(" "), query)) ?? selectCatalogDisplayVariant(selected).variant : selectCatalogDisplayVariant(selected).variant;
      router.push(`/product/${selected.slug}${variant ? `?variant=${encodeURIComponent(variant.id)}` : ""}`);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const searchQuery = normalizeCatalogSearchQuery(query);
    if (searchQuery) params.set("q", searchQuery);
    else params.delete("q");
    router.push(`/search${params.size ? `?${params}` : ""}`);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Escape") setOpen(false); if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((v) => Math.min(v + 1, suggestions.length - 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setActive((v) => Math.max(v - 1, -1)); } };
  return <div className="store-search-wrap"><form className="search" role="search" onSubmit={submit}><Search size={19} /><input ref={inputRef} aria-label="Поиск товаров" aria-expanded={open} aria-controls="store-search-suggestions" autoComplete="off" value={query} onFocus={() => { setFocused(true); setOpen(true); }} onBlur={() => { setFocused(false); window.setTimeout(() => setOpen(false), 140); }} onKeyDown={onKeyDown} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} placeholder={reducedMotion ? "Поиск iPhone, Samsung, Dyson..." : placeholder || "Поиск iPhone, Samsung, Dyson..."} /></form>{open && <div className="store-search-suggestions" id="store-search-suggestions" role="listbox">{loading ? <p>Поиск…</p> : suggestions.length ? suggestions.map((product, index) => { const image = product.images.find((entry) => entry.src)?.src; const selection = selectCatalogDisplayVariant(product); const match = product.variants.find((variant) => catalogSearchTextMatches([product.name, product.model, product.generation, product.brand.name, variant.sku, variant.label, variant.color?.name, variant.color?.nameRu, ...Object.values(variant.attributes)].filter(Boolean).join(" "), query)); const displayVariant = match ?? selection.variant; const rawPrice = displayVariant?.price == null ? null : Number(displayVariant.price); const price = rawPrice !== null && Number.isFinite(rawPrice) ? rawPrice : null; const oldPrice = price !== null && displayVariant?.oldPrice ? Number(displayVariant.oldPrice) : null; const href = `/product/${product.slug}${displayVariant ? `?variant=${encodeURIComponent(displayVariant.id)}` : ""}`; return <button type="button" role="option" aria-selected={active === index} key={product.slug} onMouseDown={(event) => event.preventDefault()} onClick={() => { setOpen(false); router.push(href); }}><span className="search-result-image">{image ? <img src={image} alt="" /> : <PackageOpen size={18} />}</span><span><b>{product.name}</b><small>{product.brand.name} · {product.category.name}</small></span><em>{price === null ? "Уточнить цену" : <>от {price.toLocaleString("ru-RU")} ₽{oldPrice !== null && Number.isFinite(oldPrice) && <small className="search-result-old-price">от {oldPrice.toLocaleString("ru-RU")} ₽</small>}</>}</em></button>; }) : <p>Совпадений в каталоге нет.</p>}<button className="search-all" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => submit()}>Все результаты поиска</button></div>}</div>;
}
