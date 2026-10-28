"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";

type City = { cityId: string; name: string; slug?: string; address: string | null; phone: string | null; workingHours: string | null; timezone: string; socialLinks: unknown };
type GlobalSettings = { defaultCity: string };
type Payload = { scope: "global" | "city-readonly"; global?: GlobalSettings; cities?: City[]; city?: City | null };
const csrf = () => decodeURIComponent(document.cookie.split("; ").find((part) => part.trim().startsWith("icenter_csrf="))?.split("=")[1] ?? "");
type SocialFields = { telegram: string; vk: string; whatsapp: string };
const emptySocialFields = (): SocialFields => ({ telegram: "", vk: "", whatsapp: "" });
const socialKind = (value: string): keyof SocialFields | null => {
  const key = value.toLowerCase().replace(/[^a-zа-яё]/g, "");
  if (["telegram", "телеграм", "tg"].includes(key)) return "telegram";
  if (["vk", "vkontakte", "вконтакте"].includes(key)) return "vk";
  if (["whatsapp", "вотсап", "ватсап", "wa"].includes(key)) return "whatsapp";
  return null;
};
const socialUrl = (value: unknown) => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const item = value as { url?: unknown; href?: unknown };
    return typeof item.url === "string" ? item.url : typeof item.href === "string" ? item.href : "";
  }
  return "";
};
const readSocialFields = (links: unknown): SocialFields => {
  const result = emptySocialFields();
  if (links && typeof links === "object") {
    for (const [key, value] of Object.entries(links)) {
      const label = value && typeof value === "object" && "label" in value && typeof value.label === "string" ? value.label : key;
      const kind = socialKind(key) ?? socialKind(label);
      if (kind && !result[kind]) result[kind] = socialUrl(value);
    }
  }
  return result;
};
const mergeSocialFields = (links: unknown, fields: SocialFields) => {
  const labels: Record<keyof SocialFields, string> = { telegram: "Telegram", vk: "VK", whatsapp: "WhatsApp" };
  if (Array.isArray(links)) {
    const next = [...links];
    for (const kind of Object.keys(fields) as Array<keyof SocialFields>) {
      const index = next.findIndex((value) => value && typeof value === "object" && "label" in value && typeof value.label === "string" && socialKind(value.label) === kind);
      if (!fields[kind]) { if (index >= 0) next.splice(index, 1); continue; }
      if (index >= 0) {
        const oldValue = next[index] as Record<string, unknown>;
        next[index] = { ...oldValue, ...( "href" in oldValue && !("url" in oldValue) ? { href: fields[kind] } : { url: fields[kind] }) };
      } else next.push({ label: labels[kind], url: fields[kind] });
    }
    return next;
  }
  const entries = links && typeof links === "object" ? Object.entries(links) : [];
  const next: Record<string, unknown> = Object.fromEntries(entries);
  for (const kind of Object.keys(fields) as Array<keyof SocialFields>) {
    const existing = entries.find(([key, value]) => socialKind(key) === kind || (value && typeof value === "object" && "label" in value && typeof value.label === "string" && socialKind(value.label) === kind));
    const key = existing?.[0] ?? labels[kind];
    const oldValue = existing?.[1];
    if (!fields[kind]) { if (existing) delete next[key]; continue; }
    if (oldValue && typeof oldValue === "object") {
      const item = { ...(oldValue as Record<string, unknown>) };
      if ("href" in item && !("url" in item)) item.href = fields[kind]; else item.url = fields[kind];
      next[key] = item;
    } else next[key] = fields[kind];
  }
  return next;
};
const formatPhone = (value: string) => {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("7") || digits.startsWith("8")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (!digits) return "";
  const area = digits.slice(0, 3);
  const first = digits.slice(3, 6);
  const second = digits.slice(6, 8);
  const third = digits.slice(8, 10);
  return `+7 (${area}${area.length === 3 ? ")" : ""}${area.length === 3 && first ? ` ${first}` : first}${first.length === 3 && second ? `-${second}` : second}${second.length === 2 && third ? `-${third}` : third}`;
};
const normalizePhone = (value: string | null) => {
  if (!value) return value;
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && /^[78]/.test(digits)) ? formatPhone(value) : value;
};
const parseWorkingHours = (value: string | null) => {
  const match = value?.match(/^((?:[01]\d|2[0-3]):[0-5]\d)-((?:[01]\d|2[0-3]):[0-5]\d)$/);
  return match ? { start: match[1], end: match[2], invalid: false } : { start: "", end: "", invalid: Boolean(value?.trim()) };
};
const isValidSocialUrl = (value: string) => {
  if (!value.trim()) return true;
  try { const url = new URL(value.trim()); return ["https:", "http:"].includes(url.protocol) && Boolean(url.hostname); } catch { return false; }
};
const settingsError = (code: unknown, action: "load" | "save") => {
  const messages: Record<string, string> = {
    UNAUTHORIZED: "Сессия завершена. Войдите в админку снова.",
    PASSWORD_CHANGE_REQUIRED: "Сначала смените пароль, чтобы продолжить.",
    FORBIDDEN: "У вашей роли нет доступа к этому действию.",
    CSRF_INVALID: "Сессия защиты формы устарела. Обновите страницу и попробуйте снова.",
    INVALID_SETTINGS: "Проверьте поля настроек: часть значений некорректна.",
    DUPLICATE_SETTING: "Найдены повторяющиеся глобальные настройки. Обратитесь к администратору.",
    NOT_FOUND: "Выбранный город больше недоступен. Обновите страницу.",
    SETTINGS_LOAD_FAILED: "Не удалось загрузить настройки. Подробности записаны в серверный журнал.",
    SETTINGS_SAVE_FAILED: "Не удалось сохранить настройки. Подробности записаны в серверный журнал.",
    SETTINGS_FAILED: "Не удалось выполнить запрос настроек. Подробности записаны в серверный журнал.",
  };
  if (typeof code === "string" && code.startsWith("CSRF token")) return messages.CSRF_INVALID;
  return typeof code === "string" && messages[code] ? messages[code] : action === "load" ? "Не удалось загрузить настройки. Проверьте соединение и повторите попытку." : "Не удалось сохранить настройки. Проверьте соединение и повторите попытку.";
};

export default function AdminSettingsBackend() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [global, setGlobal] = useState<GlobalSettings>({ defaultCity: "" });
  const [cities, setCities] = useState<City[]>([]);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<City | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [socialFields, setSocialFields] = useState<SocialFields>(emptySocialFields);
  const [hours, setHours] = useState({ cityId: "", start: "", end: "", invalid: false, changed: false });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/settings", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Не удалось загрузить настройки.");
      setPayload(body);
      if (body.scope === "global") {
        setGlobal(body.global);
        setCities((body.cities ?? []).map((city: City) => ({ ...city, phone: normalizePhone(city.phone) })));
        setSelected((current) => body.cities?.some((city: City) => city.cityId === current) ? current : body.cities?.[0]?.cityId ?? "");
      } else setDraft(body.city ? { ...body.city, phone: normalizePhone(body.city.phone) } : null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить настройки."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (payload?.scope === "global") setDraft(cities.find((city) => city.cityId === selected) ?? null); }, [cities, payload?.scope, selected]);
  useEffect(() => {
    if (!draft) return;
    const parsed = parseWorkingHours(draft.workingHours);
    setHours({ cityId: draft.cityId, ...parsed, changed: false });
    setSocialFields(readSocialFields(draft.socialLinks));
    setFieldError("");
  }, [draft?.cityId, draft?.workingHours, draft?.socialLinks]);

  const save = async (kind: "global" | "city") => {
    if (!draft && kind === "city") return;
    if (kind === "city" && draft) {
      const phoneDigits = (draft.phone ?? "").replace(/\D/g, "");
      if (phoneDigits && !/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(draft.phone ?? "")) { setFieldError("Укажите полный номер телефона в формате +7 (999) 999-99-99."); return; }
      if (Boolean(hours.start) !== Boolean(hours.end)) { setFieldError("Укажите время начала и окончания рабочего дня."); return; }
      if (!Object.values(socialFields).every(isValidSocialUrl)) { setFieldError("Проверьте ссылки: используйте полный адрес с http:// или https://."); return; }
    }
    setFieldError("");
    setBusy(true); setError(""); setNotice("");
    try {
      const token = csrf();
      if (!token) throw new Error("CSRF token недоступен. Войдите повторно.");
      const cityBody = draft && { cityId: draft.cityId, address: draft.address, phone: draft.phone, workingHours: hours.changed ? (hours.start && hours.end ? `${hours.start}-${hours.end}` : null) : draft.workingHours, timezone: draft.timezone, socialLinks: mergeSocialFields(draft.socialLinks, socialFields) };
      const response = await fetch("/api/admin/settings", { method: kind === "global" ? "PUT" : "PATCH", headers: { "content-type": "application/json", "x-csrf-token": token }, body: JSON.stringify(kind === "global" ? global : cityBody) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Не удалось сохранить настройки.");
      setNotice("Настройки сохранены.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить настройки."); }
    finally { setBusy(false); }
  };
  const updateCity = (field: keyof City, value: unknown) => setDraft((current) => current ? { ...current, [field]: value } : current);
  const readOnly = payload?.scope === "city-readonly";

  return <main className="admin-content admin-workspace admin-settings-page">
    <div className="workspace-head"><div><h1>Настройки</h1><p>Параметры магазина и контакты городов</p></div></div>
    {error && <div className="form-error" role="alert">{settingsError(error, "load")}</div>}{fieldError && <div className="form-error" role="alert">{fieldError}</div>}{notice && <p role="status">Настройки сохранены.</p>}
    {loading ? <div className="panel">Загрузка настроек…</div> : !payload ? <div className="panel"><button type="button" className="admin-secondary" onClick={() => void load()}><RefreshCw size={15} />Повторить</button></div> : <>
      {payload.scope === "global" && <section className="panel admin-form-section"><h2>Глобальные настройки</h2>
        <label className="admin-form-label">Город по умолчанию<select value={global.defaultCity} onChange={(event) => setGlobal({ ...global, defaultCity: event.target.value })}><option value="">Не задан</option>{cities.map((city) => <option key={city.cityId} value={city.slug}>{city.name}</option>)}</select></label>
        <button type="button" className="admin-primary" disabled={busy} onClick={() => void save("global")}><Save size={16} />Сохранить</button>
      </section>}
      <section className="panel admin-form-section"><h2>{readOnly ? `Контакты города${draft ? ` · ${draft.name}` : ""}` : "Настройки города"}</h2>
        {!readOnly && <label className="admin-form-label">Город<select value={selected} onChange={(event) => setSelected(event.target.value)}>{cities.map((city) => <option key={city.cityId} value={city.cityId}>{city.name}</option>)}</select></label>}
        {draft ? <>
          <label className="admin-form-label">Адрес<input maxLength={500} value={draft.address ?? ""} disabled={readOnly} onChange={(event) => updateCity("address", event.target.value || null)} /></label>
          <label className="admin-form-label">Телефон<input type="tel" inputMode="tel" placeholder="+7 (999) 999-99-99" maxLength={18} value={draft.phone ?? ""} disabled={readOnly} onChange={(event) => { updateCity("phone", formatPhone(event.target.value) || null); setFieldError(""); }} /></label>
          <div className="admin-form-label">Часы работы<div className="admin-settings-time-row"><label>С<input type="time" value={hours.cityId === draft.cityId ? hours.start : ""} disabled={readOnly} onChange={(event) => setHours((current) => ({ ...current, cityId: draft.cityId, start: event.target.value, changed: true }))} /></label><label>До<input type="time" value={hours.cityId === draft.cityId ? hours.end : ""} disabled={readOnly} onChange={(event) => setHours((current) => ({ ...current, cityId: draft.cityId, end: event.target.value, changed: true }))} /></label></div>{hours.cityId === draft.cityId && hours.invalid && !hours.changed && <small role="status">Старое значение часов некорректно. Заполните поля и сохраните, чтобы заменить его.</small>}</div>
          <label className="admin-form-label">Часовой пояс<input required maxLength={100} value={draft.timezone} disabled={readOnly} onChange={(event) => updateCity("timezone", event.target.value)} /></label>
          <label className="admin-form-label">Telegram<input type="url" placeholder="https://t.me/..." value={socialFields.telegram} disabled={readOnly} onChange={(event) => setSocialFields((current) => ({ ...current, telegram: event.target.value }))} /></label>
          <label className="admin-form-label">VK<input type="url" placeholder="https://vk.com/..." value={socialFields.vk} disabled={readOnly} onChange={(event) => setSocialFields((current) => ({ ...current, vk: event.target.value }))} /></label>
          <label className="admin-form-label">WhatsApp<input type="url" placeholder="https://wa.me/..." value={socialFields.whatsapp} disabled={readOnly} onChange={(event) => setSocialFields((current) => ({ ...current, whatsapp: event.target.value }))} /></label>
          {!readOnly && <button type="button" className="admin-primary" disabled={busy || !selected} onClick={() => void save("city")}><Save size={16} />Сохранить город</button>}
        </> : <p>{readOnly ? "Для аккаунта не назначен единственный город." : "Нет доступных городов."}</p>}
      </section>
    </>}
  </main>;
}
