"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, PackageOpen } from "lucide-react";
import { useStoreState } from "./StoreState";
import { type CatalogProductDto } from "./catalogClient";
import CatalogProductCard from "./CatalogProductCard";
import BannerVideo from "./BannerVideo";
import { catalogProductCategoryHref, type CatalogMenuAction } from "@/lib/catalog-menu";

type ApiList<T> = { data: T[] };
type HomeBannerPlacement = "home" | "home_brand_apple" | "home_brand_samsung" | "home_brand_dyson" | "home_brand_playstation";
type HomeBanner = { id: string; placement: HomeBannerPlacement; title: string; subtitle: string | null; linkUrl: string | null; linkText: string | null; mediaUrl: string | null; optimizedMediaUrl?: string | null; optimizedPosterUrl?: string | null; mediaType: string | null };
type HomeBrand = { id: string; name: string; desc: string; href: string | null; tone: string; imageUrl: string | null; imageType: string | null; posterUrl: string | null; imageAlt: string };
type CatalogMenuItem = { id: string; title: string; description?: string; href: string | null; action?: CatalogMenuAction | null; productIds?: string[]; children: CatalogMenuItem[]; banner?: { imageUrl: string | null; alt?: string } | null; promoBanner?: { imageUrl: string | null; alt?: string } | null };
type LoadState = "loading" | "ready" | "error";
type CollectionRef = { productId: string; slug: string; variantId: string | null };
type CollectionResponse = ApiList<CollectionRef> & { configured: boolean };

const fallbackTitle = "Технологии, которые вдохновляют.";
export default function HomeCatalog() {
  const { city } = useStoreState();
  const [products, setProducts] = useState<CatalogProductDto[]>([]);
  const [collectionProducts, setCollectionProducts] = useState<CatalogProductDto[]>([]);
  const [offerRefs, setOfferRefs] = useState<CollectionRef[]>([]);
  const [popularRefs, setPopularRefs] = useState<CollectionRef[]>([]);
  const [popularConfigured, setPopularConfigured] = useState(false);
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [catalogBrands, setCatalogBrands] = useState<HomeBrand[]>([]);
  const [catalogMenu, setCatalogMenu] = useState<CatalogMenuItem[]>([]);
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

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/catalog/menu?city=${encodeURIComponent(city)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("menu");
        return response.json() as Promise<{ data?: CatalogMenuItem[] }>;
      })
      .then((body) => {
        if (controller.signal.aborted) return;
        const menuItems = body.data ?? [];
        setCatalogMenu(menuItems);
        const toneFor = (item: CatalogMenuItem) => {
          const value = `${item.id} ${item.title}`.toLocaleLowerCase("ru-RU");
          return /apple/.test(value) ? "apple" : /samsung/.test(value) ? "samsung" : /dyson/.test(value) ? "dyson" : /playstation|консол/.test(value) ? "playstation" : "generic";
        };
        const placementByRoot: Record<string, HomeBannerPlacement> = {
          apple: "home_brand_apple",
          samsung: "home_brand_samsung",
          dyson: "home_brand_dyson",
          consoles: "home_brand_playstation",
          playstation: "home_brand_playstation",
        };
        const bannerByPlacement = new Map(banners.map((banner) => [banner.placement, banner]));
        setCatalogBrands(menuItems.filter((item) => placementByRoot[item.id]).map((item) => {
          const visualBanner = bannerByPlacement.get(placementByRoot[item.id]);
          return {
          id: item.id,
          name: item.title,
          desc: item.description || "",
          href: item.href,
          tone: toneFor(item),
          imageUrl: visualBanner?.optimizedMediaUrl ?? visualBanner?.mediaUrl ?? null,
          imageType: visualBanner?.mediaType ?? null,
          posterUrl: visualBanner?.optimizedPosterUrl ?? null,
          imageAlt: visualBanner?.title ?? item.title,
        }; }));
      })
      .catch(() => { if (!controller.signal.aborted) { setCatalogBrands([]); setCatalogMenu([]); } });
    return () => controller.abort();
  }, [banners, city]);

  const bySlug = new Map([...products, ...collectionProducts].map((product) => [product.slug, product]));
  const resolveRefs = (refs: CollectionRef[]) => refs.map((entry) => ({ entry, product: bySlug.get(entry.slug) })).filter((item): item is { entry: CollectionRef; product: CatalogProductDto } => !!item.product);
  const offers = resolveRefs(offerRefs);
  const unresolvedOfferRefs = offerRefs.filter((entry) => !bySlug.has(entry.slug));
  const configuredPopular = resolveRefs(popularRefs);
  const popular = popularConfigured ? configuredPopular : products.slice(0, 4).map((product) => ({ product, entry: { productId: product.id, slug: product.slug, variantId: null } }));
  const loading = catalogState === "loading";
  const error = catalogState === "error";
  const heroBanners = banners.filter((banner) => banner.placement === "home" && banner.mediaUrl && !failedBannerMedia.includes(banner.mediaUrl));
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    setHeroIndex((current) => heroBanners.length ? current % heroBanners.length : 0);
  }, [heroBanners.length]);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    if (heroPaused || reducedMotion || heroBanners.length < 2) return;
    const timer = window.setTimeout(() => setHeroIndex((current) => (current + 1) % heroBanners.length), 5000);
    return () => window.clearTimeout(timer);
  }, [heroIndex, heroPaused, reducedMotion, heroBanners.length]);
  const activeBanner = heroBanners[heroIndex] ?? null;
  const heroMedia = activeBanner?.mediaUrl ?? null;
  const heroIsVideo = activeBanner?.mediaType?.startsWith("video/") ?? false;
  const markBannerMediaFailed = (src: string) => setFailedBannerMedia((current) => current.includes(src) ? current : [...current, src]);

  const renderOfferCards = (items: Array<{ product: CatalogProductDto; entry: CollectionRef }>) => <div className="home-offer-grid">{items.map(({ product, entry }) => <CatalogProductCard key={`${entry.productId}:${entry.variantId ?? "product"}`} product={product} variantId={entry.variantId ?? undefined} city={city} categoryHref={catalogProductCategoryHref(catalogMenu, product)} />)}</div>;

  return <>
    <section className="hero home-hero" aria-busy={bannerState === "loading"} onMouseEnter={() => setHeroPaused(true)} onMouseLeave={() => setHeroPaused(false)} onFocus={() => setHeroPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeroPaused(false); }}>
      {heroMedia && (heroIsVideo ? <BannerVideo key={activeBanner?.id} src={heroMedia} className="hero-device home-hero-art home-hero-video" eager poster="/assets/home-hero-poster.jpg" onError={() => markBannerMediaFailed(heroMedia)} /> : <img key={activeBanner?.id} className="hero-device home-hero-art" src={heroMedia} alt="" aria-hidden="true" fetchPriority="high" onError={() => markBannerMediaFailed(heroMedia)} />)}
      {!heroMedia && <div className="home-hero-fallback" aria-hidden="true" />}
      <div className="hero-copy home-hero-copy">
        {activeBanner?.title?.trim() && <div className="home-hero-title"><h1>{activeBanner.title}</h1></div>}
        {activeBanner?.subtitle?.trim() && <p className="home-hero-subtitle">{activeBanner.subtitle}</p>}
        {activeBanner?.linkUrl && activeBanner.linkText?.trim() && <Link className="primary-btn" href={activeBanner.linkUrl}>{activeBanner.linkText}<ArrowRight size={18} /></Link>}
        {!activeBanner && <div className="home-hero-title"><h1>{fallbackTitle}</h1></div>}
      </div>
      {heroBanners.length > 1 && <><button type="button" className="home-hero-control home-hero-prev" aria-label="Предыдущий слайд" onClick={() => setHeroIndex((current) => (current - 1 + heroBanners.length) % heroBanners.length)}><ArrowLeft size={18} /></button><button type="button" className="home-hero-control home-hero-next" aria-label="Следующий слайд" onClick={() => setHeroIndex((current) => (current + 1) % heroBanners.length)}><ArrowRight size={18} /></button><div className="home-hero-dots" role="tablist" aria-label="Слайды">{heroBanners.map((banner, index) => <button key={banner.id} type="button" role="tab" aria-selected={index === heroIndex} aria-label={`Слайд ${index + 1}`} className={index === heroIndex ? "is-active" : ""} onClick={() => setHeroIndex(index)} />)}</div></>}
    </section>

    <div className="brand-grid home-brand-grid">
      {catalogBrands.map((brand) => {
        const visibleMedia = brand.imageUrl && !failedBannerMedia.includes(brand.imageUrl) ? brand.imageUrl : null;
        const mediaIsVideo = brand.imageType?.startsWith("video/") ?? false;
        const poster = brand.posterUrl && !failedBannerMedia.includes(brand.posterUrl) ? brand.posterUrl : null;
        const content = <>{visibleMedia && (!mediaIsVideo ? <img className="home-brand-media" src={visibleMedia} alt={brand.imageAlt} aria-hidden="true" loading="eager" decoding="async" onError={() => markBannerMediaFailed(visibleMedia)} /> : <BannerVideo src={visibleMedia} className="home-brand-media" poster={poster ?? undefined} onError={() => markBannerMediaFailed(visibleMedia)} />)}<div className="home-brand-copy"><div className="home-brand-label"><strong>{brand.name}</strong>{brand.desc && <span>{brand.desc}</span>}</div>{brand.href && <span className="home-brand-arrow" aria-hidden="true"><ArrowRight size={17} /></span>}</div></>;
        const className = `brand-card home-brand-card home-brand-${brand.tone}${visibleMedia || poster ? " has-image" : ""}`;
        return brand.href ? <Link className={className} key={brand.id} href={brand.href}>{content}</Link> : <div className={className} key={brand.id}>{content}</div>;
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
