"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronRight, Heart, PackageOpen, ShoppingCart } from "lucide-react";
import { formatCartVariantDetails, useStoreState } from "./StoreState";
import { catalogColorDetails } from "@/lib/catalog-colors";
import { availabilityLabel, getCatalogCharacteristics, productVariantImage, selectCatalogVariant, type CatalogProductDto } from "./catalogClient";
import ColorName from "./ColorName";
import { isPlainPrimaryClick, useProductReveal } from "./ProductRevealProvider";

export default function CatalogProductCard({ product, city, variantId, compact = false, className = "", layout = "home" }: { product: CatalogProductDto; city: string; variantId?: string; compact?: boolean; className?: string; layout?: "home" | "catalog" }) {
  const { addToCart, toggleFavorite, isFavorite } = useStoreState();
  const { beginReveal } = useProductReveal();
  const selected = selectCatalogVariant(product, variantId);
  const variant = selected.variant;
  const [added, setAdded] = useState(false);
  const favorite = isFavorite(product.slug);
  const imageSrc = productVariantImage(product, variant);
  const image = product.images.find((entry) => entry.src === imageSrc);
  const productHref = `/product/${encodeURIComponent(product.slug)}${variant ? `?variant=${encodeURIComponent(variant.id)}` : ""}`;
  const specs = getCatalogCharacteristics(product, variant);
  const canPurchase = Boolean(variant && selected.price !== null && ["IN_STOCK", "PREORDER"].includes(selected.availability));
  const revealProduct = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainPrimaryClick(event)) return;
    beginReveal({ href: productHref });
  };
  const add = () => {
    if (!variant || selected.price === null || !canPurchase) return;
    const fallbackLabel = product.brand.slug === "dyson" && !variant.color ? null : variant.label;
    addToCart({ productId: product.id, variantId: variant.id, slug: product.slug, name: product.name, image: imageSrc, details: formatCartVariantDetails(variant.color ? catalogColorDetails(variant.color) : null, variant.attributes, fallbackLabel), price: selected.price, priceCity: city, availability: selected.availability, city });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 900);
  };
  const cardClassName = ["product-tile-card", `product-tile-${layout}`, compact ? "product-tile-related" : "", className].filter(Boolean).join(" ");
  return <article className={cardClassName}>
    <div className="product-tile-main">
      <div className="product-tile-media">
        <Link className="product-tile-image-link" href={productHref} aria-label={product.name} onClick={revealProduct}>
          <div className="product-tile-image">{imageSrc ? <img src={imageSrc} alt={image?.alt || product.name} loading="lazy" decoding="async" /> : <PackageOpen size={40} aria-label="Изображение отсутствует" />}</div>
        </Link>
        <div className="product-tile-top">
          <div className="product-tile-badges">
            <Link className="product-category-chip" href={`/catalog?category=${encodeURIComponent(product.category.slug)}`}><span>{product.category.name}</span><ChevronRight size={13} aria-hidden="true" /></Link>
            {product.isNew && <span className="product-new-chip">Новинка</span>}
            {product.isUsed && <span className="product-used-chip">Б/у</span>}
          </div>
          <button className={`product-tile-favorite${favorite ? " active" : ""}`} type="button" aria-label={favorite ? "Удалить из избранного" : "Добавить в избранное"} aria-pressed={favorite} onClick={() => toggleFavorite(product.slug)}><Heart size={19} fill={favorite ? "currentColor" : "none"} /></button>
        </div>
      </div>
      <Link className="product-tile-details-link" href={productHref} onClick={revealProduct}>
        <div className="product-tile-details">
          <h3>{product.name}</h3>
          <span className="product-tile-divider" aria-hidden="true" />
          {variant?.color && <ColorName color={variant.color} compact className="product-tile-color" />}
          {specs.length > 0 && <div className="product-tile-specs" aria-label="Характеристики товара">{specs.map((spec) => <span key={spec}>{spec}</span>)}</div>}
        </div>
      </Link>
    </div>
    <div className={`product-tile-availability is-${selected.availability.toLowerCase()}`}><i aria-hidden="true" />{availabilityLabel(selected.availability)}</div>
    <div className="product-tile-bottom"><strong>{selected.price === null ? "Уточняйте цену" : `${variantId ? "" : "от "}${selected.price.toLocaleString("ru-RU")} ₽`}</strong><button className={`product-tile-cart${added ? " added" : ""}`} type="button" disabled={!canPurchase || added} aria-label={canPurchase ? `Добавить ${product.name} в корзину` : `${product.name}: ${availabilityLabel(selected.availability).toLocaleLowerCase("ru-RU")}`} title={canPurchase ? "Добавить выбранный вариант в корзину" : availabilityLabel(selected.availability)} onClick={add}>{added ? <Check size={19} /> : <ShoppingCart size={18} />}</button></div>
  </article>;
}
