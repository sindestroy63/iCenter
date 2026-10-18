"use client";

import { Search, MapPin, Heart, ShoppingCart, Menu, Truck, ShieldCheck, CreditCard, Headphones, Star, ChevronDown } from "lucide-react";
import Link from "next/link";
import { StoreStateProvider, useStoreState } from "./StoreState";
import { cities, products, type StoreProduct } from "./storeData";
import StoreSearch from "./StoreSearch";

export { cities, products };

export function StoreHeader() {
  const { city, setCity, favorites, cartCount } = useStoreState();
  return (
    <header className="store-header container">
      <Link className="logo" href="/">iCenter</Link>
      <Link className="catalog-btn" href="/catalog"><Menu size={18} />Каталог</Link>
      <StoreSearch />
      <label className="header-action city-action"><MapPin size={20} /><select aria-label="Выбрать город" value={city} onChange={(event) => setCity(event.target.value)}>{cities.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select><ChevronDown size={12} /></label>
      <Link className="header-action" href="/favorites"><Heart size={23} /><span>Избранное{favorites.length > 0 ? ` · ${favorites.length}` : ""}</span></Link>
      <Link className="header-action" href="/cart"><ShoppingCart size={23} /><span>Корзина{cartCount > 0 ? ` · ${cartCount}` : ""}</span></Link>
    </header>
  );
}

export function StoreFooter() {
  const { city } = useStoreState();
  const cityName = cities.find((item) => item.slug === city)?.name ?? "Город не выбран";
  return (
    <footer className="store-footer">
      <div className="container footer-columns">
        <div className="footer-brand"><strong className="footer-logo">iCenter</strong><span>Техника и аксессуары</span></div>
        <div><strong>Каталог</strong><nav><Link href="/catalog/smartphones">Смартфоны</Link><Link href="/catalog/tablets">Планшеты</Link><Link href="/catalog/laptops">Ноутбуки</Link></nav></div>
        <div><strong>Покупателям</strong><nav><Link href="/delivery">Доставка</Link><Link href="/warranty">Гарантия</Link><Link href="/payment">Оплата</Link></nav></div>
        <div><strong>Контакты</strong><nav><span>{cityName}</span><span>Контактные данные уточняются</span></nav></div>
        <div><strong>Документы</strong><nav><Link href="/legal/privacy">Политика конфиденциальности</Link><Link href="/legal/personal-data-consent">Обработка персональных данных</Link><Link href="/legal/terms">Условия использования</Link></nav></div>
        <div><strong>Социальные сети</strong><nav><span>Ссылки не настроены</span></nav></div>
      </div>
      <div className="container footer-bottom"><span>iCenter</span><span>Города присутствия: Самара, Москва, Санкт-Петербург, Оренбург</span></div>
    </footer>
  );
}

export function StoreShell({ children }: { children: React.ReactNode }) { return <StoreStateProvider><StoreHeader /><main>{children}</main><StoreFooter /></StoreStateProvider>; }

export function ProductCard({ product }: { product: StoreProduct }) {
  const { toggleFavorite, isFavorite } = useStoreState();
  const favorite = isFavorite(product.slug);
  return <article className="product-card">
    <button className={`favorite-mini ${favorite ? "active" : ""}`} aria-label={favorite ? "Удалить из избранного" : "Добавить в избранное"} onClick={() => toggleFavorite(product.slug)}><Heart size={17} fill={favorite ? "currentColor" : "none"} /></button>
    <Link className="product-card-link" href={`/product/${product.slug}`} aria-label={`Открыть товар ${product.name}`}><div className="product-image"><img src={product.image} alt={product.name} /></div><h3>{product.name}</h3></Link>
    <div className="product-bottom"><span>Уточнить цену</span><Link className="cart-mini" href={`/product/${product.slug}`} aria-label="Выбрать вариант товара"><ShoppingCart size={17} /></Link></div>
  </article>;
}

export function Benefits() {
  const items = [[MapPin, "Выбор города", "для каталога"], [Search, "Подбор товаров", "по характеристикам"], [ShoppingCart, "Состав заказа", "перед отправкой"], [ShieldCheck, "Цена и наличие", "требуют уточнения"], [Headphones, "Консультация", "по заявке"]] as const;
  return <div className="benefits">{items.map(([Icon, title, detail]) => <div className="benefit" key={title}><Icon size={27} /><div><strong>{title}</strong><br /><span>{detail}</span></div></div>)}</div>;
}
