"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, PackageOpen } from "lucide-react";
import { useStoreState } from "./StoreState";
import { type CatalogProductDto } from "./catalogClient";
import CatalogProductCard from "./CatalogProductCard";
import BannerVideo from "./BannerVideo";

type ApiList<T> = { data: T[] };
type HomeBannerPlacement = "home" | "home_brand_apple" | "home_brand_samsung" | "home_brand_dyson" | "home_brand_playstation";
type HomeBanner = { id: string; placement: HomeBannerPlacement; title: string; subtitle: string | null; linkUrl: string | null; linkText: string | null; mediaUrl: string | null; mediaType: string | null };
type HomeBrand = { name: string; desc: string; filter: string; tone: string; placement: Exclude<HomeBannerPlacement, "home"> };
type LoadState = "loading" | "ready" | "error";
type CollectionRef = { productId: string; slug: string; variantId: string | null };
type CollectionResponse = ApiList<CollectionRef> & { configured: boolean };

const fallbackTitle = "Технологии, которые вдохновляют.";
export default function HomeCatalog({ brands }: { brands: HomeBrand[] }) {
  const { city } = useStoreState();
  const [products, setProducts] = useState<CatalogProductDto[]>([]);
  const [collectionProducts, setCollectionProducts] = useState<CatalogProductDto[]>([]);
  const [offerRefs, setOfferRefs] = useState<CollectionRef[]>([]);
  const [popularRefs, setPopularRefs] = useState<CollectionRef[]>([]);
  const [popularConfigured, setPopularConfigured] = useState(false);
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [failedBannerMedia, setFailedBannerMedia] = useState<string[]>([]);
  const [bannerState, setBannerState] = useState<LoadState>("loading");
  const [catalogState, setCatalogState] = useState<LoadState>("loading");
  const [offersState, setOffersState] = useState<LoadState>("loading");
  const [popularState, setPopularState] = useState<LoadState>("loading");
  const attemptedCollectionSlugs = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    setCatalogState("loading");
    setOffersState("loading");
    setPopularState("loading");
    setProducts([]);
    setCollectionProducts([]);
    attemptedCollectionSlugs.current.clear();
    setOfferRefs([]);
    setPopularRefs([]);

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
        return response.json() as Promise<CollectionResponse>;
      })
      .then((offers) => {
        if (controller.signal.aborted) return;
        setOfferRefs(Array.isArray(offers.data) ? offers.data : []);
        setOffersState("ready");
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError")) return;
        setOfferRefs([]);
        setOffersState("error");
      });

    fetch(`/api/catalog/popular-products?city=${encodeURIComponent(city)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("popular");
        return response.json() as Promise<CollectionResponse>;
      })
      .then((popular) => {
        if (controller.signal.aborted) return;
        setPopularRefs(Array.isArray(popular.data) ? popular.data : []);
        setPopularConfigured(Boolean(popular.configured));
        setPopularState("ready");
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError")) return;
        setPopularRefs([]); setPopularConfigured(false); setPopularState("error");
      });

    return () => controller.abort();
  }, [city]);

  useEffect(() => {
    if (catalogState !== "ready") return;
    const known = new Set([...products, ...collectionProducts].map((product) => product.slug));
    const missing = Array.from(new Set([...offerRefs, ...popularRefs].map((entry) => entry.slug))).filter((slug) => !known.has(slug) && !attemptedCollectionSlugs.current.has(slug));
    if (!missing.length) return;
    missing.forEach((slug) => attemptedCollectionSlugs.current.add(slug));
    const controller = new AbortController();
    Promise.all(missing.map((slug) => fetch(`/api/catalog/products/${encodeURIComponent(slug)}?city=${encodeURIComponent(city)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json() as { data?: CatalogProductDto }).data ?? null : null)
      .catch(() => null)))
      .then((items) => {
        if (controller.signal.aborted) return;
        setCollectionProducts((current) => {
          const merged = new Map(current.map((product) => [product.slug, product]));
          for (const product of items) if (product) merged.set(product.slug, product);
          return Array.from(merged.values());
        });
      });
    return () => controller.abort();
  }, [catalogState, city, collectionProducts, offerRefs, popularRefs, products]);

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

  const bySlug = new Map([...products, ...collectionProducts].map((product) => [product.slug, product]));
  const resolveRefs = (refs: CollectionRef[]) => refs.map((entry) => ({ entry, product: bySlug.get(entry.slug) })).filter((item): item is { entry: CollectionRef; product: CatalogProductDto } => !!item.product);
  const offers = resolveRefs(offerRefs);
  const unresolvedOfferRefs = offerRefs.filter((entry) => !bySlug.has(entry.slug));
  const configuredPopular = resolveRefs(popularRefs);
  const popular = popularConfigured ? configuredPopular : products.slice(0, 4).map((product) => ({ product, entry: { productId: product.id, slug: product.slug, variantId: null } }));
  const loading = catalogState === "loading";
  const error = catalogState === "error";
  const activeBanner = banners.find((banner) => banner.placement === "home");
  const cmsMedia = activeBanner?.mediaUrl || null;
  const heroMedia = cmsMedia && !failedBannerMedia.includes(cmsMedia) ? cmsMedia : null;
  const heroIsVideo = activeBanner?.mediaType?.startsWith("video/") ?? false;
  const bannerByPlacement = new Map(banners.map((banner) => [banner.placement, banner]));
  const markBannerMediaFailed = (src: string) => setFailedBannerMedia((current) => current.includes(src) ? current : [...current, src]);

  const renderOfferCards = (items: Array<{ product: CatalogProductDto; entry: CollectionRef }>) => <div className="home-offer-grid">{items.map(({ product, entry }) => <CatalogProductCard key={`${entry.productId}:${entry.variantId ?? "product"}`} product={product} variantId={entry.variantId ?? undefined} city={city} />)}</div>;

  return <>
    <section className="hero home-hero" aria-busy={bannerState === "loading"}>
      {heroMedia && (heroIsVideo ? <BannerVideo src={heroMedia} className="hero-device home-hero-art home-hero-video" eager onError={() => markBannerMediaFailed(heroMedia)} /> : <img className="hero-device home-hero-art" src={heroMedia} alt="" aria-hidden="true" fetchPriority="high" onError={() => markBannerMediaFailed(heroMedia)} />)}
      <div className="hero-copy home-hero-copy">
        <h1>{activeBanner?.title?.trim() || fallbackTitle}</h1>
        <Link className="primary-btn" href={activeBanner?.linkUrl || "/catalog"}>{activeBanner?.linkText || "Перейти в каталог"}<ArrowRight size={18} /></Link>
      </div>
    </section>

    <div className="brand-grid home-brand-grid">
      {brands.map((brand) => {
        const banner = bannerByPlacement.get(brand.placement);
        const bannerMedia = banner?.mediaUrl ?? null;
        const visibleMedia = bannerMedia && !failedBannerMedia.includes(bannerMedia) ? bannerMedia : null;
        const isVideo = banner?.mediaType?.startsWith("video/") ?? false;
        return <Link className={`brand-card home-brand-card home-brand-${brand.tone}${visibleMedia ? " has-image" : ""}`} key={brand.name} href={`/catalog?brand=${encodeURIComponent(brand.filter)}`}>
          {visibleMedia && (isVideo ? <BannerVideo src={visibleMedia} className="home-brand-media" onError={() => markBannerMediaFailed(visibleMedia)} /> : <img className="home-brand-media" src={visibleMedia} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={() => markBannerMediaFailed(visibleMedia)} />)}
          <div className="home-brand-copy"><div className="home-brand-label"><strong>{brand.name}</strong><span>{brand.desc}</span></div><span className="home-brand-arrow" aria-hidden="true"><ArrowRight size={17} /></span></div>
        </Link>;
      })}
    </div>

    <section className="offers home-offers">
      <div className="section-head"><h2>Лучшие предложения</h2><Link href="/catalog">Смотреть все <ArrowRight size={16} /></Link></div>
      {offersState === "loading" ? <p className="home-catalog-state">Загружаем лучшие предложения…</p> : offersState === "error" ? <div className="home-catalog-error" role="status"><p>Не удалось загрузить лучшие предложения. Попробуйте обновить страницу.</p></div> : <>
        {offers.length > 0 && renderOfferCards(offers)}
        {unresolvedOfferRefs.length > 0 && (catalogState === "loading" ? <p className="home-catalog-state">Загружаем карточки предложений…</p> : <div className="home-catalog-error" role="status"><p>{catalogState === "error" ? "Каталог временно недоступен. Откройте предложение:" : "Карточки предложений временно недоступны. Откройте товар:"} {unresolvedOfferRefs.map((entry, index) => <span key={`${entry.productId}:${entry.variantId ?? "product"}`}>{index > 0 ? ", " : ""}<Link href={`/product/${entry.slug}${entry.variantId ? `?variant=${encodeURIComponent(entry.variantId)}` : ""}`}>{entry.slug}</Link></span>)}</p></div>)}
        {offerRefs.length === 0 && <div className="home-catalog-state home-offers-empty"><PackageOpen size={18} /><span>Пока нет актуальных предложений.</span></div>}
      </>}
    </section>

    <section className="popular"><div className="section-head"><div><h2>Популярные товары</h2></div><Link href="/catalog">Смотреть все <ArrowRight size={16} /></Link></div>
      {loading || popularState === "loading" ? <p className="home-catalog-state">Загружаем каталог…</p> : error || popularState === "error" ? <div className="home-catalog-error" role="status"><p>Не удалось загрузить популярные товары. Попробуйте обновить страницу.</p></div> : popular.length ? renderOfferCards(popular) : <div className="home-catalog-state"><PackageOpen size={22} /><span>{popularConfigured ? "В подборке пока нет доступных товаров для выбранного города." : "В выбранном городе пока нет опубликованных товаров."}</span></div>}
    </section>
  </>;
}
