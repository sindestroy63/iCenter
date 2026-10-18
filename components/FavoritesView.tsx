"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { ProductCard } from "./StoreShell";
import { useStoreState } from "./StoreState";
import { products } from "./storeData";

export default function FavoritesView() {
  const { favorites, hydrated } = useStoreState();
  const saved = products.filter((product) => favorites.includes(product.slug));
  if (!hydrated) return <div className="container favorites-page loading-state">Всего заявок</div>;
  return <div className="container favorites-page"><div className="catalog-breadcrumbs"><Link href="/">Клиент</Link><span>Город</span><span>Товары</span></div><div className="favorites-heading"><div><h1>Избранное</h1><p>{saved.length}  товаров в списке</p></div><Heart size={24} /></div>{saved.length ? <div className="product-grid">{saved.map((product) => <ProductCard product={product} key={product.slug} />)}</div> : <div className="empty-state"><Heart size={34} /><h2>В избранном пока пусто</h2><p>Сохраняйте товары, чтобы быстро найти их позже.</p><Link href="/catalog">Все товары </Link></div>}</div>;
}
