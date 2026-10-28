"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Percent,
  Repeat2,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react";
import {
  safeDescription,
  type CatalogProductDto,
} from "@/components/catalogClient";
import CatalogProductCard from "@/components/CatalogProductCard";

type ProductDetails = CatalogProductDto & { relatedProductIds?: string[] };
type TradeInBanner = { imageUrl: string | null; isActive: boolean };
type LeadForm = {
  name: string;
  phone: string;
  device: string;
  condition: string;
  comment: string;
  consent: boolean;
};
const blankForm: LeadForm = {
  name: "",
  phone: "",
  device: "",
  condition: "",
  comment: "",
  consent: false,
};
const conditions = [
  "Отличное",
  "Хорошее",
  "Есть заметные следы использования",
  "Не включается или повреждено",
];

export default function ProductDetailsLower({
  product,
  city,
}: {
  product: ProductDetails;
  city: string;
}) {
  const [banner, setBanner] = useState<TradeInBanner | null>(null);
  const [bannerFailed, setBannerFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const [tradeInOpen, setTradeInOpen] = useState(false);
  const [lead, setLead] = useState<LeadForm>(blankForm);
  const [leadKey, setLeadKey] = useState("");
  const [sending, setSending] = useState(false);
  const [leadResult, setLeadResult] = useState<"success" | "error" | null>(
    null,
  );
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
    setLead(blankForm);
    setLeadKey(
      globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    setLeadResult(null);
    setTradeInOpen(true);
  }

  useEffect(() => {
    if (!tradeInOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sending) setTradeInOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sending, tradeInOpen]);

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || !lead.consent) return;
    setSending(true);
    setLeadResult(null);
    try {
      const response = await fetch("/api/trade-in", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": leadKey,
        },
        body: JSON.stringify({
          ...lead,
          city,
          productId: product.id,
          productSlug: product.slug,
          consent: lead.consent,
        }),
      });
      if (!response.ok) throw new Error("TRADE_IN_FAILED");
      setLeadResult("success");
    } catch {
      setLeadResult("error");
    } finally {
      setSending(false);
    }
  }

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
          className={`product-trade-banner${banner?.imageUrl && !bannerFailed ? " has-image" : ""}`}
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
          {banner?.imageUrl && !bannerFailed && (
            <img
              className="product-trade-image"
              src={banner.imageUrl}
              alt=""
              aria-hidden="true"
              onError={() => setBannerFailed(true)}
            />
          )}
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
            if (event.target === event.currentTarget && !sending)
              setTradeInOpen(false);
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
                disabled={sending}
                onClick={() => setTradeInOpen(false)}
              >
                <X size={19} />
              </button>
            </header>
            {leadResult === "success" ? (
              <div className="trade-in-success" role="status">
                <span>
                  <Check size={22} />
                </span>
                <h3>Заявка отправлена</h3>
                <p>Мы свяжемся с вами после оценки устройства.</p>
                <button type="button" onClick={() => setTradeInOpen(false)}>
                  Закрыть
                </button>
              </div>
            ) : (
              <form onSubmit={(event) => void submitLead(event)}>
                <label>
                  Имя <sup>*</sup>
                  <input
                    autoFocus
                    required
                    maxLength={120}
                    value={lead.name}
                    onChange={(event) =>
                      setLead({ ...lead, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  Телефон <sup>*</sup>
                  <input
                    type="tel"
                    required
                    autoComplete="tel"
                    maxLength={40}
                    value={lead.phone}
                    onChange={(event) =>
                      setLead({ ...lead, phone: event.target.value })
                    }
                  />
                </label>
                <label>
                  Устройство для обмена <sup>*</sup>
                  <input
                    required
                    maxLength={180}
                    value={lead.device}
                    onChange={(event) =>
                      setLead({ ...lead, device: event.target.value })
                    }
                  />
                </label>
                <label>
                  Состояние устройства
                  <select
                    value={lead.condition}
                    onChange={(event) =>
                      setLead({ ...lead, condition: event.target.value })
                    }
                  >
                    <option value="">Не выбрано</option>
                    {conditions.map((condition) => (
                      <option key={condition} value={condition}>
                        {condition}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Комментарий
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={lead.comment}
                    onChange={(event) =>
                      setLead({ ...lead, comment: event.target.value })
                    }
                  />
                </label>
                <label className="trade-in-consent">
                  <input
                    type="checkbox"
                    required
                    checked={lead.consent}
                    onChange={(event) =>
                      setLead({ ...lead, consent: event.target.checked })
                    }
                  />
                  <span>
                    Согласен на обработку персональных данных согласно{" "}
                    <Link href="/personal-data-consent" target="_blank">
                      политике обработки
                    </Link>
                    .
                  </span>
                </label>
                {leadResult === "error" && (
                  <p className="trade-in-error" role="alert">
                    Не удалось отправить заявку. Проверьте соединение и
                    повторите попытку.
                  </p>
                )}
                <button
                  className="trade-in-submit"
                  type="submit"
                  disabled={sending || !lead.consent}
                >
                  {sending ? "Отправляем…" : "Отправить заявку"}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
