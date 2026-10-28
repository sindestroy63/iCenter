"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Minus, Plus, ShoppingBag, Trash2, Truck, MapPin, Phone, Send, PackageOpen } from "lucide-react";
import { useStoreState, type StoreCartItem } from "./StoreState";
import { cities } from "./storeData";
import { cartPriceSummary } from "@/lib/cart-pricing";

function formatRussianPhone(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const hasCountryPrefix = /^\s*\+7/.test(raw) || /^\s*8/.test(raw) || (digits.length === 11 && /^[78]/.test(digits));
  const local = (hasCountryPrefix ? digits.slice(1) : digits).slice(0, 10);
  let formatted = "+7";
  if (local.length) formatted += ` (${local.slice(0, 3)}`;
  if (local.length >= 3) formatted += ")";
  if (local.length > 3) formatted += ` ${local.slice(3, 6)}`;
  if (local.length > 6) formatted += `-${local.slice(6, 8)}`;
  if (local.length > 8) formatted += `-${local.slice(8, 10)}`;
  return formatted;
}

function CartImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return <span className={`cart-image${failed ? " is-fallback" : ""}`} aria-label={failed ? "Изображение товара недоступно" : undefined}>{failed ? <PackageOpen size={24} aria-hidden="true" /> : <img src={src} alt={alt} onError={() => setFailed(true)} />}</span>;
}

function Summary({ items, checkout = false }: { items: StoreCartItem[]; checkout?: boolean }) {
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const summary = cartPriceSummary(items);
  const subtotal = summary.subtotal;
  const money = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;
  return <aside className="order-summary"><div className="summary-head"><div><h2>{checkout ? "Ваша заявка" : "Ваша корзина"}</h2><span>{count} {count === 1 ? "товар" : "товара"}</span></div>{checkout && <Link href="/cart">Изменить</Link>}</div><div className="summary-items">{items.map((item) => <div className="summary-item" key={item.variantId}><CartImage src={item.image} alt={item.name} /><div><b>{item.name}</b><span>{item.details || "Вариант уточняется"}</span></div><strong>{item.quantity}</strong><em>{typeof item.price === "number" ? money(item.price * item.quantity) : "Уточнить цену"}</em></div>)}</div><div className="summary-total"><div><span>Товары</span><b>{summary.totalLabel === "known" ? money(subtotal) : summary.totalLabel === "partial" ? `${money(subtotal)} + уточнение` : "Уточнить цену"}</b></div><div><span>Доставка</span><b>Уточняется</b></div><hr /><div className="total-line"><strong>Итого</strong><b>{summary.totalLabel === "known" ? `${money(subtotal)} + доставка` : "Уточнить цену"}</b></div></div></aside>;
}

export function CartView() {
  const { cart, city, cartPricesCity, updateCartQuantity, removeFromCart, clearCart, hydrated } = useStoreState();
  if (!hydrated) return <div className="cart-page layout-container loading-state">Загрузка корзины…</div>;
  if (!cart.length) return <div className="cart-page layout-container"><div className="empty-cart"><ShoppingBag size={46} /><h1>Корзина пуста</h1><p>Добавьте товары из каталога, чтобы оформить заявку.</p><Link className="dark-button" href="/catalog">Перейти в каталог <ArrowRight size={17} /></Link></div></div>;
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const money = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;
  return <div className="cart-page layout-container"><div className="cart-title-row"><div><h1>Корзина</h1><p className="demo-note">Корзина хранится в этом браузере; цены и наличие обновляются по каталогу выбранного города.</p></div></div><div className="cart-layout"><section className="cart-items"><div className="cart-list-head"><span>{count} {count === 1 ? "товар" : "товара"}</span><button onClick={clearCart}>Очистить корзину</button></div>{cart.map((item) => { const currentPrice = cartPricesCity === city && item.priceCity === city && (item.availability === "IN_STOCK" || item.availability === "PREORDER") ? item.price : null; return <article className="cart-row" key={item.variantId}><CartImage src={item.image} alt={item.name} /><div className="cart-row-info"><h2>{item.name}</h2><p>{item.details || "Вариант уточняется"}</p><span>{item.availability === "OUT_OF_STOCK" ? "Нет в наличии" : item.availability === "PREORDER" ? "Под заказ" : currentPrice !== null && currentPrice !== undefined ? `${money(currentPrice)} за шт.` : "Уточнить цену"}</span></div><div className="quantity"><button onClick={() => updateCartQuantity(item.variantId, item.quantity - 1)} aria-label="Уменьшить"><Minus size={15} /></button><b>{item.quantity}</b><button onClick={() => updateCartQuantity(item.variantId, item.quantity + 1)} aria-label="Увеличить"><Plus size={15} /></button></div><strong className="cart-price">{currentPrice !== null && currentPrice !== undefined ? `${item.quantity} × ${money(currentPrice)} = ${money(item.quantity * currentPrice)}` : "Уточнить цену"}</strong><button className="remove-item" onClick={() => removeFromCart(item.variantId)} aria-label="Удалить"><Trash2 size={18} /></button></article>; })}<Link className="continue-link" href="/catalog">← Продолжить покупки</Link></section><div><Summary items={cart.map((item) => cartPricesCity === city && item.priceCity === city && (item.availability === "IN_STOCK" || item.availability === "PREORDER") ? item : { ...item, price: null })} /><Link className="dark-button" href="/checkout">Оформить заявку <ArrowRight size={17} /></Link></div></div></div>;
}

export function CheckoutView() {
  const router = useRouter();
  const { cart, city, cityInfo, cartPricesCity, hydrated, clearCart } = useStoreState();
  const [contact, setContact] = useState("phone");
  const [receive, setReceive] = useState("pickup");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const cityName = cities.find((item) => item.slug === city)?.name ?? city;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!cart.length) { setError("Добавьте хотя бы один товар в корзину."); return; }
    const phoneDigits = phone.replace(/\D/g, "");
    if (!name.trim() || phoneDigits.length !== 11 || !phoneDigits.startsWith("7") || !consent || (receive === "delivery" && !address.trim())) {
      setError(receive === "delivery" && !address.trim() ? "Укажите адрес доставки." : "Заполните имя, корректный телефон и подтвердите согласие.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const idempotencyKey = window.sessionStorage.getItem("icenter-request-idempotency") ?? crypto.randomUUID();
      window.sessionStorage.setItem("icenter-request-idempotency", idempotencyKey);
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ name, phone, city, contactMethod: contact, fulfillment: receive, address, comment, consent, items: cart.map((item) => ({ variantId: item.variantId, quantity: item.quantity })) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.requestNumber !== "string") {
        const errors: Record<string, string> = {
          PRICE_UNAVAILABLE: "Цена или наличие одной из позиций не подтверждены сервером.",
          STOCK_UNAVAILABLE: "Один из вариантов сейчас недоступен в выбранном городе.",
          VARIANT_UNAVAILABLE: "Один из вариантов больше недоступен. Обновите корзину.",
          REQUEST_SERVICE_UNAVAILABLE: "Не удалось сохранить заявку. Попробуйте позже.",
          IDEMPOTENCY_CONFLICT: "Данные заявки изменились. Обновите страницу и отправьте её снова.",
        };
        throw new Error(errors[result.error] ?? "Не удалось оформить заявку. Проверьте данные и повторите попытку.");
      }
      window.sessionStorage.setItem("icenter-request-number", result.requestNumber);
      window.sessionStorage.removeItem("icenter-request-idempotency");
      clearCart();
      router.push("/checkout/success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось оформить заявку. Повторите попытку.");
    } finally {
      setSubmitting(false);
    }
  };
  if (!hydrated) return <div className="checkout-page layout-container loading-state">Загрузка заявки…</div>;
  if (!cart.length) return <div className="checkout-page layout-container"><div className="empty-cart"><ShoppingBag size={46} /><h1>Сначала добавьте товар</h1><p>Оформление заявки доступно после добавления позиции.</p><Link className="dark-button" href="/catalog">Перейти в каталог <ArrowRight size={17} /></Link></div></div>;
  return <div className="checkout-page layout-container">

    <div className="checkout-title"><div><h1>Оформление заявки</h1><p>Заполните данные, чтобы мы могли связаться с вами</p></div></div>
    <form className="checkout-layout" onSubmit={submit}>
      <main className="checkout-form">
        <section className="form-section"><h2>Контактные данные</h2><p>Мы свяжемся с вами для подтверждения заявки</p><div className="form-grid">
          <label>Имя <sup>*</sup><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ваше имя" autoComplete="name" /></label>
          <label>Телефон <sup>*</sup><input inputMode="tel" value={phone} onChange={(event) => setPhone(formatRussianPhone(event.target.value))} placeholder="+7 (999) 999-99-99" autoComplete="tel" /></label>
        </div><fieldset><legend>Предпочтительный способ связи <sup>*</sup></legend><div className="choice-grid three">
          <button type="button" className={contact === "phone" ? "selected" : ""} onClick={() => setContact("phone")}><Phone /><b>По телефону</b><span>Позвоним для подтверждения</span></button>
          <button type="button" className={contact === "telegram" ? "selected" : ""} onClick={() => setContact("telegram")}><Send /><b>В Telegram</b><span>Напишем в Telegram</span></button>
          <button type="button" className={contact === "max" ? "selected" : ""} onClick={() => setContact("max")}><Send /><b>В MAX</b><span>Напишем в MAX</span></button>
        </div></fieldset></section>
        <section className="form-section"><h2>Способ получения</h2><p>Выбранный город: {cityName}</p><div className="choice-grid two">
          <button type="button" className={receive === "pickup" ? "selected" : ""} onClick={() => setReceive("pickup")}><MapPin /><b>Самовывоз</b><span>{cityInfo?.address || "Адрес не указан"}</span></button>
          <button type="button" className={receive === "delivery" ? "selected" : ""} onClick={() => setReceive("delivery")}><Truck /><b>Доставка</b><span>{cityInfo?.workingHours || "Условия уточняются"}</span></button>
        </div>{receive === "delivery" && <label className="delivery-address">Адрес доставки <sup>*</sup><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Город, улица, дом" /></label>}</section>
        <section className="form-section comment-section"><label>Комментарий к заявке <span>(необязательно)</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: удобное время для звонка..." /></label></section>
      </main>
      <aside className="checkout-aside"><Summary items={cart.map((item) => cartPricesCity === city && item.priceCity === city && (item.availability === "IN_STOCK" || item.availability === "PREORDER") ? item : { ...item, price: null })} checkout /><button className="confirm-button" type="submit" disabled={submitting}>{submitting ? "Сохраняем заявку…" : "Подтвердить заявку"} {!submitting && <ArrowRight size={18} />}</button><div><label className="consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Даю согласие на обработку персональных данных для оформления заявки, связи со мной и организации получения или доставки товаров.</span></label><p className="demo-note">Ознакомьтесь с <Link href="/privacy">Политикой обработки персональных данных</Link> и <Link href="/personal-data-consent">Согласием на обработку персональных данных</Link>.</p></div>{error && <p className="form-error" role="alert">{error}</p>}</aside>
    </form>
  </div>;
}

export function SuccessView() {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const submittedRequestNumber = window.sessionStorage.getItem("icenter-request-number");
    if (submittedRequestNumber) {
      setConfirmed(true);
      window.sessionStorage.removeItem("icenter-request-number");
      return;
    }
    router.replace("/checkout");
  }, [router]);
  useEffect(() => {
    if (!confirmed) return;
    const timeout = window.setTimeout(() => router.replace("/"), 10000);
    return () => window.clearTimeout(timeout);
  }, [confirmed, router]);
  if (!confirmed) return <div className="success-page layout-container loading-state">Проверяем результат…</div>;
  return <div className="success-page layout-container"><div className="success-card"><div className="success-icon"><Check size={34} /></div><h1>Заявка принята</h1><p>Мы свяжемся с вами в ближайшее время.</p><Link className="dark-button" href="/">На главную <ArrowRight size={17} /></Link></div></div>;
}
