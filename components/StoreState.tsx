"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { catalogColorDetails } from "@/lib/catalog-colors";

export type StoreCartItem = {
  productId?: string;
  variantId: string;
  slug: string;
  name: string;
  image: string;
  details: string;
  quantity: number;
  price?: number | null;
  city?: string;
  availability?: "IN_STOCK" | "PREORDER" | "OUT_OF_STOCK" | "UNSPECIFIED";
  priceCity?: string;
};

export type StoreCityInfo = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  workingHours: string | null;
  timezone: string | null;
  socialLinks: unknown;
};

export function formatCartVariantDetails(colorName: string | null | undefined, attributes: Record<string, unknown> | undefined, fallbackLabel?: string | null): string {
  const normalized = new Map<string, string>();
  for (const [key, rawValue] of Object.entries(attributes ?? {})) {
    if (typeof rawValue !== "string" && typeof rawValue !== "number") continue;
    const value = String(rawValue).trim();
    if (!value) continue;
    const normalizedKey = key === "memory" ? "storage" : key === "sim" ? "simType" : key;
    if (!normalized.has(normalizedKey) || normalizedKey === key) normalized.set(normalizedKey, value);
  }
  const parts = [colorName?.trim(), ...Array.from(normalized.values())].filter((value): value is string => Boolean(value));
  return parts.join(" · ") || fallbackLabel || "";
}

type StoreStateValue = {
  city: string;
  cityInfo: StoreCityInfo | null;
  cartPricesCity: string | null;
  setCity: (city: string) => void;
  favorites: string[];
  toggleFavorite: (slug: string) => void;
  isFavorite: (slug: string) => boolean;
  cart: StoreCartItem[];
  cartCount: number;
  addToCart: (item: Omit<StoreCartItem, "quantity">, quantity?: number) => void;
  updateCartQuantity: (variantId: string, quantity: number) => void;
  removeFromCart: (variantId: string) => void;
  clearCart: () => void;
  hydrated: boolean;
};

const StoreStateContext = createContext<StoreStateValue | null>(null);

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeFavorites(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((slug): slug is string => typeof slug === "string" && slug.length > 0) : [];
}

function normalizeCart(value: unknown): StoreCartItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StoreCartItem =>
    !!item && typeof item === "object" &&
    typeof item.variantId === "string" && item.variantId.length > 0 &&
    typeof item.slug === "string" && item.slug.length > 0 &&
    Number.isInteger(item.quantity) && item.quantity > 0,
  ).map((item) => ({ ...item, name: typeof item.name === "string" ? item.name : "Товар", image: typeof item.image === "string" ? item.image : "", details: typeof item.details === "string" ? item.details : "", price: null, priceCity: undefined, availability: "UNSPECIFIED" }));
}

export function StoreStateProvider({ children }: { children: React.ReactNode }) {
  const [city, setCityState] = useState("samara");
  const [cityInfo, setCityInfo] = useState<StoreCityInfo | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [cart, setCart] = useState<StoreCartItem[]>([]);
  const [cartPricesCity, setCartPricesCity] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedCity = readStorage<unknown>("icenter-city", "samara");
    setCityState(typeof storedCity === "string" && ["samara", "moscow", "saint-petersburg", "orenburg"].includes(storedCity) ? storedCity : "samara");
    setFavorites(normalizeFavorites(readStorage<unknown>("icenter-favorites", [])));
    // A versioned key avoids presenting old prototype cart entries as real variants.
    setCart(normalizeCart(readStorage<unknown>("icenter-cart-v2", [])));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem("icenter-city", city);
      window.localStorage.setItem("icenter-favorites", JSON.stringify(favorites));
      window.localStorage.setItem("icenter-cart-v2", JSON.stringify(cart.map(({ variantId, slug, quantity }) => ({ variantId, slug, quantity }))));
    } catch {
      // The store remains usable for the current session when browser storage is unavailable.
    }
  }, [city, favorites, cart, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (!cart.length) { setCartPricesCity(city); return; }
    const controller = new AbortController();
    setCartPricesCity(null);
    Promise.all(cart.map(async (item) => {
      try {
        const response = await fetch(`/api/catalog/products/${encodeURIComponent(item.slug)}?city=${encodeURIComponent(city)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Product refresh failed");
        const body = await response.json() as { data?: { id: string; name: string; images?: { src: string | null; colorId: string | null }[]; variants?: { id: string; label: string; attributes?: Record<string, unknown>; color?: { id: string; name: string } | null; price: string | null; availability: StoreCartItem["availability"] }[] } };
        const variant = body.data?.variants?.find((entry) => entry.id === item.variantId);
        if (!body.data || !variant) throw new Error("Cart variant is unavailable");
        const image = body.data.images?.find((entry) => entry.colorId === variant.color?.id)?.src ?? body.data.images?.[0]?.src ?? item.image;
        const details = formatCartVariantDetails(variant.color ? catalogColorDetails(variant.color) : null, variant.attributes, variant.label);
        return { ...item, name: body.data.name, image: image ?? "", details: details || variant.label, productId: body.data.id, city, priceCity: city, price: variant.price === null ? null : Number(variant.price), availability: variant.availability };
      } catch {
        return { ...item, productId: undefined, city, priceCity: city, price: null, availability: "UNSPECIFIED" as const };
      }
    })).then((refreshed) => {
      if (controller.signal.aborted) return;
      setCart((current) => {
        let changed = false;
        const updated = current.map((item) => {
        const next = refreshed.find((entry) => entry.variantId === item.variantId);
        if (!next || (item.productId === next.productId && item.name === next.name && item.image === next.image && item.details === next.details && item.city === next.city && item.priceCity === next.priceCity && item.price === next.price && item.availability === next.availability)) return item;
        changed = true;
        return { ...item, productId: next.productId, name: next.name, image: next.image, details: next.details, city: next.city, priceCity: next.priceCity, price: next.price, availability: next.availability };
        });
        return changed ? updated : current;
      });
    }).finally(() => { if (!controller.signal.aborted) setCartPricesCity(city); });
    return () => controller.abort();
  }, [city, cart, hydrated]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/catalog/cities", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error("Cities request failed"); return response.json() as Promise<{ data: StoreCityInfo[] }>; })
      .then((body) => setCityInfo(body.data?.find((item) => item.slug === city) ?? null))
      .catch(() => { if (!controller.signal.aborted) setCityInfo(null); });
    return () => controller.abort();
  }, [city]);

  const value = useMemo<StoreStateValue>(() => ({
    city,
    cityInfo,
    cartPricesCity,
    setCity: (nextCity) => setCityState(["samara", "moscow", "saint-petersburg", "orenburg"].includes(nextCity) ? nextCity : "samara"),
    favorites,
    toggleFavorite: (slug) => setFavorites((current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]),
    isFavorite: (slug) => favorites.includes(slug),
    cart,
    cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
    addToCart: (item, quantity = 1) => {
      if (!item.variantId || !item.slug || !Number.isInteger(quantity) || quantity < 1) return;
      setCartPricesCity(null);
      setCart((current) => {
      const existing = current.find((entry) => entry.variantId === item.variantId);
      if (existing) return current.map((entry) => entry.variantId === item.variantId ? { ...entry, ...item, price: null, priceCity: undefined, quantity: entry.quantity + quantity } : entry);
      return [...current, { ...item, price: null, priceCity: undefined, quantity }];
      });
    },
    updateCartQuantity: (variantId, quantity) => setCart((current) => quantity > 0 ? current.map((item) => item.variantId === variantId ? { ...item, quantity } : item) : current.filter((item) => item.variantId !== variantId)),
    removeFromCart: (variantId) => setCart((current) => current.filter((item) => item.variantId !== variantId)),
    clearCart: () => setCart([]),
    hydrated,
  }), [city, cityInfo, cartPricesCity, favorites, cart, hydrated]);

  return <StoreStateContext.Provider value={value}>{children}</StoreStateContext.Provider>;
}

export function useStoreState() {
  const value = useContext(StoreStateContext);
  if (!value) throw new Error("useStoreState must be used inside StoreStateProvider");
  return value;
}
