"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Pencil, Plus, Power, RefreshCw } from "lucide-react";

type City = { id: string; name: string; slug: string; isActive: boolean; sortOrder: number; hasReferences: boolean };
type Draft = { id: string; name: string; slug: string; isActive: boolean };

const transliteration: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
const makeSlug = (value: string) => value.toLowerCase().replace(/[а-яё]/g, (letter) => transliteration[letter] ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const csrf = () => decodeURIComponent(document.cookie.split("; ").find((part) => part.trim().startsWith("icenter_csrf="))?.split("=")[1] ?? "");

export default function AdminCitiesBackend() {
  const [cities, setCities] = useState<City[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/admin/cities", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Не удалось загрузить города.");
      setCities(Array.isArray(body.data) ? body.data : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Не удалось загрузить города.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => cities.filter((city) => `${city.name} ${city.slug}`.toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU"))), [cities, query]);
  const create = () => { setFormError(""); setDraft({ id: "", name: "", slug: "", isActive: true }); };
  const edit = (city: City) => { setFormError(""); setDraft({ id: city.id, name: city.name, slug: city.slug, isActive: city.isActive }); };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setFormError("");
    try {
      const token = csrf();
      if (!token) throw new Error("CSRF-токен недоступен. Войдите повторно.");
      const response = await fetch("/api/admin/cities", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({ ...(draft.id ? { id: draft.id } : {}), name: draft.name.trim(), slug: draft.slug.trim(), isActive: draft.isActive }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errors: Record<string, string> = {
          DUPLICATE_CITY: "Город с таким названием или slug уже существует.",
          INVALID_CITY: "Проверьте название и slug: используйте латинские буквы, цифры и дефисы.",
        };
        throw new Error(errors[body.error] ?? body.error ?? "Не удалось сохранить город.");
      }
      setDraft(null);
      await load();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Не удалось сохранить город.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (city: City) => {
    setBusy(true);
    setLoadError("");
    try {
      const token = csrf();
      if (!token) throw new Error("CSRF-токен недоступен. Войдите повторно.");
      const response = await fetch("/api/admin/cities", { method: "PATCH", headers: { "content-type": "application/json", "x-csrf-token": token }, body: JSON.stringify({ id: city.id, isActive: !city.isActive }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (body.error === "CITY_IN_USE") throw new Error("Город связан с остатками, заявками, магазинами или доступами сотрудников и не может быть отключён.");
        throw new Error(body.error ?? "Не удалось изменить статус города.");
      }
      await load();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Не удалось изменить статус города.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="admin-content admin-workspace">
    <div className="workspace-head"><div><h1>Города</h1><p>Города и доступность в каталоге</p></div><button type="button" className="admin-primary" onClick={create}><Plus size={16} />Добавить город</button></div>
    <div className="workspace-toolbar"><label className="admin-field-search"><MapPin size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию или slug" /></label></div>
    {loadError ? <div className="panel" role="alert"><p>{loadError}</p><button type="button" className="admin-secondary" onClick={() => void load()}><RefreshCw size={15} />Повторить</button></div>
      : visible.length ? <div className="workspace-table panel"><table className="table"><thead><tr><th>Город</th><th>Slug</th><th>Статус</th><th /></tr></thead><tbody>{visible.map((city) => <tr key={city.id}>
        <td><strong>{city.name}</strong></td><td><code>{city.slug}</code></td><td>{city.isActive ? "Активен" : "Отключён"}</td>
        <td><span className="row-actions"><button type="button" className="icon-action" onClick={() => edit(city)} aria-label={`Изменить ${city.name}`} title="Изменить"><Pencil size={15} /></button><button type="button" className="icon-action" disabled={busy || city.isActive && city.hasReferences} onClick={() => void toggle(city)} aria-label={city.isActive ? `Отключить ${city.name}` : `Включить ${city.name}`} title={city.isActive && city.hasReferences ? "Есть связанные данные; отключение недоступно" : city.isActive ? "Отключить" : "Включить"}><Power size={15} /></button></span></td>
      </tr>)}</tbody></table></div> : <div className="panel">Города не найдены.</div>}
    {draft && <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDraft(null); }}><section className="admin-modal dictionary-modal" role="dialog" aria-modal="true" aria-labelledby="city-title">
      <header><h2 id="city-title">{draft.id ? "Редактирование города" : "Новый город"}</h2><button type="button" onClick={() => setDraft(null)} aria-label="Закрыть">×</button></header>
      <div className="admin-modal-body">
        <label className="admin-form-label">Название<input autoFocus maxLength={160} value={draft.name} onChange={(event) => setDraft((current) => current ? { ...current, name: event.target.value, ...(!current.id ? { slug: makeSlug(event.target.value) } : {}) } : current)} /></label>
        <label className="admin-form-label">Slug<input maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.slug} onChange={(event) => setDraft((current) => current ? { ...current, slug: event.target.value.toLowerCase() } : current)} /><small>Латинские буквы, цифры и дефисы</small></label>
        {draft.id && <label className="admin-check"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((current) => current ? { ...current, isActive: event.target.checked } : current)} />Активен</label>}
        {formError && <p className="form-error" role="alert">{formError}</p>}
      </div>
      <footer><button type="button" className="admin-secondary" disabled={busy} onClick={() => setDraft(null)}>Отмена</button><button type="button" className="admin-primary" disabled={busy} onClick={() => void save()}>{busy ? "Сохранение…" : "Сохранить"}</button></footer>
    </section></div>}
  </main>;
}
