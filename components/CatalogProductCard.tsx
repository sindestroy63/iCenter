"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronRight, Heart, PackageOpen, ShoppingCart } from "lucide-react";
import { formatCartVariantDetails, useStoreState } from "./StoreState";
import { catalogColorDetails } from "@/lib/catalog-colors";
import { availabilityLabel, getCatalogCharacteristics, productImage, selectCatalogDisplayVariant, type CatalogProductDto } from "./catalogClient";
import ColorName from "./ColorName";

export default function CatalogProductCard({ product, city, compact = false, className = "", layout = "home" }: { product: CatalogProductDto; city: string; compact?: boolean; className?: string; layout?: "home" | "catalog" }) {
  const { addToCart, toggleFavorite, isFavorite } = useStoreState();
  const selected = selectCatalogDisplayVariant(product);
  const variant = selected.variant;
  const [added, setAdded] = useState(false);
  const favorite = isFavorite(product.slug);
  const image = product.images.find((entry) => entry.src);
  const specs = getCatalogCharacteristics(product, variant);
  const add = () => {
    if (!variant || selected.price === null) return;
    addToCart({ productId: product.id, variantId: variant.id, slug: product.slug, name: product.name, image: image?.src ?? productImage(product), details: formatCartVariantDetails(variant.color ? catalogColorDetails(variant.color) : null, variant.attributes, variant.label), price: selected.price, priceCity: city, availability: selected.availability, city });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 900);
  };
  const cardClassName = ["product-tile-card", `product-tile-${layout}`, compact ? "product-tile-related" : "", className].filter(Boolean).join(" ");
  return <article className={cardClassName}>
    <div className="product-tile-main">
      <div className="product-tile-media">
        <Link className="product-tile-image-link" href={`/product/${encodeURIComponent(product.slug)}`} aria-label={product.name}>
          <div className="product-tile-image">{image?.src ? <img src={image.src} alt={image.alt || product.name} loading="lazy" decoding="async" /> : <PackageOpen size={40} aria-label="Изображение отсутствует" />}</div>
        </Link>
        <div className="product-tile-top">
          <div className="product-tile-badges">
            <Link className="product-category-chip" href={`/catalog?category=${encodeURIComponent(product.category.slug)}`}><span>{product.category.name}</span><ChevronRight size={13} aria-hidden="true" /></Link>
            {product.isNew && <span className="product-new-chip">Новинка</span>}
          </div>
          <button className={`product-tile-favorite${favorite ? " active" : ""}`} type="button" aria-label={favorite ? "Удалить из избранного" : "Добавить в избранное"} aria-pressed={favorite} onClick={() => toggleFavorite(product.slug)}><Heart size={19} fill={favorite ? "currentColor" : "none"} /></button>
        </div>
      </div>
      <Link className="product-tile-details-link" href={`/product/${encodeURIComponent(product.slug)}`}>
        <div className="product-tile-details">
          <h3>{product.name}</h3>
          <span className="product-tile-divider" aria-hidden="true" />
          {variant?.color && <ColorName color={variant.color} compact className="product-tile-color" />}
          {specs.length > 0 && <div className="product-tile-specs" aria-label="Характеристики товара">{specs.map((spec) => <span key={spec}>{spec}</span>)}</div>}
        </div>
      </Link>
    </div>
    <div className={`product-tile-availability is-${selected.availability.toLowerCase()}`}><i aria-hidden="true" />{availabilityLabel(selected.availability)}</div>
    <div className="product-tile-bottom"><strong>{selected.price === null ? "Уточняйте цену" : `от ${selected.price.toLocaleString("ru-RU")} ₽`}</strong><button className={`product-tile-cart${added ? " added" : ""}`} type="button" disabled={!variant || selected.price === null || added} aria-label={variant && selected.price !== null ? `Добавить ${product.name} в корзину` : `${product.name}: ${availabilityLabel(selected.availability).toLocaleLowerCase("ru-RU")}`} title={variant && selected.price !== null ? "Добавить выбранный вариант в корзину" : availabilityLabel(selected.availability)} onClick={add}>{added ? <Check size={19} /> : <ShoppingCart size={18} />}</button></div>
  </article>;
}
