"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Package, Plus, Power, RefreshCw, Trash2 } from "lucide-react";

type Variant = { id: string; sku: string; label: string; storage: string | null; simType: string | null; color: string | null; price: string | null; availability: string; imageUrl: string | null };
type Product = { id: string; name: string; slug: string; brandName: string; variants: Variant[] };
type Entry = { id: string; productId: string; variantId: string | null; sortOrder: number; isActive: boolean; productName: string; slug: string; brandName: string; description?: string | null; variant: Variant | null };
type Payload = { data: Entry[]; products: Product[]; cities: Array<{ slug: string; name: string }>; city: string; schemaReady: boolean; legacyProductLevelAvailable: boolean };
const emptyPayload: Payload = { data: [], products: [], cities: [], city: "", schemaReady: false, legacyProductLevelAvailable: false };
const csrf = () => decodeURIComponent(document.cookie.split("; ").find((part) => part.startsWith("icenter_csrf="))?.split("=")[1] ?? "");

function variantLabel(variant: Variant) {
  const details = [variant.storage, variant.color, variant.simType, variant.price ? `${Number(variant.price).toLocaleString("ru-RU")} ₽` : null].filter(Boolean);
  return details.length ? details.join(" · ") : variant.label || variant.sku;
}

export default function AdminProductCollectionBackend({ kind, title, description }: { kind: "best-offers" | "popular-products"; title: string; description: string }) {
  const endpoint = `/api/admin/${kind}`;
  const [payload, setPayload] = useState<Payload>(emptyPayload);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedVariant, setSelectedVariant] = useState("");
  const [city, setCity] = useState("");
  const [newOrder, setNewOrder] = useState(0);
  const [orders, setOrders] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async (nextCity?: string) => {
    setError(""); setLoading(true);
    try {
      const query = nextCity || city ? `?city=${encodeURIComponent(nextCity || city)}` : "";
      const response = await fetch(`${endpoint}${query}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить подборку.");
      setPayload(result); setCity(result.city || nextCity || "");
      setOrders(Object.fromEntries(result.data.map((item: Entry) => [item.id, item.sortOrder])));
      setNewOrder(result.data.reduce((max: number, item: Entry) => Math.max(max, item.sortOrder), -10) + 10);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить подборку."); }
    finally { setLoading(false); }
  }, [city, endpoint]);
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const product = useMemo(() => payload.products.find((item) => item.id === selectedProduct) ?? null, [payload.products, selectedProduct]);
  const selectedVariantData = product?.variants.find((item) => item.id === selectedVariant) ?? null;
  useEffect(() => { setSelectedVariant(""); }, [selectedProduct]);

  const mutate = async (method: "POST" | "PATCH" | "DELETE", body: object) => {
    setBusy(true); setError(""); setBusyId("id" in body && typeof body.id === "string" ? body.id : "");
    try {
      const token = csrf();
      if (!token) throw new Error("CSRF-токен недоступен. Войдите повторно.");
      const response = await fetch(endpoint, { method, headers: { "content-type": "application/json", "x-csrf-token": token }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      const messages: Record<string, string> = { DUPLICATE_PRODUCT: "Этот товар уже добавлен на уровне товара.", DUPLICATE_VARIANT: "Этот вариант уже добавлен.", MIXED_COLLECTION_SCOPE: "Нельзя одновременно добавлять товар целиком и его отдельные варианты.", INVALID_PRODUCT: "Товар недоступен в выбранном городе.", INVALID_VARIANT: "Вариант недоступен в выбранном городе.", COLLECTION_SCHEMA_REQUIRED: "Сначала примените подготовленную SQL-миграцию подборок." };
      if (!response.ok) throw new Error(messages[result.error] ?? result.error ?? "Не удалось сохранить изменения.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить изменения."); }
    finally { setBusy(false); setBusyId(""); }
  };

  const canAdd = Boolean(selectedProduct && city && (payload.schemaReady || (kind === "best-offers" && payload.legacyProductLevelAvailable && !selectedVariant)));
  return <main className="admin-content admin-workspace admin-best-offers-page"><header className="workspace-head"><div><h1>{title}</h1><p>{description}</p></div><button className="admin-secondary" type="button" onClick={() => void load()}><RefreshCw size={16}/>Обновить</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!payload.schemaReady && <p className="admin-note admin-collection-schema-note">Выбор конкретных вариантов{kind === "popular-products" ? " и сохранение подборки" : ""} станет доступен после ручного применения подготовленной SQL-миграции.</p>}
    <section className="panel admin-best-offers-add"><div className="admin-best-offers-section-head"><div><h2>Добавить позицию</h2><p>Выберите город, товар целиком или его конкретную конфигурацию.</p></div></div><div className="admin-collection-add-grid">
      <label className="admin-form-label">Город<select value={city} onChange={(event) => { setCity(event.target.value); void load(event.target.value); }}>{payload.cities.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select></label>
      <label className="admin-form-label">Товар<select value={selectedProduct} onChange={(event) => setSelectedProduct(event.target.value)}><option value="">Выберите опубликованный товар</option>{payload.products.map((item) => <option key={item.id} value={item.id}>{item.brandName} · {item.name}</option>)}</select></label>
      <label className="admin-form-label">Уровень подборки<select value={selectedVariant} disabled={!product || !payload.schemaReady} onChange={(event) => setSelectedVariant(event.target.value)}><option value="">Товар целиком</option>{product?.variants.map((variant) => <option key={variant.id} value={variant.id}>{variantLabel(variant)}</option>)}</select></label>
      <label className="admin-form-label admin-best-offers-order-field">Порядок<input type="number" min={-100000} max={100000} value={newOrder} onChange={(event) => setNewOrder(Number(event.target.value))}/></label>
      <button className="admin-primary" type="button" disabled={busy || !canAdd} onClick={() => void mutate("POST", { productId: selectedProduct, variantId: selectedVariant || null, city, sortOrder: newOrder })}><Plus size={16}/>Добавить</button>
    </div>{selectedVariantData && <div className="admin-collection-preview">{selectedVariantData.imageUrl && <img src={selectedVariantData.imageUrl} alt=""/>}<span>{variantLabel(selectedVariantData)}</span></div>}</section>
    <section className="admin-best-offers-section"><div className="admin-best-offers-section-head"><div><h2>Позиции в подборке</h2><p>{payload.data.length ? `${payload.data.length} позиций` : "Управление порядком и активностью"}</p></div></div>{loading && !payload.data.length ? <div className="panel admin-best-offers-empty">Загрузка…</div> : payload.data.length === 0 ? <div className="panel admin-best-offers-empty"><Package size={24}/><strong>Подборка пока пуста</strong><span>Добавьте первую позицию с помощью формы выше.</span></div> : <div className="admin-best-offers-list">{payload.data.map((entry) => <article className="panel admin-best-offer-card" key={entry.id}><div className="admin-best-offer-product">{entry.variant?.imageUrl ? <img className="admin-best-offer-thumb" src={entry.variant.imageUrl} alt=""/> : <span className="admin-best-offer-icon"><Package size={21}/></span>}<div><strong>{entry.productName}</strong><span>{entry.brandName} · {entry.variant ? variantLabel(entry.variant) : "Товар целиком"}</span>{entry.description && <small>{entry.description}</small>}</div></div><div className="admin-best-offer-controls"><label className="admin-form-label">Порядок<input type="number" value={orders[entry.id] ?? entry.sortOrder} onChange={(event) => setOrders((current) => ({ ...current, [entry.id]: Number(event.target.value) }))}/></label><span className={`admin-best-offer-state ${entry.isActive ? "is-active" : "is-disabled"}`}><i/>{entry.isActive ? "Активно" : "Отключено"}</span><div className="admin-best-offer-actions"><button type="button" className="icon-action" disabled={busy} onClick={() => void mutate("PATCH", { id: entry.id, sortOrder: orders[entry.id] ?? entry.sortOrder })}><Check size={16}/><span>Сохранить</span></button><button type="button" className="icon-action" disabled={busy} onClick={() => void mutate("PATCH", { id: entry.id, isActive: !entry.isActive })}><Power size={16}/><span>{entry.isActive ? "Отключить" : "Включить"}</span></button><button type="button" className="icon-action danger" disabled={busy} onClick={() => { if (window.confirm("Убрать позицию из подборки?")) void mutate("DELETE", { id: entry.id }); }}><Trash2 size={16}/><span>Убрать</span></button></div></div>{busyId === entry.id && <span className="admin-note admin-best-offer-saving" role="status">Сохранение…</span>}</article>)}</div>}</section>
  </main>;
}
