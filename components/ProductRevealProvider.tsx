"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type RevealRequest = {
  href: string;
};

type RevealContextValue = {
  beginReveal: (request: RevealRequest) => void;
  isTarget: (slug: string, variantId?: string) => boolean;
};

const RevealContext = createContext<RevealContextValue | null>(null);
const revealEnabled = process.env.NEXT_PUBLIC_PRODUCT_REVEAL !== "0";

function targetKey(slug: string, variantId?: string) {
  return `/product/${encodeURIComponent(slug)}${variantId ? `?variant=${encodeURIComponent(variantId)}` : ""}`;
}

export function ProductRevealProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<RevealRequest | null>(null);
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setActive(null);
  }, []);

  useEffect(() => clear, [clear]);

  const beginReveal = useCallback((request: RevealRequest) => {
    if (!revealEnabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    setActive(request);
    timer.current = window.setTimeout(clear, 2500);
  }, [clear]);

  const value = useMemo<RevealContextValue>(() => ({
    beginReveal,
    isTarget: (slug, variantId) => active?.href === targetKey(slug, variantId),
  }), [active?.href, beginReveal]);

  return <RevealContext.Provider value={value}>{children}</RevealContext.Provider>;
}

export function useProductReveal() {
  const context = useContext(RevealContext);
  if (!context) throw new Error("useProductReveal must be used inside ProductRevealProvider");
  return context;
}

export function isPlainPrimaryClick(event: React.MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
