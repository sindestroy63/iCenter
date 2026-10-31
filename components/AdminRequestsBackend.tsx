"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { AdminUserContext } from "@/components/AdminShell";

type RequestItem = { name: string; sku: string; variant: { label?: string; attributes?: Record<string, unknown> }; quantity: number; price: number };
type RequestRow = { id: string; createdAt: string; city: string; name: string; phone: string; address: string; comment: string; contactMethod: string; fulfillment: string; total: number; status: string; items: RequestItem[] };
type TradeInRow = { id: string; requestType: "trade_in" | "installment"; origin: "page" | "product"; createdAt: string; city: string; name: string; phone: string; brand: string; deviceType: string; device: string; configuration: string; color: string; batteryHealth: number | null; equipment: string[]; condition: string; comment: string; product: string; desiredDevice: string; photoUrls: string[]; status: string };
type SortKey = "date" | "number" | "city" | "client" | "status" | "device" | "product";
type SortState = { key: SortKey; direction: 1 | -1 };
const statusOptions = [["NEW", "Новая"], ["PROCESSING", "В обработке"], ["CONFIRMED", "Подтверждена"], ["SHIPPING", "Доставка"], ["COMPLETED", "Завершена"], ["CANCELLED", "Отменена"]] as const;
const statusLabel = (status: string) => statusOptions.find(([value]) => value === status)?.[1] ?? status;
const csrf = () => decodeURIComponent(document.cookie.split("; ").find((part) => part.trim().startsWith("icenter_csrf="))?.split("=")[1] ?? "");
function compareRows<T extends RequestRow | TradeInRow>(left: T, right: T, sort: SortState) {
  const field = (row: T): string | number => {
    switch (sort.key) {
      case "date": return new Date(row.createdAt).getTime();
      case "number": return row.id;
      case "city": return row.city;
      case "client": return row.name;
      case "status": return row.status;
      case "device": return "device" in row ? row.device : "";
      case "product": return "product" in row ? row.product : "";
    }
  };
  const a = field(left), b = field(right);
  const result = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "ru");
  return result * sort.direction;
}

function SortButton({ label, sortKey, sort, onSort }: { label: string; sortKey: SortKey; sort: SortState; onSort: (key: SortKey) => void }) {
  const active = sort.key === sortKey;
  const Icon = active ? sort.direction === 1 ? ArrowUp : ArrowDown : ArrowUpDown;
  return <button type="button" className="request-sort-button" onClick={() => onSort(sortKey)} aria-label={`Сортировать: ${label}`} aria-pressed={active}>{label}<Icon size={13} aria-hidden="true" /></button>;
}

export default function AdminRequestsBackend() {
  const admin = useContext(AdminUserContext);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [tradeInRows, setTradeInRows] = useState<TradeInRow[]>([]);
  const [requestType,setRequestType]=useState<"cart"|"trade_in"|"installment">("cart");
  const [selectedTradeIn,setSelectedTradeIn]=useState<TradeInRow|null>(null);
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortState>({ key: "date", direction: -1 });
  const [statusSaving, setStatusSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  async function changeType(type: "cart"|"trade_in"|"installment") {
    setRequestType(type); setError(""); setSelected(null); setSelectedTradeIn(null);
    setLoading(true);
    try {
      const response=await fetch(`/api/admin/requests?type=${type}`,{cache:"no-store"});
      const payload=await response.json();
      if(!response.ok) throw new Error(payload.error??"REQUESTS_UNAVAILABLE");
      if(type==="trade_in" || type==="installment") setTradeInRows(payload.data); else setRows(payload.data);
    } catch { setError("Не удалось загрузить заявки."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/admin/requests", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить заявки.");
      if (active) setRows(payload.data);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Не удалось загрузить заявки."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const sortedCartRows = useMemo(() => [...rows].sort((left, right) => compareRows(left, right, sort)), [rows, sort]);
  const sortedTradeInRows = useMemo(() => [...tradeInRows].sort((left, right) => compareRows(left, right, sort)), [tradeInRows, sort]);
  function toggleSort(key: SortKey) {
    setSort((current) => ({ key, direction: current.key === key ? (current.direction === 1 ? -1 : 1) : key === "date" ? -1 : 1 }));
  }
  useEffect(() => {
    const requestId = new URLSearchParams(window.location.search).get("request");
    const request = requestId && rows.find((row) => row.id === requestId);
    if (request) setSelected(request);
  }, [rows]);
  async function saveStatus(status: string) {
    if (!selected || status === selected.status || statusSaving) return;
    setStatusSaving(true);
    setStatusError("");
    try {
      const response = await fetch(`/api/admin/requests/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const messages: Record<string, string> = { FORBIDDEN: "Нет доступа к изменению заявок этого города.", UNAUTHORIZED: "Войдите в систему повторно.", INVALID_STATUS: "Выбран недопустимый статус.", NOT_FOUND: "Заявка не найдена." };
        throw new Error(messages[payload.error] ?? "Не удалось сохранить статус.");
      }
      setRows((current) => current.map((row) => row.id === selected.id ? { ...row, status: payload.status } : row));
      setSelected((current) => current?.id === selected.id ? { ...current, status: payload.status } : current);
    } catch (cause) {
      setStatusError(cause instanceof Error ? cause.message : "Не удалось сохранить статус.");
    } finally {
      setStatusSaving(false);
    }
  }
  async function removeSelected() {
    if (!selected || admin?.user?.role !== "OWNER" || deleting) return;
    if (!window.confirm(`Удалить заявку ${selected.id}? Это действие нельзя отменить.`)) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/admin/requests/${encodeURIComponent(selected.id)}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrf() },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const messages: Record<string, string> = { FORBIDDEN: "Удалять заявки может только владелец системы.", UNAUTHORIZED: "Войдите в систему повторно.", CSRF_INVALID: "Защита запроса устарела. Обновите страницу.", NOT_FOUND: "Заявка уже удалена или не найдена." };
        throw new Error(messages[payload.error] ?? "Не удалось удалить заявку. Попробуйте ещё раз.");
      }
      const removedId = selected.id;
      setRows((current) => current.filter((row) => row.id !== removedId));
      setSelected(null);
      const url = new URL(window.location.href);
      url.searchParams.delete("request");
      window.history.replaceState(window.history.state, "", url);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Не удалось удалить заявку. Попробуйте ещё раз.");
    } finally {
      setDeleting(false);
    }
  }
  const money = (amount: number) => `${amount.toLocaleString("ru-RU")} ₽`;
  return <section className="admin-content admin-requests-page"><header className="admin-page-heading"><div><h1>Заявки</h1><p>Заявки клиентов и их текущий статус</p></div></header>
    <nav className="request-type-tabs" aria-label="Категории заявок">{([["cart","Корзина"],["trade_in","Trade-in"],["installment","Рассрочка"]] as const).map(([type,label])=><button key={type} type="button" className={requestType===type?"active":""} aria-pressed={requestType===type} onClick={()=>void changeType(type)}>{label}</button>)}</nav>
    {error ? <p role="alert" className="form-error">{error === "UNAUTHORIZED" ? "Войдите в систему, чтобы просматривать заявки." : "Не удалось загрузить заявки."}</p> : loading ? <p className="request-type-empty" role="status">Загружаем заявки…</p> : requestType!=="cart" ? (!tradeInRows.length ? <p className="request-type-empty">Заявок пока нет.</p> : <div className="admin-request-cards">{sortedTradeInRows.map((row)=><article className="panel admin-request-card" key={row.id}><header><div><strong>{row.id}</strong><span>{new Date(row.createdAt).toLocaleString("ru-RU")} · {row.city}</span></div><span className="request-status-badge" data-status={row.status}>{statusLabel(row.status)}</span></header><div><strong>{row.name}</strong><a href={`tel:${row.phone.replace(/\D/g,"")}`}>{row.phone}</a><span>{row.requestType === "trade_in" ? [row.deviceType,row.device,row.configuration].filter(Boolean).join(" · ") : row.desiredDevice || row.product || "Товар не указан"}</span></div><button className="admin-secondary" type="button" onClick={()=>setSelectedTradeIn(row)}>Открыть заявку</button></article>)}</div>) : !rows.length ? <p className="request-type-empty">Заявок пока нет.</p> : <div className="workspace-table panel admin-requests-table"><table className="table"><thead><tr><th><SortButton label="Номер" sortKey="number" sort={sort} onSort={toggleSort} /></th><th><SortButton label="Дата" sortKey="date" sort={sort} onSort={toggleSort} /></th><th><SortButton label="Город" sortKey="city" sort={sort} onSort={toggleSort} /></th><th><SortButton label="Клиент" sortKey="client" sort={sort} onSort={toggleSort} /></th><th>Товары</th><th>Сумма</th><th><SortButton label="Статус" sortKey="status" sort={sort} onSort={toggleSort} /></th><th>Действия</th></tr></thead><tbody>{sortedCartRows.map((row) => <tr key={row.id}><td>{row.id}</td><td>{new Date(row.createdAt).toLocaleString("ru-RU")}</td><td>{row.city}</td><td>{row.name}<br />{row.phone}</td><td>{row.items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}</td><td>{money(row.total)}</td><td><span className="request-status-badge" data-status={row.status}>{statusLabel(row.status)}</span></td><td><button className="admin-secondary" type="button" onClick={() => { setSelected(row); setStatusError(""); setDeleteError(""); }}>Открыть</button></td></tr>)}</tbody></table></div>}
    {selectedTradeIn&&<TradeInDetail row={selectedTradeIn} onClose={()=>setSelectedTradeIn(null)} onUpdated={(status)=>{setTradeInRows(current=>current.map(row=>row.id===selectedTradeIn.id?{...row,status}:row));setSelectedTradeIn(current=>current?{...current,status}:null);}}/>}
    {selected && <div className="request-detail-backdrop" role="presentation" onClick={() => setSelected(null)}><section className="request-detail-modal" role="dialog" aria-modal="true" aria-labelledby="request-detail-title" onClick={(event) => event.stopPropagation()}>
      <header className="request-detail-header"><div><span>Заявка</span><h2 id="request-detail-title">{selected.id}</h2><small>{new Date(selected.createdAt).toLocaleString("ru-RU")}</small></div><button type="button" onClick={() => setSelected(null)} aria-label="Закрыть">×</button></header>
      <div className="request-detail-body"><div className="request-detail-grid">
        <section className="request-detail-section"><h3>Клиент</h3><strong>{selected.name || "Имя не указано"}</strong><span>{selected.city}</span></section>
        <section className="request-detail-section"><h3>Контакты</h3><a href={`tel:${selected.phone.replace(/\D/g, "")}`}>{selected.phone}</a><span>Предпочитает: {selected.contactMethod === "phone" ? "Телефон" : selected.contactMethod === "telegram" ? "Telegram" : selected.contactMethod === "max" ? "MAX" : selected.contactMethod}</span></section>
        <section className="request-detail-section"><h3>Получение</h3><strong>{selected.fulfillment === "DELIVERY" ? "Доставка" : "Самовывоз"}</strong><span>{selected.address || "Адрес не указан"}</span></section>
        <section className="request-detail-section request-detail-products"><div className="request-detail-section-head"><h3>Товары</h3><span>{selected.items.length} {selected.items.length === 1 ? "позиция" : "позиций"}</span></div>
          {selected.items.map((item) => { const attributes=Object.values(item.variant?.attributes ?? {}).filter((value): value is string | number => typeof value === "string" || typeof value === "number").map(String); const variantDetails=Array.from(new Set([item.variant?.label, ...attributes].filter((value): value is string => Boolean(value)))); return <article className="request-detail-product" key={item.sku}><div><strong>{item.name}</strong><span>SKU {item.sku}</span><small>{variantDetails.join(" · ") || "Вариант"}</small></div><div className="request-detail-product-price"><span>{item.quantity} × {money(item.price)}</span><strong>{money(item.price * item.quantity)}</strong></div></article>; })}
        </section>
        <section className="request-detail-section request-detail-cost"><h3>Стоимость</h3><div><span>Итого по заявке</span><strong>{money(selected.total)}</strong></div></section>
        <section className="request-detail-section request-detail-status"><h3>Статус</h3><select className="request-status-badge" data-status={selected.status} aria-label="Изменить статус заявки" value={selected.status} disabled={statusSaving} onChange={(event) => void saveStatus(event.target.value)}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{statusSaving && <span>Сохраняем…</span>}{statusError && <p className="form-error" role="alert">{statusError}</p>}</section>
        <section className="request-detail-section request-detail-comment"><h3>Комментарий</h3><p>{selected.comment || "Комментарий не указан"}</p></section>
      </div></div>
      {admin?.user?.role === "OWNER" && <footer className="request-detail-footer">{deleteError && <p className="form-error" role="alert">{deleteError}</p>}<span>Удаление окончательно удалит заявку и связанные позиции.</span><button type="button" className="admin-danger" disabled={deleting || statusSaving} onClick={() => void removeSelected()}>{deleting ? "Удаление…" : "Удалить заявку"}</button></footer>}
    </section></div>}
  </section>;
}

function TradeInDetail({row,onClose,onUpdated}:{row:TradeInRow;onClose:()=>void;onUpdated:(status:string)=>void}) {
  const [status,setStatus]=useState(row.status);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function update(next: string) {
    setBusy(true);setError("");
    try {
      const response=await fetch(`/api/admin/trade-in/${encodeURIComponent(row.id)}`,{method:"PATCH",headers:{"content-type":"application/json","x-csrf-token":csrf()},body:JSON.stringify({status:next})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(body.error??"UPDATE_FAILED");
      setStatus(body.status);onUpdated(body.status);
    } catch { setError("Не удалось обновить статус заявки."); }
    finally { setBusy(false); }
  }
  const label = row.requestType === "installment" ? "Рассрочка" : "Trade-in";
 return <div className="request-detail-backdrop" role="presentation" onClick={onClose}><section className="request-detail-modal trade-in-admin-detail" role="dialog" aria-modal="true" aria-label={`Заявка ${row.id}`} onClick={event=>event.stopPropagation()}><header className="request-detail-header"><div><span>{label} · {row.id}</span><h2>{row.name}</h2><small>{new Date(row.createdAt).toLocaleString("ru-RU")} · {row.city}</small></div><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header><div className="request-detail-body"><div className="request-detail-grid"><section className="request-detail-section"><h3>Контакты</h3><a href={`tel:${row.phone.replace(/\D/g,"")}`}>{row.phone}</a></section>{row.requestType === "trade_in" && <section className="request-detail-section"><h3>Устройство</h3><strong>{[row.brand,row.deviceType,row.device,row.configuration,row.color].filter(Boolean).join(" · ")}</strong><span>{row.condition||"Состояние не указано"}</span>{row.batteryHealth!==null&&<span>Аккумулятор: {row.batteryHealth}%</span>}{row.equipment.length>0&&<span>Комплектация: {row.equipment.join(", ")}</span>}<small>Источник: {row.origin === "product" ? "Карточка товара" : "Страница Trade-in"}</small></section>}<section className="request-detail-section"><h3>Интересующий товар</h3><span>{row.desiredDevice||row.product||"Не выбран"}</span></section><section className="request-detail-section request-detail-comment"><h3>Комментарий</h3><p>{row.comment||"Комментарий не указан"}</p></section>{row.photoUrls.length > 0 && <section className="request-detail-section request-detail-comment"><h3>Фотографии</h3><div className="request-photo-grid">{row.photoUrls.map((url) => <a href={url} target="_blank" rel="noreferrer" key={url}><img src={url} alt="Фотография устройства" /></a>)}</div></section>}<section className="request-detail-section request-detail-status"><h3>Статус</h3><select value={status} disabled={busy} onChange={event=>void update(event.target.value)}><option value="NEW">Новая</option><option value="PROCESSING">В обработке</option><option value="CONTACTED">Связались</option><option value="COMPLETED">Завершена</option><option value="CANCELLED">Отменена</option></select>{error&&<p role="alert" className="form-error">{error}</p>}</section></div></div></section></div>;
}
