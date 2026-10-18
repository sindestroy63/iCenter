"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Minus, Plus, ShoppingBag, Trash2, Truck, MapPin, Phone, Send } from "lucide-react";
import { useStoreState, type StoreCartItem } from "./StoreState";
import { cities } from "./storeData";

function Summary({ items, checkout = false }: { items: StoreCartItem[]; checkout?: boolean }) {
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  return <aside className="order-summary"><div className="summary-head"><div><h2>{checkout ? "Ваша заявка" : "Ваша корзина"}</h2><span>{count} {count === 1 ? "товар" : "товара"}</span></div>{checkout && <Link href="/cart">Изменить</Link>}</div><div className="summary-items">{items.map((item) => <div className="summary-item" key={item.variantId}><img src={item.image} alt={item.name} /><div><b>{item.name}</b><span>{item.details || "Вариант уточняется"}</span></div><strong>{item.quantity}</strong><em>Уточнить цену</em></div>)}</div><div className="summary-total"><div><span>Товары</span><b>Уточнить цену</b></div><div><span>Доставка</span><b>Уточняется</b></div><hr /><div className="total-line"><strong>Итого</strong><b>Уточнить цену</b></div></div></aside>;
}

export function CartView() {
  const { cart, updateCartQuantity, removeFromCart, clearCart, hydrated } = useStoreState();
  if (!hydrated) return <div className="cart-page container loading-state">Загрузка корзины…</div>;
  if (!cart.length) return <div className="cart-page container"><div className="checkout-crumbs"><Link href="/">Главная</Link><span>›</span><span>Корзина</span></div><div className="empty-cart"><ShoppingBag size={46} /><h1>Корзина пуста</h1><p>Добавьте товары из каталога, чтобы оформить заявку.</p><Link className="dark-button" href="/catalog">Перейти в каталог <ArrowRight size={17} /></Link></div></div>;
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  return <div className="cart-page container"><div className="checkout-crumbs"><Link href="/">Главная</Link><span>›</span><span>Корзина</span></div><div className="cart-title-row"><div><h1>Корзина</h1><p className="demo-note">Локальная демонстрационная корзина; серверная проверка появится после подключения API.</p></div></div><div className="cart-layout"><section className="cart-items"><div className="cart-list-head"><span>{count} {count === 1 ? "товар" : "товара"}</span><button onClick={clearCart}>Очистить корзину</button></div>{cart.map((item) => <article className="cart-row" key={item.variantId}><img src={item.image} alt={item.name} /><div className="cart-row-info"><h2>{item.name}</h2><p>{item.details || "Вариант уточняется"}</p><span>Уточнить цену</span></div><div className="quantity"><button onClick={() => updateCartQuantity(item.variantId, item.quantity - 1)} aria-label="Уменьшить"><Minus size={15} /></button><b>{item.quantity}</b><button onClick={() => updateCartQuantity(item.variantId, item.quantity + 1)} aria-label="Увеличить"><Plus size={15} /></button></div><strong className="cart-price">Уточнить цену</strong><button className="remove-item" onClick={() => removeFromCart(item.variantId)} aria-label="Удалить"><Trash2 size={18} /></button></article>)}<Link className="continue-link" href="/catalog">← Продолжить покупки</Link></section><Summary items={cart} /></div></div>;
}

export function CheckoutView() {
  const router = useRouter();
  const { cart, city, hydrated } = useStoreState();
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
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!cart.length) { setError("Добавьте хотя бы один товар в корзину."); return; }
    if (!name.trim() || phone.replace(/\D/g, "").length < 10 || !consent || (receive === "delivery" && !address.trim())) { setError(receive === "delivery" && !address.trim() ? "Укажите адрес доставки." : "Заполните имя, корректный телефон и подтвердите согласие."); return; }
    setSubmitting(true);
    window.sessionStorage.setItem("icenter-demo-submitted", "1");
    router.push("/checkout/success");
  };
  if (!hydrated) return <div className="checkout-page container loading-state">Загрузка заявки…</div>;
  if (!cart.length) return <div className="checkout-page container"><div className="empty-cart"><ShoppingBag size={46} /><h1>Сначала добавьте товар</h1><p>Оформление заявки доступно после добавления позиции.</p><Link className="dark-button" href="/catalog">Перейти в каталог <ArrowRight size={17} /></Link></div></div>;
  return <div className="checkout-page container"><div className="checkout-crumbs"><Link href="/">Главная</Link><span>›</span><Link href="/cart">Корзина</Link><span>›</span><span>Оформление заявки</span></div><div className="checkout-title"><div><h1>Оформление заявки</h1><p>Заполните данные, чтобы мы могли связаться с вами</p></div><div className="steps"><b>1</b><span>Контакты</span><i>2</i><span>Получение</span><i>3</i><span>Подтверждение</span></div></div><form className="checkout-layout" onSubmit={submit}><main className="checkout-form"><section className="form-section"><h2>Контактные данные</h2><p>Мы свяжемся с вами для подтверждения заявки</p><div className="form-grid"><label>Имя <sup>*</sup><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ваше имя" autoComplete="name" /></label><label>Телефон <sup>*</sup><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 (___) ___-__-__" autoComplete="tel" /></label></div><fieldset><legend>Предпочтительный способ связи  <sup>*</sup></legend><div className="choice-grid three"><button type="button" className={contact === "phone" ? "selected" : ""} onClick={() => setContact("phone")}><Phone /><b>По телефону</b><span>Позвоним для подтверждения</span></button><button type="button" className={contact === "telegram" ? "selected" : ""} onClick={() => setContact("telegram")}><Send /><b>В Telegram</b><span>Напишем в Telegram</span></button><button type="button" className={contact === "max" ? "selected" : ""} onClick={() => setContact("max")}><Send /><b>В MAX</b><span>Напишем в MAX</span></button></div></fieldset></section><section className="form-section"><h2>Способ получения</h2><p>Выбранный город:  {cityName}</p><div className="choice-grid two"><button type="button" className={receive === "pickup" ? "selected" : ""} onClick={() => setReceive("pickup")}><MapPin /><b>Самовывоз</b><span>Адрес уточняется по городу</span></button><button type="button" className={receive === "delivery" ? "selected" : ""} onClick={() => setReceive("delivery")}><Truck /><b>Доставка</b><span>Условия уточняются</span></button></div>{receive === "delivery" && <label className="delivery-address">Адрес доставки  <sup>*</sup><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Город, улица, дом" /></label>}</section><section className="form-section comment-section"><label>Комментарий к заявке  <span>(необязательно)</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: удобное время для звонка..." /></label></section></main><aside className="checkout-aside"><Summary items={cart} checkout /><button className="confirm-button" type="submit" disabled={submitting}>{submitting ? "Проверяем данные…" : "Подтвердить заявку"} {!submitting && <ArrowRight size={18} />}</button><label className="consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />Я соглашаюсь с условиями обработки персональных данных</label>{error && <p className="form-error" role="alert">{error}</p>}<p className="demo-note">Демонстрационный режим: заявка не отправляется в API и не создаётся в БД.</p></aside></form></div>;
}

export function SuccessView() {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const wasSubmitted = window.sessionStorage.getItem("icenter-demo-submitted") === "1";
    window.sessionStorage.removeItem("icenter-demo-submitted");
    if (!wasSubmitted) {
      router.replace("/checkout");
      return;
    }
    setConfirmed(true);
  }, [router]);
  if (!confirmed) return <div className="success-page container loading-state">Проверяем результат…</div>;
  return <div className="success-page container"><div className="success-card"><div className="success-icon"><Check size={34} /></div><h1>Локальная проверка пройдена</h1><p>Форма проверила заполненные поля в браузере. Заявка не отправлена и не сохранена; после подключения API на этом экране появится подтверждение.</p><span className="demo-note">Демонстрационный режим, без записи в БД.</span><Link className="dark-button" href="/catalog">Вернуться в каталог <ArrowRight size={17} /></Link></div></div>;
}
