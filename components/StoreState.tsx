"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { catalogColorDetails } from "@/lib/catalog-colors";
import { formatFeatureValue } from "./catalogClient";

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

export type StoreFavorite = { slug: string; variantId: string | null };

export function formatCartVariantDetails(colorName: string | null | undefined, attributes: Record<string, unknown> | undefined, fallbackLabel?: string | null): string {
  const normalized = new Map<string, string>();
  for (const [key, rawValue] of Object.entries(attributes ?? {})) {
    if (typeof rawValue !== "string" && typeof rawValue !== "number") continue;
    const value = String(rawValue).trim();
    if (!value) continue;
    const normalizedKey = key === "memory" ? "storage" : key === "sim" ? "simType" : key;
    if (!normalized.has(normalizedKey) || normalizedKey === key) normalized.set(normalizedKey, formatFeatureValue(value));
  }
  const parts = [colorName?.trim(), ...Array.from(normalized.values())].filter((value): value is string => Boolean(value));
  return parts.join(" · ") || fallbackLabel || "";
}

type StoreStateValue = {
  city: string;
  cityRestoring: boolean;
  cityOptions: StoreCityInfo[];
  cityOptionsLoading: boolean;
  cityOptionsError: boolean;
  citySelectionRequired: boolean;
  cityInfo: StoreCityInfo | null;
  cartPricesCity: string | null;
  setCity: (city: string) => void;
  retryCityOptions: () => void;
  favorites: StoreFavorite[];
  toggleFavorite: (favorite: StoreFavorite) => void;
  isFavorite: (variantId: string | null | undefined) => boolean;
  cart: StoreCartItem[];
  promoCode: string;
  setPromoCode: (code: string) => void;
  cartCount: number;
  addToCart: (item: Omit<StoreCartItem, "quantity">, quantity?: number) => void;
  updateCartQuantity: (variantId: string, quantity: number) => void;
  removeFromCart: (variantId: string) => void;
  clearCart: () => void;
  hydrated: boolean;
};

const knownCitySlugs = ["samara", "moscow", "saint-petersburg", "orenburg"] as const;

const StoreStateContext = createContext<StoreStateValue | null>(null);

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeFavorites(value: unknown): StoreFavorite[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.length > 0) return [{ slug: item, variantId: null }];
    if (!item || typeof item !== "object") return [];
    const candidate = item as { slug?: unknown; variantId?: unknown };
    return typeof candidate.slug === "string" && candidate.slug.length > 0
      ? [{ slug: candidate.slug, variantId: typeof candidate.variantId === "string" && candidate.variantId.length > 0 ? candidate.variantId : null }]
      : [];
  });
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
  const [cityOptions, setCityOptions] = useState<StoreCityInfo[]>([]);
  const [favorites, setFavorites] = useState<StoreFavorite[]>([]);
  const [cart, setCart] = useState<StoreCartItem[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [cartPricesCity, setCartPricesCity] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [cityRestored, setCityRestored] = useState(false);
  const [cityConfirmed, setCityConfirmed] = useState(false);
  const [cityOptionsLoading, setCityOptionsLoading] = useState(true);
  const [cityOptionsError, setCityOptionsError] = useState(false);
  const [cityLoadAttempt, setCityLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      let storedCity: unknown = null;
      try { storedCity = window.localStorage.getItem("icenter-city"); if (typeof storedCity === "string" && storedCity.startsWith('"')) storedCity = JSON.parse(storedCity); } catch { storedCity = null; }
      let storedCityConfirmed = false;
      try { storedCityConfirmed = window.localStorage.getItem("icenter-city-confirmed") === "1"; } catch { /* Storage may be unavailable. */ }
      const storedSlug = typeof storedCity === "string" && knownCitySlugs.includes(storedCity as (typeof knownCitySlugs)[number]) ? storedCity : null;
      let activeCities: StoreCityInfo[] = [];
      let citiesLoaded = false;
      setCityOptionsLoading(true);
      setCityOptionsError(false);
      try {
        const response = await fetch("/api/catalog/cities", { cache: "no-store" });
        if (!response.ok) throw new Error("Cities request failed");
        const body = await response.json() as { data?: StoreCityInfo[] };
        if (!Array.isArray(body.data)) throw new Error("Invalid cities response");
        activeCities = body.data.filter((item) => knownCitySlugs.includes(item.slug as (typeof knownCitySlugs)[number]));
        citiesLoaded = true;
      } catch {
        // An unavailable city list must not implicitly confirm the fallback city.
      }
      if (cancelled) return;
      const activeSlugs = activeCities.map((item) => item.slug);
      const hasValidSavedCity = Boolean(citiesLoaded && storedCityConfirmed && storedSlug && activeSlugs.includes(storedSlug));
      const restoredCity = hasValidSavedCity
        ? storedSlug
        : activeSlugs.includes("samara") ? "samara" : activeSlugs[0] ?? "samara";
      setCityState(restoredCity ?? "samara");
      setCityOptions(activeCities);
      setCityConfirmed(hasValidSavedCity);
      setCityOptionsLoading(false);
      setCityOptionsError(!citiesLoaded);
      setFavorites(normalizeFavorites(readStorage<unknown>("icenter-favorites", [])));
      const savedPromo = readStorage<unknown>("icenter-promo-code", "");
      setPromoCode(typeof savedPromo === "string" ? savedPromo.slice(0, 64) : "");
      // A versioned key avoids presenting old prototype cart entries as real variants.
      setCart(normalizeCart(readStorage<unknown>("icenter-cart-v2", [])));
      setHydrated(true);
      setCityRestored(true);
    };
    void restore();
    return () => { cancelled = true; };
  }, [cityLoadAttempt]);

  useEffect(() => {
    if (!hydrated || !cityRestored) return;
    try {
      if (cityConfirmed) {
        window.localStorage.setItem("icenter-city", city);
        window.localStorage.setItem("icenter-city-confirmed", "1");
      }
      window.localStorage.setItem("icenter-favorites", JSON.stringify(favorites));
      window.localStorage.setItem("icenter-promo-code", promoCode);
      window.localStorage.setItem("icenter-cart-v2", JSON.stringify(cart.map(({ variantId, slug, quantity }) => ({ variantId, slug, quantity }))));
    } catch {
      // The store remains usable for the current session when browser storage is unavailable.
    }
  }, [city, favorites, cart, promoCode, hydrated, cityRestored, cityConfirmed]);

  useEffect(() => {
    if (!hydrated) return;
    if (!cart.length) { setCartPricesCity(city); return; }
    const controller = new AbortController();
    setCartPricesCity(null);
    Promise.all(cart.map(async (item) => {
      try {
        const response = await fetch(`/api/catalog/products/${encodeURIComponent(item.slug)}?city=${encodeURIComponent(city)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Product refresh failed");
        const body = await response.json() as { data?: { id: string; name: string; brand?: { slug: string }; images?: { src: string | null; colorId: string | null }[]; variants?: { id: string; label: string; attributes?: Record<string, unknown>; color?: { id: string; name: string } | null; price: string | null; availability: StoreCartItem["availability"] }[] } };
        const variant = body.data?.variants?.find((entry) => entry.id === item.variantId);
        if (!body.data || !variant) throw new Error("Cart variant is unavailable");
        const image = body.data.images?.find((entry) => entry.colorId === variant.color?.id)?.src ?? body.data.images?.[0]?.src ?? item.image;
        const fallbackLabel = body.data.brand?.slug === "dyson" && !variant.color ? null : variant.label;
        const details = formatCartVariantDetails(variant.color ? catalogColorDetails(variant.color) : null, variant.attributes, fallbackLabel);
        return { ...item, name: body.data.name, image: image ?? "", details, productId: body.data.id, city, priceCity: city, price: variant.price === null ? null : Number(variant.price), availability: variant.availability };
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
    cityRestoring: !cityRestored,
    cityOptions,
    cityOptionsLoading,
    cityOptionsError,
    citySelectionRequired: cityRestored && !cityConfirmed,
    cityInfo,
    cartPricesCity,
    setCity: (nextCity) => { if (cityOptions.some((item) => item.slug === nextCity)) { setCityState(nextCity); setCityConfirmed(true); } },
    retryCityOptions: () => setCityLoadAttempt((attempt) => attempt + 1),
    favorites,
    toggleFavorite: (favorite) => setFavorites((current) => {
      if (!favorite.variantId) return current;
      const exists = current.some((item) => item.variantId === favorite.variantId);
      if (exists) return current.filter((item) => item.variantId !== favorite.variantId);
      // A legacy slug-only entry is converted only for the explicitly chosen variant.
      return [...current.filter((item) => item.slug !== favorite.slug || item.variantId !== null), favorite];
    }),
    isFavorite: (variantId) => Boolean(variantId && favorites.some((item) => item.variantId === variantId)),
    cart,
    promoCode,
    setPromoCode,
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
  }), [city, cityInfo, cityOptions, cityOptionsLoading, cityOptionsError, cityConfirmed, cityRestored, cityLoadAttempt, cartPricesCity, favorites, cart, promoCode, hydrated]);

  return <StoreStateContext.Provider value={value}>{children}</StoreStateContext.Provider>;
}

export function useStoreState() {
  const value = useContext(StoreStateContext);
  if (!value) throw new Error("useStoreState must be used inside StoreStateProvider");
  return value;
}
