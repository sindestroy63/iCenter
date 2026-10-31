"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Gamepad2, Grid2X2, Heart, House, Laptop, Minus, PackageOpen, Plus, ShoppingCart, Smartphone, Tablet } from "lucide-react";
import { formatCartVariantDetails, useStoreState } from "./StoreState";
import ProductDetailsLower from "./ProductDetailsLower";
import { productImage, variantAttribute, type CatalogProductDto, type CatalogVariantDto } from "./catalogClient";
import { compareMemoryValues } from "@/lib/product-dictionaries";
import { catalogColorDetails, catalogColorHex, catalogColorLabel } from "@/lib/catalog-colors";
import ColorName from "./ColorName";
import { useProductReveal } from "./ProductRevealProvider";
import ProductPriceNotice from "./ProductPriceNotice";
import { tradeInProductDetails } from "@/lib/trade-in-product";

function canonicalAttributeKey(key: string) { return key === "memory" ? "storage" : key === "sim" ? "simType" : key; }
function productVariantAttribute(variant: CatalogVariantDto, key: string) {
  const direct = variantAttribute(variant, key);
  if (direct) return direct;
  const alias = key === "storage" ? "memory" : key === "simType" ? "sim" : "";
  return alias ? variantAttribute(variant, alias) : "";
}

function formatPrice(value: string | null) { return value === null ? "Уточняйте цену" : `${Number(value).toLocaleString("ru-RU")} ₽`; }
function availabilityText(value: CatalogVariantDto["availability"]) { return value === "IN_STOCK" ? "В наличии" : value === "PREORDER" ? "Под заказ 1–2 дня" : value === "OUT_OF_STOCK" ? "Нет в наличии" : "Уточняйте наличие"; }
const categoryIcons = { smartphones: Smartphone, tablets: Tablet, laptops: Laptop, appliances: House, consoles: Gamepad2 };

export default function ProductView({ slug, initialVariantId = "" }: { slug: string; initialVariantId?: string }) {
  const router = useRouter();
  const { city, addToCart, toggleFavorite, isFavorite } = useStoreState();
  const { isTarget } = useProductReveal();
  const [product, setProduct] = useState<CatalogProductDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selection, setSelection] = useState("");
  const [image, setImage] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(false); setProduct(null); setSelection(""); setImage(0); setFailedImages(new Set());
    fetch(`/api/catalog/products/${encodeURIComponent(slug)}?city=${encodeURIComponent(city)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error("Product not found"); return r.json() as Promise<{ data: CatalogProductDto; canonicalSlug?: string }>; })
      .then((body) => { if (!body.data?.variants) throw new Error("Invalid product response"); setProduct(body.data); setSelection(body.data.variants.some((variant) => variant.id === initialVariantId) ? initialVariantId : body.data.variants[0]?.id ?? ""); if (body.canonicalSlug && body.canonicalSlug !== slug) router.replace(`/product/${encodeURIComponent(body.canonicalSlug)}${window.location.search}`, { scroll: false }); })
      .catch((cause: unknown) => { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, city, initialVariantId, router]);
  useEffect(() => {
    if (!loading && isTarget(slug, initialVariantId)) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [initialVariantId, isTarget, loading, slug]);
  const variants = product?.variants ?? [];
  const selectedVariant = variants.find((v) => v.id === selection) ?? variants[0];
  useEffect(() => { setImage(0); }, [selectedVariant?.color?.id]);
  const images = useMemo(() => {
    if (!product) return [];
    const colorImages = selectedVariant?.color ? product.images.filter((entry) => entry.colorId === selectedVariant.color?.id) : [];
    const sharedImages = product.images.filter((entry) => entry.colorId === null);
    return (colorImages.length ? colorImages : sharedImages).filter((entry) => entry.src);
  }, [product, selectedVariant]);
  const visibleImages = images.filter((entry) => entry.src && !failedImages.has(entry.id));
  const markImageFailed = (id: string) => {
    setFailedImages((current) => new Set(current).add(id));
    setImage(0);
  };
  const favorite = isFavorite(slug);
  const isIphone = product?.brand.slug === "apple" && product.category.slug === "smartphones";
  const attrs = Array.from(new Set(variants.flatMap((v) => Object.keys(v.attributes ?? {}).map(canonicalAttributeKey))))
    .filter((key) => !isIphone || ["storage", "simType"].includes(key));
  const resolveSelection = (override: { key?: string; value?: string; colorId?: string } = {}) => {
    if (!selectedVariant) return undefined;
    const currentColorId = selectedVariant.color?.id ?? "";
    const matchesRequested = variants.filter((candidate) => {
      if (override.colorId !== undefined && (candidate.color?.id ?? "") !== override.colorId) return false;
      if (override.key !== undefined && productVariantAttribute(candidate, override.key) !== override.value) return false;
      return true;
    });
    if (!matchesRequested.length) return undefined;

    const exact = matchesRequested.find((candidate) => {
      if (override.colorId === undefined && (candidate.color?.id ?? "") !== currentColorId) return false;
      return attrs.every((key) => key === override.key || productVariantAttribute(candidate, key) === productVariantAttribute(selectedVariant, key));
    });
    if (exact) return exact;

    return matchesRequested
      .map((candidate, index) => {
        const sameColor = (candidate.color?.id ?? "") === currentColorId;
        const preservedAttributes = attrs.reduce((score, key) => score + (key !== override.key && productVariantAttribute(candidate, key) === productVariantAttribute(selectedVariant, key) ? 1 : 0), 0);
        return { candidate, index, score: preservedAttributes + (override.colorId === undefined && sameColor ? 1 : 0), sameColor };
      })
      .sort((left, right) => right.score - left.score || Number(right.sameColor) - Number(left.sameColor) || left.index - right.index)[0]?.candidate;
  };
  const setVariantAttribute = (key: string, value: string) => {
    const next = resolveSelection({ key, value });
    if (next) setSelection(next.id);
  };
  const setVariantColor = (colorId: string) => {
    const next = resolveSelection({ colorId });
    if (next) setSelection(next.id);
  };
  const valueAvailable = (key: string, value: string) => variants.some((candidate) => productVariantAttribute(candidate, key) === value);
  const colorAvailable = (colorId: string) => variants.some((candidate) => candidate.color?.id === colorId);
  const canPurchase = Boolean(selectedVariant && selectedVariant.price !== null && ["IN_STOCK", "PREORDER"].includes(selectedVariant.availability));
  const add = () => { if (!product || !selectedVariant || !canPurchase) return; const fallbackLabel = product.brand.slug === "dyson" && !selectedVariant.color ? null : selectedVariant.label; addToCart({ productId: product.id, variantId: selectedVariant.id, slug: product.slug, name: product.name, image: images[0]?.src ?? productImage(product), details: formatCartVariantDetails(selectedVariant.color ? catalogColorDetails(selectedVariant.color) : null, selectedVariant.attributes, fallbackLabel), price: selectedVariant.price === null ? null : Number(selectedVariant.price), priceCity: city, availability: selectedVariant.availability, city }, quantity); setAdded(true); window.setTimeout(() => setAdded(false), 1300); };

  if (loading) return <div className="layout-container loading-state">Загрузка товара…</div>;
  if (error || !product) return <div className="layout-container empty-state product-not-found"><h1>{error ? "Не удалось загрузить товар" : "Товар не найден"}</h1><p>{error ? "Проверьте соединение и повторите попытку." : "Опубликованный товар недоступен для выбранного города."}</p><Link href="/catalog">Вернуться в каталог</Link></div>;
  const CategoryIcon = categoryIcons[product.category.slug as keyof typeof categoryIcons] ?? Grid2X2;
  const usedDetails = tradeInProductDetails(product.specifications);
  return <div className={`product-page layout-container${isTarget(slug, initialVariantId) ? " is-cinematic-arrival" : ""}`}>
    <div className="product-layout">
      <section className="product-gallery" aria-label="Фотографии товара">
        <div className="product-main-image">
          {visibleImages.length > 1 && <>
            <button type="button" className="gallery-nav prev" onClick={() => setImage((image - 1 + visibleImages.length) % visibleImages.length)} aria-label="Предыдущее фото"><ArrowLeft /></button>
            <button type="button" className="gallery-nav next" onClick={() => setImage((image + 1) % visibleImages.length)} aria-label="Следующее фото"><ArrowRight /></button>
          </>}
          <div className={`gallery-image-button${visibleImages[image] ? "" : " is-empty"}`} aria-live="polite">
            {visibleImages[image]?.src ? <img key={visibleImages[image].id} className="gallery-main-photo" src={visibleImages[image].src!} alt={visibleImages[image].alt || product.name} onError={() => markImageFailed(visibleImages[image].id)} /> : <><PackageOpen size={58} aria-hidden="true" /><span>Фото скоро появится</span></>}
          </div>
          {visibleImages.length > 1 && <div className="gallery-dots" aria-label="Выбрать фотографию">{visibleImages.map((entry, index) => <button key={entry.id} type="button" className={index === image ? "active" : ""} aria-label={`Фото ${index + 1}`} aria-current={index === image ? "true" : undefined} onClick={() => setImage(index)} />)}</div>}
        </div>
        <div className="product-thumbs" aria-label="Миниатюры фотографий">{visibleImages.map((entry, index) => <button key={entry.id} type="button" className={index === image ? "active" : ""} onClick={() => setImage(index)} aria-label={`Показать фото ${index + 1}`} aria-pressed={index === image}><img src={entry.src!} alt={entry.alt || `${product.name}, изображение ${index + 1}`} onError={() => markImageFailed(entry.id)} /></button>)}</div>
      </section>
      <section className="product-info" aria-label="Информация о товаре">
        <div className="product-title-row">
          <Link className="product-category-badge" href={`/catalog?category=${encodeURIComponent(product.category.slug)}`}><CategoryIcon size={16} aria-hidden="true" /><span>{product.category.name}</span><ChevronRight size={15} className="category-badge-arrow" aria-hidden="true" /></Link>
          <button type="button" className={`product-favorite ${favorite ? "active" : ""}`} onClick={() => toggleFavorite(slug)} aria-label={favorite ? "Удалить из избранного" : "Добавить в избранное"} aria-pressed={favorite}><Heart fill={favorite ? "currentColor" : "none"} /></button>
        </div>
        <div className="product-heading-line"><h1>{product.name}</h1>{usedDetails.isUsed&&<span className="product-used-badge">Б/у</span>}</div>
        {usedDetails.isUsed&&<div className="product-used-details">{usedDetails.condition&&<span>Состояние: {usedDetails.condition}</span>}{usedDetails.batteryHealth!==null&&<span>Аккумулятор: {usedDetails.batteryHealth}%</span>}{usedDetails.equipment&&<span>Комплект: {usedDetails.equipment}</span>}{usedDetails.defects&&<span>Особенности: {usedDetails.defects}</span>}</div>}
        <div className="availability"><span className={`availability-dot availability-dot-${selectedVariant?.availability?.toLowerCase() ?? "unspecified"}`} aria-hidden="true" />{selectedVariant ? availabilityText(selectedVariant.availability) : "Нет доступных вариантов"}</div>
        <hr className="product-divider product-availability-divider" />
        <div className="product-price">{formatPrice(selectedVariant?.price ?? null)}</div>
        <ProductPriceNotice brand={product.brand} />
        <hr className="product-divider" />
        <div className="product-options">
          {selectedVariant?.color && <fieldset className="product-color-fieldset"><legend><span>Цвет</span><ColorName color={selectedVariant.color} /></legend><div className="color-options">{Array.from(new Map(variants.filter((v) => v.color).map((v) => [v.color!.id, v.color!])).values()).map((color) => { const hex=catalogColorHex(color); const label=catalogColorLabel(color); return <button key={color.id} type="button" className={`${selectedVariant.color?.id === color.id ? "selected" : ""}${hex ? "" : " neutral-color"}`} style={hex ? { background: hex } : undefined} onClick={() => setVariantColor(color.id)} disabled={!colorAvailable(color.id)} aria-label={label} title={label} aria-pressed={selectedVariant.color?.id === color.id} />; })}</div></fieldset>}
          {attrs.map((key) => { const values = Array.from(new Set(variants.map((v) => productVariantAttribute(v, key)).filter(Boolean))).sort(key === "storage" ? compareMemoryValues : undefined); if (!values.length) return null; const selectedValue = productVariantAttribute(selectedVariant!, key); const label = key === "storage" ? "Объём памяти" : key === "simType" ? "SIM-карта" : key === "ram" ? "Оперативная память" : key === "connectivity" ? "Подключение" : key === "size" ? "Размер" : key === "material" ? "Материал" : key; return <fieldset key={key}><legend>{label}: <b>{selectedValue || "Не указано"}</b></legend><div className="option-grid">{values.map((value) => <button key={value} type="button" className={selectedValue === value ? "selected" : ""} onClick={() => setVariantAttribute(key, value)} disabled={!valueAvailable(key, value)} aria-pressed={selectedValue === value}>{value}</button>)}</div></fieldset>; })}
        </div>
        <hr className="product-divider product-options-divider" />
        {selectedVariant ? <div className="product-purchase-actions"><div className="product-quantity"><span>Количество</span><div><button type="button" onClick={() => setQuantity((v) => Math.max(1, v - 1))} aria-label="Уменьшить количество"><Minus size={16} /></button><b>{quantity}</b><button type="button" onClick={() => setQuantity((v) => v + 1)} aria-label="Увеличить количество"><Plus size={16} /></button></div></div><button type="button" className={`add-cart${added ? " added" : ""}`} disabled={!canPurchase} onClick={add}>{added ? <Check size={20} /> : <ShoppingCart size={20} />}{added ? "Добавлено в корзину" : canPurchase ? "Добавить в корзину" : "Недоступно для покупки"}</button></div> : <p className="variant-unavailable">Этот вариант недоступен в выбранном городе.</p>}
      </section>
    </div>
    <ProductDetailsLower product={product} city={city} selectedVariant={selectedVariant} />
  </div>;
}
