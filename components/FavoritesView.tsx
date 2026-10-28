"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { useStoreState } from "./StoreState";
import type { CatalogProductDto } from "./catalogClient";
import CatalogProductCard from "./CatalogProductCard";

export default function FavoritesView() {
  const { favorites, hydrated, city } = useStoreState();
  const [saved, setSaved] = useState<CatalogProductDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!hydrated || !favorites.length) { setSaved([]); setLoading(false); return; }
    const controller = new AbortController(); setLoading(true); setError(false);
    Promise.all(favorites.map(async (slug) => {
      const response = await fetch(`/api/catalog/products/${encodeURIComponent(slug)}?city=${encodeURIComponent(city)}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) return null;
      const body = await response.json() as { data?: CatalogProductDto };
      return body.data ?? null;
    })).then((items) => setSaved(items.filter((item): item is CatalogProductDto => Boolean(item))))
      .catch((cause: unknown) => { if (!(cause instanceof DOMException && cause.name === "AbortError")) { setSaved([]); setError(true); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [city, favorites, hydrated]);
  if (!hydrated || loading) return <div className="layout-container favorites-page loading-state">Загрузка избранного…</div>;
  return <div className="layout-container favorites-page"><div className="favorites-heading"><div><h1>Избранное</h1><p>{saved.length} товаров в списке</p></div><Heart size={24} /></div>{error ? <div className="empty-state"><h2>Не удалось загрузить избранное</h2><p>Проверьте соединение и попробуйте снова.</p></div> : saved.length ? <div className="catalog-grid favorites-product-grid">{saved.map((product) => <CatalogProductCard key={product.slug} product={product} city={city} layout="catalog" />)}</div> : <div className="empty-state"><Heart size={34} /><h2>В избранном пока пусто</h2><p>Сохраняйте товары, чтобы быстро найти их позже.</p><Link href="/catalog">Все товары</Link></div>}</div>;
}
