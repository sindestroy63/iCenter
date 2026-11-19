"use client";

import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Minus, Plus, ShoppingBag, Trash2, Truck, MapPin, Phone, Send, PackageOpen } from "lucide-react";
import { useStoreState, type StoreCartItem } from "./StoreState";
import { cities } from "./storeData";
import { cartPriceSummary } from "@/lib/cart-pricing";
import ConsentFields, { type ConsentState } from "@/components/ConsentFields";
import { formatRussianPhoneInput, removeAdjacentRussianPhoneDigit } from "@/lib/phone";
import { availabilityLabel } from "@/lib/inventory-availability";

function CartImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return <span className={`cart-image${failed ? " is-fallback" : ""}`} aria-label={failed ? "Изображение товара недоступно" : undefined}>{failed ? <PackageOpen size={24} aria-hidden="true" /> : <img src={src} alt={alt} onError={() => setFailed(true)} />}</span>;
}

function AnimatedValue({ value }: { value: string | number }) {
  return <span className="cart-value-transition" key={value}>{value}</span>;
}

type PromoQuote = { code: string; discount: number; subtotal: number; total: number };

function usePromoQuote(promoCode: string, cart: StoreCartItem[], city: string) {
  const [quote, setQuote] = useState<PromoQuote | null>(null);
  const [promoError, setPromoError] = useState("");
  const [checking, setChecking] = useState(false);
  const [validationAttempt, setValidationAttempt] = useState(0);
  useEffect(() => {
    if (!promoCode || !cart.length) { setQuote(null); setPromoError(""); setChecking(false); return; }
    const controller = new AbortController();
    setQuote(null);
    setChecking(true);
    fetch("/api/promo-codes", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ code: promoCode, city, items: cart.map(({ variantId, quantity }) => ({ variantId, quantity })) }) })
      .then(async (response) => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error ?? "PROMO_UNAVAILABLE"); return body as PromoQuote; })
      .then((body) => { setQuote(body); setPromoError(""); })
      .catch((error) => { if (!controller.signal.aborted) { setQuote(null); const code = error instanceof Error ? error.message : ""; setPromoError(code === "PROMO_INVALID" ? "Проверьте написание промокода." : code === "PROMO_UNAVAILABLE" ? "Промокод недействителен, истёк или исчерпан." : code === "CITY_UNAVAILABLE" ? "Для выбранного города промокод сейчас недоступен." : code === "VARIANT_UNAVAILABLE" || code === "PRICE_UNAVAILABLE" ? "Не удалось подтвердить цены и наличие товаров для промокода." : "Не удалось проверить промокод."); } })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [promoCode, cart, city, validationAttempt]);
  return { quote, promoError, checking, retryPromoCheck: () => setValidationAttempt((attempt) => attempt + 1) };
}

type PromoControls = {
  code: string;
  draft: string;
  setDraft: (value: string) => void;
  apply: () => void;
  remove: () => void;
  checking: boolean;
  error: string;
};

function Summary({ items, checkout = false, delivery = false, quote = null, promo }: { items: StoreCartItem[]; checkout?: boolean; delivery?: boolean; quote?: PromoQuote | null; promo?: PromoControls }) {
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const summary = cartPriceSummary(items);
  const subtotal = summary.subtotal;
  const money = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;
  const subtotalLabel = summary.totalLabel === "known" ? money(subtotal) : summary.totalLabel === "partial" ? `${money(subtotal)} + уточнение` : "Уточнить цену";
  const totalLabel = quote ? money(quote.total) : subtotalLabel;
  return <aside className="order-summary"><div className="summary-head"><div><h2>{checkout ? "Ваша заявка" : "Ваша корзина"}</h2><span><AnimatedValue value={count} /> {count === 1 ? "товар" : "товара"}</span></div>{checkout && <Link href="/cart">Изменить</Link>}</div><div className="summary-items">{items.map((item) => <div className="summary-item" key={item.variantId}><CartImage src={item.image} alt={item.name} /><div><b>{item.name}</b><span>{item.details || "Вариант уточняется"}</span></div><strong><AnimatedValue value={item.quantity} /></strong><em><AnimatedValue value={typeof item.price === "number" ? money(item.price * item.quantity) : "Уточнить цену"} /></em></div>)}</div>{promo && <div className="summary-promo"><div className="summary-promo-head"><span>Промокод</span>{promo.code && <button type="button" className="summary-promo-remove" onClick={promo.remove}>Удалить</button>}</div>{quote ? <div className="summary-promo-success" role="status"><span><Check size={15} />{quote.code} применён</span><button type="button" onClick={promo.apply}>Проверить ещё раз</button></div> : promo.code && promo.checking ? <div className="summary-promo-loading" role="status">Проверяем {promo.code}…</div> : <div className="summary-promo-form" role="group" aria-label="Применение промокода"><label htmlFor="checkout-promo-code">Введите промокод<input id="checkout-promo-code" value={promo.draft} onChange={(event) => promo.setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); promo.apply(); } }} maxLength={64} autoComplete="off" placeholder="Например, WELCOME1000" /></label><button className="admin-secondary" type="button" onClick={promo.apply} disabled={!promo.draft.trim() || promo.checking}>{promo.checking ? "Проверяем…" : promo.code ? "Повторить проверку" : "Применить"}</button></div>}{promo.error && !promo.checking && <p className="form-error" role="alert">{promo.error}</p>}</div>}<div className="summary-total"><div><span>{quote ? "Товары до скидки" : "Товары"}</span><b><AnimatedValue value={quote ? money(quote.subtotal) : subtotalLabel} /></b></div>{quote && <div><span>Скидка по промокоду</span><b>−{money(quote.discount)}</b></div>}{delivery && <div><span>Доставка</span><b>Уточняется</b></div>}<hr /><div className="total-line"><strong>Итого</strong><b><AnimatedValue value={totalLabel} /></b></div></div></aside>;
}

export function CartView() {
  const { cart, city, cartPricesCity, updateCartQuantity, removeFromCart, clearCart, hydrated, promoCode, setPromoCode } = useStoreState();
  const [promoDraft, setPromoDraft] = useState(promoCode);
  const { quote, promoError, checking, retryPromoCheck } = usePromoQuote(promoCode, cart, city);
  useEffect(() => { setPromoDraft(promoCode); }, [promoCode]);
  const applyPromo = () => {
    const next = promoDraft.trim();
    if (!next || checking) return;
    if (next === promoCode) retryPromoCheck();
    else setPromoCode(next);
  };
  if (!hydrated) return <div className="cart-page layout-container loading-state">Загрузка корзины…</div>;
  if (!cart.length) return <div className="cart-page layout-container"><div className="empty-cart"><ShoppingBag size={46} /><h1>Корзина пуста</h1><p>Добавьте товары из каталога, чтобы оформить заявку.</p><Link className="dark-button" href="/catalog">Перейти в каталог <ArrowRight size={17} /></Link></div></div>;
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const money = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;
  const summaryItems = cart.map((item) => cartPricesCity === city && item.priceCity === city && (item.availability === "IN_STOCK" || item.availability === "PREORDER") ? item : { ...item, price: null });
  return <div className="cart-page layout-container"><div className="store-page-heading"><h1>Корзина</h1><p>Проверьте выбранные товары перед оформлением заявки</p></div><div className="cart-layout"><section className="cart-items"><div className="cart-list-head"><span>{count} {count === 1 ? "товар" : "товара"}</span><button onClick={clearCart}>Очистить корзину</button></div>{cart.map((item) => { const currentPrice = cartPricesCity === city && item.priceCity === city && (item.availability === "IN_STOCK" || item.availability === "PREORDER") ? item.price : null; const priceLabel = currentPrice !== null && currentPrice !== undefined ? `${item.quantity} × ${money(currentPrice)} = ${money(item.quantity * currentPrice)}` : "Уточнить цену"; const availability = availabilityLabel({ availability: item.availability ?? "UNSPECIFIED", allowPreorder: item.availability === "PREORDER", deliveryTime: item.deliveryTime ?? null }); return <article className="cart-row" key={item.variantId}><CartImage src={item.image} alt={item.name} /><div className="cart-row-info"><h2>{item.name}</h2><p>{item.details || "Вариант уточняется"}</p><span>{availability}</span></div><div className="quantity"><button onClick={() => updateCartQuantity(item.variantId, item.quantity - 1)} aria-label="Уменьшить"><Minus size={15} /></button><b><AnimatedValue value={item.quantity} /></b><button onClick={() => updateCartQuantity(item.variantId, item.quantity + 1)} aria-label="Увеличить"><Plus size={15} /></button></div><strong className="cart-price"><AnimatedValue value={priceLabel} /></strong><button className="remove-item" onClick={() => removeFromCart(item.variantId)} aria-label="Удалить"><Trash2 size={18} /></button></article>; })}<Link className="continue-link" href="/catalog">← Продолжить покупки</Link></section><div><Summary items={summaryItems} quote={quote} promo={{ code: promoCode, draft: promoDraft, setDraft: setPromoDraft, apply: applyPromo, remove: () => { setPromoCode(""); setPromoDraft(""); }, checking, error: promoError }} /><Link className="dark-button" href="/checkout">Оформить заявку <ArrowRight size={17} /></Link></div></div></div>;
}

export function CheckoutView() {
  const router = useRouter();
  const { cart, city, cityInfo, cartPricesCity, hydrated, clearCart, promoCode, setPromoCode, citySelectionRequired } = useStoreState();
  const { quote, promoError, checking, retryPromoCheck } = usePromoQuote(promoCode, cart, city);
  const [promoDraft, setPromoDraft] = useState(promoCode);
  const [contact, setContact] = useState("phone");
  const [receive, setReceive] = useState("pickup");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const phoneCursorRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (phoneCursorRef.current === null || !phoneInputRef.current) return;
    phoneInputRef.current.setSelectionRange(phoneCursorRef.current, phoneCursorRef.current);
    phoneCursorRef.current = null;
  }, [phone]);
  useEffect(() => { setPromoDraft(promoCode); }, [promoCode]);
  const applyPromo = () => { const next = promoDraft.trim(); if (!next || checking) return; if (next === promoCode) retryPromoCheck(); else setPromoCode(next); };
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [consents, setConsents] = useState<ConsentState>({ personalDataConsent: false, privacyConsent: false });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const cityName = cities.find((item) => item.slug === city)?.name ?? city;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!cart.length) { setError("Добавьте хотя бы один товар в корзину."); return; }
    const phoneDigits = phone.replace(/\D/g, "");
    if (!name.trim() || phoneDigits.length !== 11 || !phoneDigits.startsWith("7") || !consents.personalDataConsent || !consents.privacyConsent || (receive === "delivery" && !address.trim())) {
      setError(receive === "delivery" && !address.trim() ? "Укажите адрес доставки." : "Заполните имя, корректный телефон и подтвердите оба согласия.");
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
        body: JSON.stringify({ name, phone, city, contactMethod: contact, fulfillment: receive, address, comment, consent: true, personalDataConsent: consents.personalDataConsent, privacyConsent: consents.privacyConsent, promoCode, items: cart.map((item) => ({ variantId: item.variantId, quantity: item.quantity })) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.requestNumber !== "string") {
        const errors: Record<string, string> = {
          PRICE_UNAVAILABLE: "Цена или наличие одной из позиций не подтверждены сервером.",
          STOCK_UNAVAILABLE: "Один из вариантов сейчас недоступен в выбранном городе.",
          VARIANT_UNAVAILABLE: "Один из вариантов больше недоступен. Обновите корзину.",
          REQUEST_SERVICE_UNAVAILABLE: "Не удалось сохранить заявку. Попробуйте позже.",
          IDEMPOTENCY_CONFLICT: "Данные заявки изменились. Обновите страницу и отправьте её снова.",
          IDEMPOTENCY_RETIRED: "Эта заявка уже удалена. Обновите страницу, чтобы создать новую заявку.",
          PROMO_INVALID: "Проверьте написание промокода.",
          PROMO_UNAVAILABLE: "Промокод больше не действует или исчерпал лимит. Удалите его и повторите оформление.",
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
  if (citySelectionRequired) return <div className="checkout-page layout-container"><div className="empty-cart"><MapPin size={46} /><h1>Выберите город</h1><p>Подтвердите город, чтобы увидеть актуальные цены и оформить заявку.</p><Link className="dark-button" href="/">Выбрать город <ArrowRight size={17} /></Link></div></div>;
  if (!cart.length) return <div className="checkout-page layout-container"><div className="empty-cart"><ShoppingBag size={46} /><h1>Сначала добавьте товар</h1><p>Оформление заявки доступно после добавления позиции.</p><Link className="dark-button" href="/catalog">Перейти в каталог <ArrowRight size={17} /></Link></div></div>;
  return <div className="checkout-page layout-container">

    <div className="store-page-heading"><h1>Оформление заявки</h1><p>Заполните данные, чтобы мы могли связаться с вами</p></div>
    <form className="checkout-layout" onSubmit={submit}>
      <main className="checkout-form">
        <section className="form-section"><h2>Контактные данные</h2><p>Мы свяжемся с вами для подтверждения заявки</p><div className="form-grid">
          <label>Имя <sup>*</sup><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ваше имя" autoComplete="name" /></label>
          <label>Телефон <sup>*</sup><input inputMode="tel" ref={phoneInputRef} value={phone} onChange={(event) => { const next = formatRussianPhoneInput(event.target.value, event.target.selectionStart); phoneCursorRef.current = next.cursor; setPhone(next.value); }} onKeyDown={(event) => { if (event.nativeEvent.isComposing || event.currentTarget.selectionStart !== event.currentTarget.selectionEnd || (event.key !== "Backspace" && event.key !== "Delete")) return; const next = removeAdjacentRussianPhoneDigit(phone, event.currentTarget.selectionStart ?? 0, event.key === "Backspace" ? "backward" : "forward"); if (!next) return; event.preventDefault(); phoneCursorRef.current = next.cursor; setPhone(next.value); }} placeholder="+7 (999) 999-99-99" autoComplete="tel" /></label>
        </div><fieldset><legend>Предпочтительный способ связи <sup>*</sup></legend><div className="choice-grid three">
          <button type="button" className={contact === "phone" ? "selected" : ""} onClick={() => setContact("phone")}><Phone /><b>По телефону</b><span>Позвоним для подтверждения</span></button>
          <button type="button" className={contact === "telegram" ? "selected" : ""} onClick={() => setContact("telegram")}><Send /><b>В Telegram</b><span>Напишем в Telegram</span></button>
          <button type="button" className={contact === "max" ? "selected" : ""} onClick={() => setContact("max")}><Send /><b>В MAX</b><span>Напишем в MAX</span></button>
        </div></fieldset></section>
        <section className="form-section"><h2>Способ получения</h2><p>Выбранный город: {cityName}</p><div className="choice-grid two">
          <button type="button" className={receive === "pickup" ? "selected" : ""} onClick={() => setReceive("pickup")}><MapPin /><b>Самовывоз</b><span>{cityInfo?.address || "Адрес не указан"}</span></button>
          <button type="button" className={receive === "delivery" ? "selected" : ""} onClick={() => setReceive("delivery")}><Truck /><b>Доставка</b><span>Адрес и условия доставки уточнит менеджер</span></button>
        </div>{receive === "delivery" && <label className="delivery-address">Адрес доставки <sup>*</sup><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Город, улица, дом" /></label>}</section>
        <section className="form-section comment-section"><label>Комментарий к заявке <span>(необязательно)</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: удобное время для звонка..." /></label></section>
      </main>
      <aside className="checkout-aside"><Summary items={cart.map((item) => cartPricesCity === city && item.priceCity === city && (item.availability === "IN_STOCK" || item.availability === "PREORDER") ? item : { ...item, price: null })} checkout delivery={receive === "delivery"} quote={quote} promo={{ code: promoCode, draft: promoDraft, setDraft: setPromoDraft, apply: applyPromo, remove: () => { setPromoCode(""); setPromoDraft(""); }, checking, error: promoError }} /><button className="confirm-button" type="submit" disabled={submitting}>{submitting ? "Сохраняем заявку…" : "Подтвердить заявку"} {!submitting && <ArrowRight size={18} />}</button><ConsentFields value={consents} onChange={setConsents} className="request-consents checkout-consents" />{error && <p className="form-error" role="alert">{error}</p>}</aside>
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
