"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Check, Plus, RefreshCw, Tags } from "lucide-react";

type Section = "categories" | "brands";
type Entry = {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId?: string | null;
  parentName?: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
};
type Payload = { data: Entry[] };
type Draft = { id: string; name: string; slug: string; description: string; parentId: string; sortOrder: number; isActive: boolean };

const transliteration: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
const makeSlug = (value: string) => value.toLowerCase().replace(/[а-яё]/g, (letter) => transliteration[letter] ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const csrf = () => decodeURIComponent(document.cookie.split("; ").find((part) => part.trim().startsWith("icenter_csrf="))?.split("=")[1] ?? "");

export default function AdminTaxonomyBackend({ type }: { type: Section }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch(`/api/admin/taxonomy?type=${type}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Не удалось загрузить список.");
      setPayload(body as Payload);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Не удалось загрузить список.");
    }
  }, [type]);
  useEffect(() => { void load(); }, [load]);

  const entries = payload?.data ?? [];
  const visible = useMemo(() => entries.filter((entry) => `${entry.name} ${entry.slug} ${entry.parentName ?? ""}`.toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU"))), [entries, query]);
  const title = type === "categories" ? "Категории" : "Бренды";
  const startCreate = () => {
    setFormError("");
    setDraft({ id: "", name: "", slug: "", description: "", parentId: "", sortOrder: entries.length * 10, isActive: true });
  };
  const startEdit = (entry: Entry) => {
    setFormError("");
    setDraft({ id: entry.id, name: entry.name, slug: entry.slug, description: entry.description ?? "", parentId: entry.parentId ?? "", sortOrder: entry.sortOrder, isActive: entry.isActive });
  };
  const save = async () => {
    if (!draft) return;
    setFormError("");
    setBusy(true);
    try {
      const csrfToken = csrf();
      if (!csrfToken) throw new Error("CSRF-токен недоступен. Войдите повторно.");
      const body = {
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name.trim(),
        slug: draft.slug.trim(),
        description: draft.description.trim(),
        sortOrder: Number(draft.sortOrder),
        isActive: draft.isActive,
        ...(type === "categories" ? { parentId: draft.parentId || null } : {}),
      };
      if (!body.name || !body.slug) throw new Error("Заполните название и slug.");
      const response = await fetch(`/api/admin/taxonomy?type=${type}`, {
        method: draft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errors: Record<string, string> = {
          DUPLICATE_VALUE: "Название или slug уже используются.",
          INVALID_PARENT: "Выберите существующую активную родительскую категорию.",
          CATEGORY_PARENT_CYCLE: "Категория не может быть родителем самой себя или своего предка.",
        };
        throw new Error(errors[result.error] ?? result.error ?? "Не удалось сохранить запись.");
      }
      setDraft(null);
      await load();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Не удалось сохранить запись.");
    } finally {
      setBusy(false);
    }
  };
  const toggleActive = async (entry: Entry) => {
    setBusy(true);
    setLoadError("");
    try {
      const csrfToken = csrf();
      if (!csrfToken) throw new Error("CSRF-токен недоступен. Войдите повторно.");
      const response = await fetch(`/api/admin/taxonomy?type=${type}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ id: entry.id, isActive: !entry.isActive }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Не удалось изменить статус.");
      await load();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Не удалось изменить статус.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="admin-content admin-workspace">
    <div className="workspace-head"><div><h1>{title}</h1><p>Справочник каталога PostgreSQL</p></div><button type="button" className="admin-primary" onClick={startCreate}><Plus size={16} />Добавить {type === "categories" ? "категорию" : "бренд"}</button></div>
    <div className="workspace-toolbar"><label className="admin-field-search"><Tags size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию или slug" /></label></div>
    {loadError ? <div className="panel" role="alert"><p>{loadError}</p><button type="button" className="admin-secondary" onClick={() => void load()}><RefreshCw size={15} />Повторить</button></div>
      : !payload ? <div className="panel">Загрузка…</div>
        : visible.length ? <div className="workspace-table panel"><table className="table"><thead><tr><th>Название</th><th>Slug</th>{type === "categories" && <th>Родительская категория</th>}<th>Товары</th><th>Статус</th><th /></tr></thead><tbody>
          {visible.map((entry) => <tr key={entry.id}>
            <td><strong>{entry.name}</strong>{entry.description && <small>{entry.description}</small>}</td>
            <td><code>{entry.slug}</code></td>
            {type === "categories" && <td>{entry.parentName ?? "—"}</td>}
            <td>{entry.productCount}</td><td>{entry.isActive ? "Активна" : "Отключена"}</td>
            <td><span className="row-actions"><button type="button" className="icon-action" onClick={() => startEdit(entry)} aria-label={`Изменить ${entry.name}`} title="Изменить"><Check size={15} /></button><button type="button" className="icon-action" disabled={busy} onClick={() => void toggleActive(entry)} aria-label={entry.isActive ? `Отключить ${entry.name}` : `Включить ${entry.name}`} title={entry.isActive ? "Отключить" : "Включить"}><Archive size={15} /></button></span></td>
          </tr>)}
        </tbody></table></div> : <div className="panel">Записей не найдено.</div>}
    {draft && <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDraft(null); }}><section className="admin-modal dictionary-modal" role="dialog" aria-modal="true" aria-labelledby="taxonomy-title">
      <header><h2 id="taxonomy-title">{draft.id ? "Редактирование" : "Новая запись"}: {type === "categories" ? "категория" : "бренд"}</h2><button type="button" onClick={() => setDraft(null)} aria-label="Закрыть">×</button></header>
      <div className="admin-modal-body">
        <label className="admin-form-label">Название<input autoFocus maxLength={160} value={draft.name} onChange={(event) => setDraft((current) => current ? { ...current, name: event.target.value, ...(!current.id ? { slug: makeSlug(event.target.value) } : {}) } : current)} /></label>
        <label className="admin-form-label">Slug<input maxLength={120} value={draft.slug} onChange={(event) => setDraft((current) => current ? { ...current, slug: makeSlug(event.target.value) } : current)} /><small>Латинские буквы, цифры и дефисы</small></label>
        <label className="admin-form-label">Описание<textarea maxLength={2000} rows={3} value={draft.description} onChange={(event) => setDraft((current) => current ? { ...current, description: event.target.value } : current)} /></label>
        <label className="admin-form-label">Порядок<input type="number" min={-100000} max={100000} step={1} value={draft.sortOrder} onChange={(event) => setDraft((current) => current ? { ...current, sortOrder: Number(event.target.value) } : current)} /></label>
        {type === "categories" &&
          <label className="admin-form-label">Родительская категория<select value={draft.parentId} onChange={(event) => setDraft((current) => current ? { ...current, parentId: event.target.value } : current)}><option value="">Без родителя</option>{entries.filter((entry) => entry.id !== draft.id && entry.isActive).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
        }
        <label className="admin-check"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((current) => current ? { ...current, isActive: event.target.checked } : current)} />Активна</label>
        {formError && <p className="form-error" role="alert">{formError}</p>}
      </div>
      <footer><button type="button" className="admin-secondary" disabled={busy} onClick={() => setDraft(null)}>Отмена</button><button type="button" className="admin-primary" disabled={busy} onClick={() => void save()}>{busy ? "Сохранение…" : "Сохранить"}</button></footer>
    </section></div>}
  </main>;
}
