"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { products } from "./storeData";

function normalize(value: string) {
  return value.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/айфон/g, "iphone").replace(/самсунг/g, "samsung").replace(/дайсон/g, "dyson").trim();
}

export default function StoreSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const normalized = normalize(debouncedQuery);
  const suggestions = useMemo(() => products.filter((product) => {
    const haystack = normalize(`${product.name} ${product.brand} ${product.category} ${product.type}`);
    return !normalized || haystack.includes(normalized);
  }).slice(0, 5), [normalized]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 140);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => setActive(-1), [debouncedQuery]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const selected = suggestions[active];
    setOpen(false);
    if (selected && active >= 0) router.push(`/product/${selected.slug}`);
    else router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((value) => Math.min(value + 1, suggestions.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(value - 1, -1)); }
  };

  return <div className="store-search-wrap">
    <form className="search" role="search" onSubmit={submit}>
      <Search size={19} />
      <input aria-label="Поиск товаров" aria-expanded={open} aria-controls="store-search-suggestions" autoComplete="off" value={query} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 140)} onKeyDown={onKeyDown} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} placeholder="Поиск товаров, например: iPhone 18, MacBook, Dyson..." />
    </form>
    {open && <div className="store-search-suggestions" id="store-search-suggestions" role="listbox">
      {suggestions.length ? suggestions.map((product, index) => <button type="button" role="option" aria-selected={active === index} key={product.slug} onMouseDown={(event) => event.preventDefault()} onClick={() => { setOpen(false); router.push(`/product/${product.slug}`); }}><img src={product.image} alt="" /><span><b>{product.name}</b><small>{product.category}  · {product.brand}</small></span><em>Уточнить цену</em></button>) : <p>Совпадений в локальном каталоге нет.</p>}
      <button className="search-all" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => submit()}>Все результаты поиска</button>
    </div>}
  </div>;
}
