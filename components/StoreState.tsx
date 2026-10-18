"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { products } from "./storeData";

export type StoreCartItem = {
  variantId: string;
  slug: string;
  name: string;
  image: string;
  details: string;
  quantity: number;
  price?: number | null;
};

type StoreStateValue = {
  city: string;
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

const productSlugs = new Set(products.map((product) => product.slug));
const validVariantIds = new Set(products.flatMap((product) => product.variants.map((variant) => variant.id)));

function normalizeFavorites(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((slug): slug is string => typeof slug === "string" && productSlugs.has(slug)) : [];
}

function normalizeCart(value: unknown): StoreCartItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StoreCartItem =>
    !!item && typeof item === "object" &&
    typeof item.variantId === "string" && validVariantIds.has(item.variantId) &&
    typeof item.slug === "string" && productSlugs.has(item.slug) &&
    typeof item.name === "string" && typeof item.image === "string" &&
    typeof item.details === "string" && Number.isInteger(item.quantity) && item.quantity > 0,
  );
}

export function StoreStateProvider({ children }: { children: React.ReactNode }) {
  const [city, setCityState] = useState("samara");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [cart, setCart] = useState<StoreCartItem[]>([]);
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
      window.localStorage.setItem("icenter-cart-v2", JSON.stringify(cart));
    } catch {
      // The store remains usable for the current session when browser storage is unavailable.
    }
  }, [city, favorites, cart, hydrated]);

  const value = useMemo<StoreStateValue>(() => ({
    city,
    setCity: (nextCity) => setCityState(["samara", "moscow", "saint-petersburg", "orenburg"].includes(nextCity) ? nextCity : "samara"),
    favorites,
    toggleFavorite: (slug) => setFavorites((current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]),
    isFavorite: (slug) => favorites.includes(slug),
    cart,
    cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
    addToCart: (item, quantity = 1) => {
      if (!validVariantIds.has(item.variantId) || !productSlugs.has(item.slug) || !Number.isInteger(quantity) || quantity < 1) return;
      setCart((current) => {
      const existing = current.find((entry) => entry.variantId === item.variantId);
      if (existing) return current.map((entry) => entry.variantId === item.variantId ? { ...entry, quantity: entry.quantity + quantity } : entry);
      return [...current, { ...item, quantity }];
      });
    },
    updateCartQuantity: (variantId, quantity) => setCart((current) => quantity > 0 ? current.map((item) => item.variantId === variantId ? { ...item, quantity } : item) : current.filter((item) => item.variantId !== variantId)),
    removeFromCart: (variantId) => setCart((current) => current.filter((item) => item.variantId !== variantId)),
    clearCart: () => setCart([]),
    hydrated,
  }), [city, favorites, cart, hydrated]);

  return <StoreStateContext.Provider value={value}>{children}</StoreStateContext.Provider>;
}

export function useStoreState() {
  const value = useContext(StoreStateContext);
  if (!value) throw new Error("useStoreState must be used inside StoreStateProvider");
  return value;
}
