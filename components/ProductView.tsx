"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Expand, Heart, MapPin, Minus, Plus, ShoppingCart, Truck, X } from "lucide-react";
import { useStoreState } from "./StoreState";
import { cities, getProduct, type StoreProduct, type StoreVariant } from "./storeData";

function firstVariant(product: StoreProduct) {
  return product.variants.find((variant) => variant.memory === "256 ГБ" && variant.sim === "eSIM") ?? product.variants[0];
}

export default function ProductView({ slug }: { slug: string }) {
  const product = getProduct(slug);
  const { city, addToCart, toggleFavorite, isFavorite } = useStoreState();
  const [image, setImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [lightbox, setLightbox] = useState(false);
  const initial = product ? firstVariant(product) : undefined;
  const [selection, setSelection] = useState<StoreVariant>(initial ?? { id: "" });

  const galleryImages = useMemo(() => {
    if (!product) return [];
    const colorImage = product.colors?.find((color) => color.label === selection.color)?.image;
    return Array.from(new Set([colorImage, ...product.images].filter((value): value is string => Boolean(value))));
  }, [product, selection.color]);
  const selectedVariant = product?.variants.find((variant) => variant.id === selection.id) ?? product?.variants[0];
  const availableColors = Array.from(new Set(product?.variants.map((variant) => variant.color).filter(Boolean) as string[]));
  const availableMemory = Array.from(new Set(product?.variants.filter((variant) => !selection.color || variant.color === selection.color).map((variant) => variant.memory).filter(Boolean) as string[]));
  const availableSim = Array.from(new Set(product?.variants.filter((variant) => (!selection.color || variant.color === selection.color) && (!selection.memory || variant.memory === selection.memory)).map((variant) => variant.sim).filter(Boolean) as string[]));
  const cityName = cities.find((item) => item.slug === city)?.name ?? city;

  if (!product) return <div className="container empty-state product-not-found"><h1>Товар не найден</h1><p>Такого товара нет в локальном каталоге.</p><Link href="/catalog">Вернуться в каталог</Link></div>;

  const choose = (field: keyof StoreVariant, value: string) => {
    const next = product.variants.find((variant) => variant[field] === value && Object.entries(selection).every(([key, current]) => key === field || key === "id" || !current || variant[key as keyof StoreVariant] === current))
      ?? product.variants.find((variant) => variant[field] === value);
    if (next) { setSelection(next); setImage(0); }
  };
  const add = () => { if (!selectedVariant) return; addToCart({ variantId: selectedVariant.id, slug: product.slug, name: product.name, image: galleryImages[0] ?? product.image, details: [selectedVariant.color, selectedVariant.memory, selectedVariant.sim, selectedVariant.ram, selectedVariant.connectivity].filter(Boolean).join(" · ") || product.detail }, quantity); };
  const favorite = isFavorite(product.slug);

  return <div className="product-page container">
    <div className="product-breadcrumbs"><Link href="/">Главная</Link><span>›</span><Link href="/catalog">Каталог</Link><span>›</span><span>{product.brand}</span><span>›</span><span>{product.name}</span></div>
    <div className="product-layout">
      <section className="product-gallery"><div className="product-thumbs">{galleryImages.map((src, index) => <button key={`${src}-${index}`} className={index === image ? "active" : ""} onClick={() => setImage(index)}><img src={src} alt={`${product.name}, изображение ${index + 1}`} /></button>)}</div><div className="product-main-image"><button className="gallery-nav prev" onClick={() => setImage((image - 1 + galleryImages.length) % galleryImages.length)} aria-label="Предыдущее фото"><ChevronLeft /></button><button className="gallery-image-button" onClick={() => setLightbox(true)} aria-label="Открыть изображение"><img src={galleryImages[image] ?? product.image} alt={product.name} /></button><button className="gallery-nav next" onClick={() => setImage((image + 1) % galleryImages.length)} aria-label="Следующее фото"><ChevronRight /></button><button className="gallery-expand" onClick={() => setLightbox(true)} aria-label="Развернуть изображение"><Expand size={17} /></button></div></section>
      <section className="product-info"><div className="product-title-row"><span className="product-badge">Демонстрационная карточка</span><button className={`product-favorite ${favorite ? "active" : ""}`} onClick={() => toggleFavorite(product.slug)} aria-label={favorite ? "Удалить из избранного" : "Добавить в избранное"}><Heart fill={favorite ? "currentColor" : "none"} /></button></div><h1>{product.name}</h1><h2>{product.detail}</h2><div className="purchase-card"><div className="availability"><span className="availability-dot" />Уточнить наличие в  {cityName}</div><div className="product-price">Уточнить цену</div><p className="price-note">Демонстрационная карточка. Актуальная цена и наличие из БД не подключены.</p><hr />
        {product.colors?.length ? <fieldset><legend>Цвет:  <b>{selection.color}</b></legend><div className="color-options">{product.colors.map((color) => <button key={color.label} className={selection.color === color.label ? "selected" : ""} style={{ background: color.value }} disabled={!availableColors.includes(color.label)} onClick={() => choose("color", color.label)} aria-label={color.label} />)}</div></fieldset> : null}
        {availableMemory.length ? <fieldset><legend>Объем памяти:  <b>{selection.memory}</b></legend><div className="option-grid">{availableMemory.map((value) => <button key={value} className={selection.memory === value ? "selected" : ""} onClick={() => choose("memory", value)}>{value}</button>)}</div></fieldset> : null}
        {availableSim.length ? <fieldset><legend>SIM-карта:  <b>{selection.sim}</b></legend><div className="sim-options">{availableSim.map((value) => <button key={value} className={selection.sim === value ? "selected" : ""} onClick={() => choose("sim", value)}>{value}</button>)}</div></fieldset> : null}
        {selectedVariant ? <><div className="product-quantity"><span>Количество</span><div><button onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Уменьшить количество"><Minus size={15} /></button><b>{quantity}</b><button onClick={() => setQuantity((value) => value + 1)} aria-label="Увеличить количество"><Plus size={15} /></button></div></div><button className="add-cart" onClick={add}><ShoppingCart size={21} />Добавить в корзину</button></> : <p className="variant-unavailable">Подтвержденные варианты пока не загружены, добавление в корзину недоступно.</p>}<Link className="buy-now" href="/cart">Перейти в корзину</Link><div className="delivery-grid"><div><Truck /><b>Доставка по  {cityName}</b><span>Уточняется при оформлении заявки</span></div><div><MapPin /><b>Самовывоз</b><span>Адрес уточняется по городу</span></div></div></div></section>
    </div><section className="product-description"><h2>Описание</h2><p>{product.description}</p></section>
    {lightbox && <div className="image-lightbox" role="dialog" aria-modal="true"><button onClick={() => setLightbox(false)} aria-label="Закрыть изображение"><X /></button><img src={galleryImages[image] ?? product.image} alt={product.name} /></div>}
  </div>;
}
