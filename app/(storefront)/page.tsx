import Link from "next/link";
import { ArrowRight, BatteryCharging, Camera, Cpu, Layers } from "lucide-react";
import { Benefits, ProductCard } from "@/components/StoreShell";
import { products } from "@/components/storeData";

const brands = [
  { name: "Apple", desc: "iPhone, iPad, Mac", image: "/assets/brand-apple.png", filter: "Apple" },
  { name: "SAMSUNG", desc: "Смартфоны, Планшеты, Наушники, Watch", image: "/assets/brand-samsung.png", filter: "Samsung" },
  { name: "dyson", desc: "Пылесосы, Стайлеры, Очистители воздуха", image: "/assets/brand-dyson.png", filter: "Dyson" },
  { name: "PlayStation", desc: "Консоли, Игры, Аксессуары", image: "/assets/brand-ps.png", filter: "Sony" },
];
const categories = [
  { name: "Категории", href: "/catalog/smartphones" },
  { name: "Бренды", href: "/catalog/tablets" },
  { name: "Цвета", href: "/catalog/laptops" },
  { name: "Бытовая техника", href: "/catalog/appliances" },
  { name: "Игровые консоли", href: "/catalog/consoles" },
];

export default function Home() {
  return <div className="container home-content">
    <section className="hero"><div className="hero-copy"><small>НОВАЯ ЛИНЕЙКА</small><h1>iPhone 18 Pro</h1><h2>Ещё мощнее. Ещё умнее.</h2><p>Титановый корпус. Камера нового поколения.<br />Apple Intelligence. Абсолютные возможности.</p><Link className="primary-btn" href="/catalog/smartphones">Смотреть коллекцию <ArrowRight size={17} /></Link></div><img className="hero-device" src="/assets/hero.png" alt="iPhone 18 Pro" /><div className="hero-side"><strong>iPhone 18 Pro</strong><span><Camera />Камера нового поколения</span><span><Cpu />Apple Intelligence</span><span><Layers />Титановый корпус</span><span><BatteryCharging />Ещё больше автономности</span></div><div className="hero-dots"><i /><i /><i /></div></section>
    <div className="brand-grid">{brands.map((brand) => <Link className="brand-card" key={brand.name} href={`/catalog?brand=${encodeURIComponent(brand.filter)}`}><div><strong>{brand.name}</strong><span>{brand.desc}</span><b className="brand-arrow"><ArrowRight size={17} /></b></div><img src={brand.image} alt="" /></Link>)}</div>
    <nav className="home-category-links" aria-label="Категории каталога">{categories.map((category) => <Link key={category.href} href={category.href}>{category.name}<ArrowRight size={15} /></Link>)}</nav>
    <Benefits />
    <section className="offers"><div className="section-head"><h2>Лучшие предложения</h2><Link href="/catalog">Настройки сайта <ArrowRight size={16} /></Link></div><div className="home-offers-empty"><p>Подборка из Control Panel не подключена. Товары не назначены как специальные предложения.</p></div></section>
    <section className="popular"><div className="section-head"><div><h2>Популярные товары</h2><small className="demo-note">Локальные демонстрационные карточки; каталог из БД не подключен.</small></div><div className="category-tabs">{categories.map((category) => <Link key={category.href} href={category.href}>{category.name}</Link>)}</div><Link href="/catalog">Смотреть все <ArrowRight size={16} /></Link></div><div className="product-grid">{products.map((product) => <ProductCard product={product} key={product.slug} />)}</div></section>
  </div>;
}
