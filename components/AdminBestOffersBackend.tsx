"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Package, Plus, Power, RefreshCw, Trash2 } from "lucide-react";

type Offer = { id: string; productId: string; title: string; description: string | null; sortOrder: number; isActive: boolean; productName: string; slug: string; brandName: string };
type Product = { id: string; name: string; slug: string; brandName: string };
type Payload = { data: Offer[]; products: Product[] };
const csrf = () => decodeURIComponent(document.cookie.split("; ").find(part => part.startsWith("icenter_csrf="))?.split("=")[1] ?? "");

export default function AdminBestOffersBackend() {
  const [payload, setPayload] = useState<Payload>({ data: [], products: [] });
  const [selectedProduct, setSelectedProduct] = useState("");
  const [newOrder, setNewOrder] = useState(0);
  const [orders, setOrders] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
  const load = useCallback(async () => {
    setError(""); setLoading(true);
    try {
      const response = await fetch("/api/admin/best-offers", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить подборку.");
      setPayload(result);
      setOrders(Object.fromEntries(result.data.map((item: Offer) => [item.id, item.sortOrder])));
      setNewOrder(result.data.reduce((max: number, item: Offer) => Math.max(max, item.sortOrder), -10) + 10);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить подборку."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const mutate = async (method: "POST" | "PATCH" | "DELETE", body: object) => {
    setBusy(true); setError(""); setBusyId("id" in body && typeof body.id === "string" ? body.id : "");
    try {
      const token = csrf();
      if (!token) throw new Error("CSRF-токен недоступен. Войдите повторно.");
      const response = await fetch("/api/admin/best-offers", { method, headers: { "content-type": "application/json", "x-csrf-token": token }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error === "DUPLICATE_PRODUCT" ? "Этот товар уже добавлен в подборку." : result.error === "INVALID_PRODUCT" ? "Товар недоступен для подборки." : result.error ?? "Не удалось сохранить изменения.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить изменения."); }
    finally { setBusy(false); setBusyId(""); }
  };
  const add = async () => {
    if (!selectedProduct) return;
    await mutate("POST", { productId: selectedProduct, sortOrder: newOrder });
    setSelectedProduct("");
  };
  return <main className="admin-content admin-workspace admin-best-offers-page"><header className="workspace-head"><div><h1>Лучшие предложения</h1><p>Подборка товаров для главной страницы</p></div><button className="admin-secondary" type="button" onClick={() => void load()}><RefreshCw size={16}/>Обновить</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="panel admin-best-offers-add"><div className="admin-best-offers-section-head"><div><h2>Добавить товар</h2><p>Выберите опубликованный товар и задайте его позицию.</p></div></div><div className="admin-best-offers-add-row"><label className="admin-form-label">Товар каталога<select value={selectedProduct} onChange={event => setSelectedProduct(event.target.value)}><option value="">Выберите опубликованный товар</option>{payload.products.map(product => <option key={product.id} value={product.id}>{product.brandName} · {product.name}</option>)}</select></label><label className="admin-form-label admin-best-offers-order-field">Порядок<input type="number" min={-100000} max={100000} value={newOrder} onChange={event => setNewOrder(Number(event.target.value))}/></label><button className="admin-primary" type="button" disabled={busy || !selectedProduct} onClick={() => void add()}><Plus size={16}/>Добавить в подборку</button></div>{payload.products.length === 0 && <p className="admin-note">Нет опубликованных товаров, которые ещё не входят в подборку.</p>}</section>
    <section className="admin-best-offers-section"><div className="admin-best-offers-section-head"><div><h2>Товары в подборке</h2><p>{payload.data.length ? `${payload.data.length} ${payload.data.length === 1 ? "предложение" : "предложений"}` : "Управление порядком и активностью"}</p></div></div>{loading && !payload.data.length ? <div className="panel admin-best-offers-empty">Загрузка предложений…</div> : payload.data.length === 0 ? <div className="panel admin-best-offers-empty"><Package size={24}/><strong>Подборка пока пуста</strong><span>Добавьте опубликованный товар с помощью формы выше.</span></div> : <div className="admin-best-offers-list">{payload.data.map(offer => <article className="panel admin-best-offer-card" key={offer.id}><div className="admin-best-offer-product"><span className="admin-best-offer-icon"><Package size={21}/></span><div><strong>{offer.productName}</strong><span>{offer.brandName} · {offer.slug}</span>{offer.description && <small>{offer.description}</small>}</div></div><div className="admin-best-offer-controls"><label className="admin-form-label">Порядок<input aria-label={`Порядок: ${offer.productName}`} type="number" min={-100000} max={100000} value={orders[offer.id] ?? offer.sortOrder} onChange={event => setOrders(current => ({ ...current, [offer.id]: Number(event.target.value) }))}/></label><span className={`admin-best-offer-state ${offer.isActive ? "is-active" : "is-disabled"}`}><i/>{offer.isActive ? "Активно" : "Отключено"}</span><div className="admin-best-offer-actions"><button type="button" className="icon-action" title="Сохранить порядок" aria-label={`Сохранить порядок: ${offer.productName}`} disabled={busy} onClick={() => void mutate("PATCH", { id: offer.id, sortOrder: orders[offer.id] ?? offer.sortOrder })}><Check size={16}/><span>Сохранить</span></button><button type="button" className="icon-action" title={offer.isActive ? "Отключить" : "Включить"} aria-label={offer.isActive ? `Отключить: ${offer.productName}` : `Включить: ${offer.productName}`} disabled={busy} onClick={() => void mutate("PATCH", { id: offer.id, isActive: !offer.isActive })}><Power size={16}/><span>{offer.isActive ? "Отключить" : "Включить"}</span></button><button type="button" className="icon-action danger" title="Убрать из подборки" aria-label={`Убрать из подборки: ${offer.productName}`} disabled={busy} onClick={() => { if (window.confirm("Убрать предложение из подборки? Товар каталога останется без изменений.")) void mutate("DELETE", { id: offer.id }); }}><Trash2 size={16}/><span>Убрать</span></button></div></div>{busyId === offer.id && <span className="admin-note admin-best-offer-saving" role="status">Сохранение…</span>}</article>)}</div>}</section>
    {busyId && !payload.data.some(offer => offer.id === busyId) && <span className="admin-note" role="status">Сохранение…</span>}
  </main>;
}
