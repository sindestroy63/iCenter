"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, PackageOpen } from "lucide-react";
import { useStoreState } from "./StoreState";
import { type CatalogProductDto } from "./catalogClient";
import CatalogProductCard from "./CatalogProductCard";

type ApiList<T> = { data: T[] };
type HomeBannerPlacement = "home" | "home_brand_apple" | "home_brand_samsung" | "home_brand_dyson" | "home_brand_playstation";
type HomeBanner = { id: string; placement: HomeBannerPlacement; title: string; subtitle: string | null; linkUrl: string | null; linkText: string | null; imageUrl: string | null };
type HomeBrand = { name: string; desc: string; filter: string; tone: string; placement: Exclude<HomeBannerPlacement, "home"> };
type LoadState = "loading" | "ready" | "error";

const fallbackTitle = "Технологии, которые вдохновляют.";
const fallbackSubtitle = "Apple, Samsung, Dyson и другие премиальные бренды в одном месте.";

export default function HomeCatalog({ brands }: { brands: HomeBrand[] }) {
  const { city } = useStoreState();
  const [products, setProducts] = useState<CatalogProductDto[]>([]);
  const [offerSlugs, setOfferSlugs] = useState<string[]>([]);
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [failedBannerImages, setFailedBannerImages] = useState<string[]>([]);
  const [bannerState, setBannerState] = useState<LoadState>("loading");
  const [catalogState, setCatalogState] = useState<LoadState>("loading");
  const [offersState, setOffersState] = useState<LoadState>("loading");

  useEffect(() => {
    const controller = new AbortController();
    setCatalogState("loading");
    setOffersState("loading");
    setProducts([]);
    setOfferSlugs([]);

    const query = new URLSearchParams({ city, limit: "100" });
    fetch(`/api/catalog/products?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog");
        return response.json() as Promise<ApiList<CatalogProductDto>>;
      })
      .then((catalog) => {
        if (controller.signal.aborted) return;
        setProducts(Array.isArray(catalog.data) ? catalog.data : []);
        setCatalogState("ready");
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError")) return;
        setProducts([]);
        setCatalogState("error");
      });

    fetch(`/api/catalog/best-offers?city=${encodeURIComponent(city)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("offers");
        return response.json() as Promise<ApiList<{ slug: string }>>;
      })
      .then((offers) => {
        if (controller.signal.aborted) return;
        setOfferSlugs(Array.isArray(offers.data) ? offers.data.map((item) => item.slug) : []);
        setOffersState("ready");
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError")) return;
        setOfferSlugs([]);
        setOffersState("error");
      });

    return () => controller.abort();
  }, [city]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/catalog/banners", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("banners");
        return response.json() as Promise<ApiList<HomeBanner>>;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setBanners(Array.isArray(result.data) ? result.data : []);
        setBannerState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setBanners([]);
          setBannerState("error");
        }
      });

    return () => controller.abort();
  }, []);

  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const offers = offerSlugs.map((slug) => bySlug.get(slug)).filter((product): product is CatalogProductDto => !!product);
  const unresolvedOfferSlugs = offerSlugs.filter((slug) => !bySlug.has(slug));
  const popular = products.slice(0, 4);
  const loading = catalogState === "loading";
  const error = catalogState === "error";
  const activeBanner = banners.find((banner) => banner.placement === "home");
  const cmsImage = activeBanner?.imageUrl || null;
  const heroImage = cmsImage && !failedBannerImages.includes(cmsImage) ? cmsImage : null;
  const bannerByPlacement = new Map(banners.map((banner) => [banner.placement, banner]));
  const markBannerImageFailed = (src: string) => setFailedBannerImages((current) => current.includes(src) ? current : [...current, src]);

  const renderOfferCards = (items: CatalogProductDto[]) => <div className="home-offer-grid">{items.map((product) => <CatalogProductCard key={product.slug} product={product} city={city} />)}</div>;

  return <>
    <section className="hero home-hero" aria-busy={bannerState === "loading"}>
      {heroImage && <img className="hero-device home-hero-art" src={heroImage} alt="" aria-hidden="true" fetchPriority="high" onError={() => markBannerImageFailed(heroImage)} />}
      <div className="hero-copy home-hero-copy">
        <span className="home-hero-eyebrow">Техника и гаджеты ведущих брендов</span>
        <h1>{activeBanner?.title?.trim() || fallbackTitle}</h1>
        {(activeBanner ? activeBanner.subtitle : fallbackSubtitle) && <p>{activeBanner ? activeBanner.subtitle : fallbackSubtitle}</p>}
        <Link className="primary-btn" href={activeBanner?.linkUrl || "/catalog"}>{activeBanner?.linkText || "Перейти в каталог"}<ArrowRight size={18} /></Link>
      </div>
    </section>

    <div className="brand-grid home-brand-grid">
      {brands.map((brand) => {
        const bannerImage = bannerByPlacement.get(brand.placement)?.imageUrl ?? null;
        const visibleImage = bannerImage && !failedBannerImages.includes(bannerImage) ? bannerImage : null;
        return <Link className={`brand-card home-brand-card home-brand-${brand.tone}${visibleImage ? " has-image" : ""}`} key={brand.name} href={`/catalog?brand=${encodeURIComponent(brand.filter)}`}>
          {visibleImage && <img src={visibleImage} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={() => markBannerImageFailed(visibleImage)} />}
          <div className="home-brand-copy"><div className="home-brand-label"><strong>{brand.name}</strong><span>{brand.desc}</span></div><span className="home-brand-arrow" aria-hidden="true"><ArrowRight size={17} /></span></div>
        </Link>;
      })}
    </div>

    <section className="offers home-offers">
      <div className="section-head"><h2>Лучшие предложения</h2><Link href="/catalog">Смотреть все <ArrowRight size={16} /></Link></div>
      {offersState === "loading" ? <p className="home-catalog-state">Загружаем лучшие предложения…</p> : offersState === "error" ? <div className="home-catalog-error" role="status"><p>Не удалось загрузить лучшие предложения. Попробуйте обновить страницу.</p></div> : <>
        {offers.length > 0 && renderOfferCards(offers)}
        {unresolvedOfferSlugs.length > 0 && (catalogState === "loading" ? <p className="home-catalog-state">Загружаем карточки предложений…</p> : <div className="home-catalog-error" role="status"><p>{catalogState === "error" ? "Каталог временно недоступен. Откройте предложение:" : "Карточки предложений временно недоступны. Откройте товар:"} {unresolvedOfferSlugs.map((slug, index) => <span key={slug}>{index > 0 ? ", " : ""}<Link href={`/product/${slug}`}>{slug}</Link></span>)}</p></div>)}
        {offerSlugs.length === 0 && <div className="home-catalog-state home-offers-empty"><PackageOpen size={18} /><span>Пока нет актуальных предложений.</span></div>}
      </>}
    </section>

    <section className="popular"><div className="section-head"><div><h2>Популярные товары</h2></div><Link href="/catalog">Смотреть все <ArrowRight size={16} /></Link></div>
      {loading ? <p className="home-catalog-state">Загружаем каталог…</p> : error ? <div className="home-catalog-error" role="status"><p>Не удалось загрузить каталог. Попробуйте обновить страницу.</p></div> : popular.length ? renderOfferCards(popular) : <div className="home-catalog-state"><PackageOpen size={22} /><span>В выбранном городе пока нет опубликованных товаров.</span></div>}
    </section>
  </>;
}
