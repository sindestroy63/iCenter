"use client";

import { useEffect, useRef, useState } from "react";
import { Search, MapPin, Heart, ShoppingCart, Menu, Truck, ShieldCheck, Headphones, ChevronDown, Check, X, Phone } from "lucide-react";
import Link from "next/link";
import { StoreStateProvider, useStoreState } from "./StoreState";
import { cities, products, type StoreProduct } from "./storeData";
import StoreSearch from "./StoreSearch";
import { confirmedStoreContacts } from "@/lib/store-contacts";

export { cities, products };

function normalizeStorePhone(phone: string | null | undefined) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (digits.length < 10 || digits.length > 15 || /^(\d)\1+$/.test(digits)) return null;
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  return `+${digits}`;
}

export function StoreHeader() {
  const { city, setCity, favorites, cartCount } = useStoreState();
  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const cityMenuRef = useRef<HTMLDivElement>(null);
  const cityButtonRef = useRef<HTMLButtonElement>(null);
  const selectedCityName = cities.find((item) => item.slug === city)?.name ?? city;
  useEffect(() => {
    const updateScrollState = () => setIsScrolled(window.scrollY > 2);
    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);
  useEffect(() => {
    if (!cityMenuOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !cityMenuRef.current?.contains(event.target)) setCityMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCityMenuOpen(false);
        cityButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [cityMenuOpen]);
  const selectCity = (slug: string) => {
    setCity(slug);
    setCityMenuOpen(false);
    cityButtonRef.current?.focus();
  };
  return <header className={`store-header layout-container${isScrolled ? " is-scrolled" : ""}`}><div className="header-main"><Link className="logo" href="/">iCenter</Link><Link className="catalog-btn" href="/catalog"><Menu size={18} />Каталог</Link><StoreSearch /></div><div className="header-quick-actions">
    <div className="city-menu-anchor" ref={cityMenuRef}>
      <button ref={cityButtonRef} type="button" className="header-action city-action" aria-label={`Город: ${selectedCityName}`} aria-haspopup="dialog" aria-expanded={cityMenuOpen} aria-controls="city-picker-popover" onClick={() => setCityMenuOpen((open) => !open)}><MapPin size={19} /><span className="city-action-name">{selectedCityName}</span><ChevronDown size={15} /></button>
      {cityMenuOpen && <div className="city-picker-popover" id="city-picker-popover" role="dialog" aria-label="Выберите город"><div className="city-picker-heading"><strong>Выберите город</strong><button type="button" aria-label="Закрыть выбор города" onClick={() => { setCityMenuOpen(false); cityButtonRef.current?.focus(); }}><X size={17} /></button></div><div className="city-picker-list">{cities.map((item) => <button type="button" key={item.slug} className={item.slug === city ? "selected" : ""} aria-pressed={item.slug === city} onClick={() => selectCity(item.slug)}><MapPin size={17} /><span>{item.name}</span>{item.slug === city && <Check size={17} />}</button>)}</div></div>}
    </div>
    <Link className="header-action header-favorites" href="/favorites"><Heart size={21} /><span>Избранное{favorites.length ? ` · ${favorites.length}` : ""}</span></Link>
    <Link className="header-action header-cart" href="/cart"><ShoppingCart size={21} /><span>Корзина{cartCount ? ` · ${cartCount}` : ""}</span></Link>
  </div></header>;
}

export function StoreFooter() {
  const { city, cityInfo } = useStoreState();
  const selectedCityInfo = cityInfo?.slug === city ? cityInfo : null;
  const cityName = selectedCityInfo?.name ?? cities.find((item) => item.slug === city)?.name ?? "Город не выбран";
  const configuredAddress = selectedCityInfo?.address?.trim();
  const addressIsPlaceholder = !configuredAddress || /тест|не указан/i.test(configuredAddress);
  const samaraContact = confirmedStoreContacts.samara;
  const storeAddress = addressIsPlaceholder ? (city === "samara" ? samaraContact.address : null) : configuredAddress;
  const configuredPhone = selectedCityInfo?.phone?.trim();
  const configuredPhoneHref = normalizeStorePhone(configuredPhone);
  const fallbackPhoneHref = city === "samara" ? normalizeStorePhone(samaraContact.phone) : null;
  const storePhone = configuredPhoneHref ? configuredPhone : fallbackPhoneHref ? samaraContact.phone : null;
  const storePhoneHref = configuredPhoneHref ?? fallbackPhoneHref;
  return <footer className="store-footer store-footer-minimal">
    <div className="layout-container footer-minimal-inner">
      <div className="footer-minimal-main">
        <div className="footer-minimal-brand"><strong className="footer-logo">iCenter</strong><span>Техника и аксессуары</span></div>
        <nav className="footer-minimal-nav" aria-label="Полезные ссылки"><Link href="/delivery">Доставка</Link><Link href="/warranty">Гарантия</Link><Link href="/installment">Рассрочка</Link><Link href="/trade-in">Trade-in</Link></nav>
        <div className="footer-minimal-contact">
          <div className="footer-minimal-city"><MapPin size={16} aria-hidden="true" /><span>{cityName}</span></div>
          {storePhone && storePhoneHref && <a className="footer-minimal-phone" href={"tel:" + storePhoneHref}><Phone size={14} aria-hidden="true" /><span>{storePhone}</span></a>}
          {storeAddress && <div className="footer-minimal-address"><MapPin size={14} aria-hidden="true" /><span>{storeAddress}</span></div>}
        </div>
      </div>
      <p className="footer-minimal-legal">Информация о товарах и ценах носит справочный характер. iCenter не является официальным сайтом Apple Inc. или других производителей. Все товарные знаки принадлежат их правообладателям.</p>
      <div className="footer-minimal-bottom"><span>© 2026 iCenter</span><nav aria-label="Юридические документы"><Link href="/privacy">Политика конфиденциальности</Link><Link href="/personal-data-consent">Согласие на обработку данных</Link></nav></div>
    </div>
  </footer>;
}

export function StoreShell({ children }: { children: React.ReactNode }) { return <StoreStateProvider><div className="store-app"><StoreHeader /><main>{children}</main><StoreFooter /></div></StoreStateProvider>; }

export function ProductCard({ product }: { product: StoreProduct }) {
  const { toggleFavorite, isFavorite } = useStoreState();
  const favorite = isFavorite(product.slug);
  return <article className="product-card"><button className={`favorite-mini ${favorite ? "active" : ""}`} aria-label={favorite ? "Удалить из избранного" : "Добавить в избранное"} onClick={() => toggleFavorite(product.slug)}><Heart size={17} fill={favorite ? "currentColor" : "none"} /></button><Link className="product-card-link" href={`/product/${product.slug}`} aria-label={`Открыть товар ${product.name}`}><div className="product-image">{product.image ? <img src={product.image} alt={product.name} /> : <span aria-label="Изображение отсутствует">Нет фото</span>}</div><h3>{product.name}</h3></Link><div className="product-bottom"><span>Уточняйте цену</span><Link className="cart-mini" href={`/product/${product.slug}`} aria-label="Выбрать вариант товара"><ShoppingCart size={17} /></Link></div></article>;
}

export function Benefits() { const items = [[MapPin, "Выбор города", "для каталога"], [Search, "Подбор товаров", "по характеристикам"], [ShoppingCart, "Состав заявки", "перед отправкой"], [ShieldCheck, "Цена и наличие", "требуют уточнения"], [Headphones, "Консультация", "по заявке"]] as const; return <div className="benefits">{items.map(([Icon, title, detail]) => <div className="benefit" key={title}><Icon size={27} /><div><strong>{title}</strong><br /><span>{detail}</span></div></div>)}</div>; }
