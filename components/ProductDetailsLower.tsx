"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Percent,
  Repeat2,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react";
import {
  safeDescription,
  type CatalogProductDto,
  type CatalogVariantDto,
  variantAttribute,
} from "@/components/catalogClient";
import CatalogProductCard from "@/components/CatalogProductCard";
import BannerVideo from "@/components/BannerVideo";
import LeadRequestForm from "@/components/LeadRequestForm";

type ProductDetails = CatalogProductDto & { relatedProductIds?: string[] };
type TradeInBanner = { mediaUrl: string | null; mediaType: string | null; isActive: boolean };
export default function ProductDetailsLower({
  product,
  city,
  selectedVariant,
}: {
  product: ProductDetails;
  city: string;
  selectedVariant: CatalogVariantDto | null;
}) {
  const [banner, setBanner] = useState<TradeInBanner | null>(null);
  const [bannerFailed, setBannerFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const [tradeInOpen, setTradeInOpen] = useState(false);
  const [related, setRelated] = useState<CatalogProductDto[]>([]);
  const [carouselAtStart, setCarouselAtStart] = useState(true);
  const [carouselAtEnd, setCarouselAtEnd] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const description = useMemo(
    () => safeDescription(product.description).trim(),
    [product.description],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/catalog/trade-in-banner", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) =>
        response.ok
          ? (response.json() as Promise<{ data: TradeInBanner | null }>)
          : null,
      )
      .then((body) => {
        if (!controller.signal.aborted) setBanner(body?.data ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setBanner(null);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const element = descriptionRef.current;
    if (!element) return;
    setCanExpand(element.scrollHeight > element.clientHeight + 2);
  }, [description]);

  useEffect(() => {
    const ids = product.relatedProductIds ?? [];
    if (!ids.length) {
      setRelated([]);
      return;
    }
    const controller = new AbortController();
    fetch(
      `/api/catalog/products/${encodeURIComponent(product.slug)}/related?city=${encodeURIComponent(city)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) =>
        response.ok
          ? (response.json() as Promise<{
              data: Array<{ id: string; slug: string }>;
            }>)
          : { data: [] },
      )
      .then(async ({ data }) => {
        const products = await Promise.all(
          data.slice(0, 12).map(async (entry) => {
            try {
              const response = await fetch(
                `/api/catalog/products/${encodeURIComponent(entry.slug)}?city=${encodeURIComponent(city)}`,
                { signal: controller.signal, cache: "no-store" },
              );
              if (!response.ok) return null;
              return ((await response.json()) as { data: CatalogProductDto })
                .data;
            } catch {
              return null;
            }
          }),
        );
        if (!controller.signal.aborted)
          setRelated(
            products.filter((entry): entry is CatalogProductDto =>
              Boolean(entry),
            ),
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setRelated([]);
      });
    return () => controller.abort();
  }, [city, product.relatedProductIds, product.slug]);

  const updateCarousel = useCallback(() => {
    const element = carouselRef.current;
    if (!element) return;
    setCarouselAtStart(element.scrollLeft <= 2);
    setCarouselAtEnd(
      element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
    );
  }, []);

  useEffect(() => {
    updateCarousel();
    window.addEventListener("resize", updateCarousel);
    return () => window.removeEventListener("resize", updateCarousel);
  }, [related.length, updateCarousel]);

  function openTradeIn() {
    setTradeInOpen(true);
  }

  useEffect(() => {
    if (!tradeInOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTradeInOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [tradeInOpen]);

  function scrollCarousel(direction: -1 | 1) {
    const element = carouselRef.current;
    if (element)
      element.scrollBy({
        left: direction * element.clientWidth * 0.82,
        behavior: "smooth",
      });
  }

  return (
    <div className="product-lower">
      <section className="product-benefits" aria-label="Условия покупки">
        <Link className="product-benefit" href="/trade-in">
          <span>
            <Repeat2 size={22} />
          </span>
          <div>
            <h2>Trade-in</h2>
            <p>Выгодный обмен вашего устройства</p>
          </div>
        </Link>
        <Link className="product-benefit" href="/installment">
          <span>
            <Percent size={22} />
          </span>
          <div>
            <h2>Рассрочка</h2>
            <p>Удобная оплата частями</p>
          </div>
        </Link>
        <Link className="product-benefit" href="/warranty">
          <span>
            <ShieldCheck size={22} />
          </span>
          <div>
            <h2>Гарантия</h2>
            <p>Гарантия и поддержка</p>
          </div>
        </Link>
        <Link className="product-benefit" href="/delivery">
          <span>
            <Truck size={22} />
          </span>
          <div>
            <h2>Доставка</h2>
            <p>Доставка в ваш город</p>
          </div>
        </Link>
      </section>

      {banner?.isActive !== false && (
        <section
          className={`product-trade-banner${banner?.mediaUrl && !bannerFailed ? " has-image" : ""}`}
          aria-labelledby="product-trade-title"
        >
          <div className="product-trade-copy">
            <span className="product-trade-eyebrow">TRADE-IN</span>
            <h2 id="product-trade-title">
              Сдай старое устройство
              <br className="product-trade-desktop-break" /> и получи скидку
              <br className="product-trade-desktop-break" /> на новый iPhone
            </h2>
            <p>Оценим ваше устройство и предложим выгодные условия обмена.</p>
            <button
              type="button"
              className="product-trade-cta"
              onClick={openTradeIn}
            >
              Узнать стоимость <ArrowRight size={17} />
            </button>
          </div>
          {banner?.mediaUrl && !bannerFailed && (banner.mediaType?.startsWith("video/")
            ? <BannerVideo src={banner.mediaUrl} className="product-trade-image" onError={() => setBannerFailed(true)} />
            : <img className="product-trade-image" src={banner.mediaUrl} alt="" aria-hidden="true" onError={() => setBannerFailed(true)} />)}
        </section>
      )}

      {description && (
        <section
          className="product-description-lower"
          aria-labelledby="product-description-heading"
        >
          <h2 id="product-description-heading">Описание</h2>
          <div
            ref={descriptionRef}
            className={`product-description-copy${expanded ? " expanded" : ""}`}
          >
            <p>{description}</p>
          </div>
          {canExpand && (
            <button
              type="button"
              className="product-description-toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Свернуть" : "Показать всё"}
            </button>
          )}
        </section>
      )}

      {related.length > 0 && (
        <section
          className="related-products"
          aria-labelledby="related-products-heading"
        >
          <div className="related-products-heading">
            <h2 id="related-products-heading">С этим товаром также покупают</h2>
            <div className="related-products-controls">
              <button
                type="button"
                aria-label="Предыдущие товары"
                onClick={() => scrollCarousel(-1)}
                disabled={carouselAtStart}
              >
                <ArrowLeft size={18} />
              </button>
              <button
                type="button"
                aria-label="Следующие товары"
                onClick={() => scrollCarousel(1)}
                disabled={carouselAtEnd}
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
          <div
            className="related-products-track"
            ref={carouselRef}
            onScroll={updateCarousel}
          >
            {related.map((item) => (
              <CatalogProductCard
                key={item.id}
                product={item}
                city={city}
                compact
                layout="catalog"
              />
            ))}
          </div>
        </section>
      )}

      {tradeInOpen && (
        <div
          className="trade-in-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTradeInOpen(false);
          }}
        >
          <section
            className="trade-in-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trade-in-dialog-title"
          >
            <header>
              <div>
                <h2 id="trade-in-dialog-title">
                  Оценка устройства по Trade-in
                </h2>
                <p>
                  Расскажите о вашем устройстве — мы свяжемся с вами и предложим
                  условия обмена.
                </p>
              </div>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setTradeInOpen(false)}
              >
                <X size={19} />
              </button>
            </header>
            <LeadRequestForm
              mode="trade_in"
              compact
              productId={product.id}
              productSlug={product.slug}
            />
          </section>
        </div>
      )}
    </div>
  );
}
