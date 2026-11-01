"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { useStoreState } from "./StoreState";
import type { CatalogProductDto } from "./catalogClient";
import CatalogProductCard from "./CatalogProductCard";

export default function FavoritesView() {
  const { favorites, hydrated, city } = useStoreState();
  const [saved, setSaved] = useState<Array<{ product: CatalogProductDto; variantId?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!hydrated || !favorites.length) { setSaved([]); setLoading(false); return; }
    const controller = new AbortController(); setLoading(true); setError(false);
    Promise.all(favorites.map(async (favorite) => {
      const response = await fetch(`/api/catalog/products/${encodeURIComponent(favorite.slug)}?city=${encodeURIComponent(city)}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) return null;
      const body = await response.json() as { data?: CatalogProductDto };
      return body.data ? { product: body.data, ...(favorite.variantId ? { variantId: favorite.variantId } : {}) } : null;
    })).then((items) => setSaved(items.filter((item): item is { product: CatalogProductDto; variantId?: string } => Boolean(item))))
      .catch((cause: unknown) => { if (!(cause instanceof DOMException && cause.name === "AbortError")) { setSaved([]); setError(true); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [city, favorites, hydrated]);
  if (!hydrated || loading) return <div className="layout-container favorites-page loading-state">Загрузка избранного…</div>;
  const savedLabel = saved.length % 10 === 1 && saved.length % 100 !== 11 ? "товар" : saved.length % 10 >= 2 && saved.length % 10 <= 4 && (saved.length % 100 < 12 || saved.length % 100 > 14) ? "товара" : "товаров";
  return <div className="layout-container favorites-page"><div className="store-page-heading favorites-heading"><Heart size={24} aria-hidden="true" /><h1>Избранное</h1><p>Сохранённые варианты товаров</p>{saved.length > 0 && <span>{saved.length} {savedLabel} в списке</span>}</div>{error ? <div className="empty-state"><h2>Не удалось загрузить избранное</h2><p>Проверьте соединение и попробуйте снова.</p></div> : saved.length ? <div className="catalog-grid favorites-product-grid">{saved.map(({ product, variantId }, index) => <CatalogProductCard key={`${product.slug}:${variantId ?? index}`} product={product} variantId={variantId} city={city} layout="catalog" />)}</div> : <div className="empty-state"><Heart size={34} /><h2>В избранном пока пусто</h2><p>Сохраняйте варианты, чтобы быстро найти их позже.</p><Link href="/catalog">Все товары</Link></div>}</div>;
}
