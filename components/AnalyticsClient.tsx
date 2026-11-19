"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const CONSENT_KEY = "icenter_cookie_consent_v1";
const VISITOR_KEY = "icenter_analytics_visitor";
const OPEN_SETTINGS_EVENT = "icenter:open-cookie-settings";
type Consent = "analytics" | "necessary";

let lastTracked = { signature: "", sentAt: 0 };

function storedConsent(): Consent | null {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === "analytics" || value === "necessary" ? value : null;
  } catch {
    return null;
  }
}

function visitorId() {
  try {
    const current = localStorage.getItem(VISITOR_KEY);
    if (current) return current;
    const created = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return null;
  }
}

function productIdOnPage(pathname: string) {
  if (!pathname.startsWith("/product/")) return null;
  return document.querySelector<HTMLElement>("[data-analytics-product-id]")?.dataset.analyticsProductId ?? null;
}

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

export default function AnalyticsClient() {
  const pathname = usePathname();
  const [consent, setConsent] = useState<Consent | null>(null);
  const [ready, setReady] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    setConsent(storedConsent());
    setReady(true);
    const open = () => setPreferencesOpen(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, open);
  }, []);

  useEffect(() => {
    if (consent !== "analytics" || !pathname || pathname.startsWith("/admin") || pathname.startsWith("/api") || pathname.startsWith("/_next")) return;
    const frame = window.requestAnimationFrame(() => {
      const id = visitorId();
      if (!id) return;
      const productId = productIdOnPage(pathname);
      const signature = `${pathname}\u0000${productId ?? ""}`;
      const now = Date.now();
      if (lastTracked.signature === signature && now - lastTracked.sentAt < 1500) return;
      lastTracked = { signature, sentAt: now };
      void fetch("/api/analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visitorId: id, pathname, productId }),
        keepalive: true,
      }).catch(() => undefined);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [consent, pathname]);

  const choose = (value: Consent) => {
    try {
      localStorage.setItem(CONSENT_KEY, value);
      if (value === "necessary") localStorage.removeItem(VISITOR_KEY);
    } catch {
      // The site remains usable when browser storage is unavailable.
    }
    setConsent(value);
    setPreferencesOpen(false);
  };

  if (!ready || (consent !== null && !preferencesOpen)) return null;
  return <aside className="cookie-consent" role="dialog" aria-label="Настройки cookie" aria-live="polite">
    <p>Мы используем cookie-файлы для работы сайта и, с вашего согласия, для анализа посещаемости. <Link href="/privacy">Подробнее — в Политике конфиденциальности</Link>.</p>
    <div><button type="button" className="cookie-consent-secondary" onClick={() => choose("necessary")}>Только необходимые</button><button type="button" className="cookie-consent-primary" onClick={() => choose("analytics")}>Принять</button></div>
  </aside>;
}
