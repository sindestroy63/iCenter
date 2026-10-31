"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Save, Upload, X } from "lucide-react";
import { CATALOG_MENU_ROOTS, type CatalogMenuBanner } from "@/lib/catalog-menu-banners";

type Media = { id: string; filename: string; url: string; mimeType: string };
const csrf = () => decodeURIComponent(document.cookie.split("; ").find((part) => part.startsWith("icenter_csrf="))?.split("=")[1] ?? "");
const empty = (): CatalogMenuBanner[] => CATALOG_MENU_ROOTS.map(({ key }) => ({ key, enabled: false, imageMediaId: null, alt: "", description: "" }));

export default function AdminCatalogMenuBanners() {
  const [items, setItems] = useState(empty);
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [configResponse, mediaResponse] = await Promise.all([fetch("/api/admin/catalog-menu-banners", { cache: "no-store" }), fetch("/api/admin/media", { cache: "no-store" })]);
      const config = await configResponse.json(); const library = await mediaResponse.json();
      if (!configResponse.ok || !mediaResponse.ok) throw new Error("Не удалось загрузить настройки меню или медиатеку.");
      const saved = new Map<string, CatalogMenuBanner>((config.banners ?? []).map((item: CatalogMenuBanner) => [item.key, item]));
      setItems(CATALOG_MENU_ROOTS.map(({ key }) => saved.get(key) ?? { key, enabled: false, imageMediaId: null, alt: "", description: "" }));
      setMedia((library.data ?? []).filter((item: Media) => ["image/jpeg", "image/png", "image/webp"].includes(item.mimeType)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка загрузки."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const patch = (key: string, value: Partial<CatalogMenuBanner>) => setItems((current) => current.map((item) => item.key === key ? { ...item, ...value } : item));
  async function upload(key: string, file?: File) {
    if (!file) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const form = new FormData(); form.set("file", file); form.set("purpose", "catalog-menu");
      const response = await fetch("/api/admin/media", { method: "POST", headers: { "x-csrf-token": csrf(), "x-upload-purpose": "catalog-menu" }, body: form });
      const result = await response.json();
      if (!response.ok || !["image/jpeg", "image/png", "image/webp"].includes(result.data?.mimeType)) throw new Error(result.error ?? "Поддерживаются JPG, PNG и WebP.");
      setMedia((current) => [result.data, ...current]);
      patch(key, { enabled: true, imageMediaId: result.data.id, alt: result.data.alt || "" });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить изображение."); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/catalog-menu-banners", { method: "PUT", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify({ banners: items }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось сохранить настройки.");
      setNotice("Настройки баннеров меню сохранены.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка сохранения."); }
    finally { setBusy(false); }
  }

  return <main className="admin-content admin-workspace"><header className="workspace-head"><div><h1>Баннеры mega-menu</h1><p>Изображения верхнего уровня каталога. Подразделы остаются компактным списком.</p></div><button className="admin-primary" disabled={busy || loading} onClick={() => void save()}><Save size={16} />Сохранить</button></header>
    <div className="workspace-toolbar"><button className="admin-secondary" disabled={busy || loading} onClick={() => void load()}><RefreshCw size={16} />Обновить</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="admin-note" role="status">{notice}</p>}
    {loading ? <div className="panel">Загрузка настроек…</div> : <div className="catalog-menu-banner-settings">{items.map((item) => {
      const root = CATALOG_MENU_ROOTS.find((entry) => entry.key === item.key)!; const image = media.find((entry) => entry.id === item.imageMediaId);
      return <section className="panel catalog-menu-banner-row" key={item.key}><div className="catalog-menu-banner-heading"><div><h2>{root.label}</h2><p>Баннер раздела верхнего уровня</p></div><label className="admin-check"><input type="checkbox" checked={item.enabled} onChange={(event) => patch(item.key, { enabled: event.target.checked })} />Показывать</label></div>
        <label className="admin-form-label">Изображение из медиатеки<select value={item.imageMediaId ?? ""} onChange={(event) => patch(item.key, { imageMediaId: event.target.value || null, enabled: Boolean(event.target.value) })}><option value="">Без баннера</option>{media.map((entry) => <option key={entry.id} value={entry.id}>{entry.filename}</option>)}</select></label>
        <div className="catalog-menu-banner-actions"><label className="admin-secondary"><Upload size={15} />Загрузить изображение<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { void upload(item.key, event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>{item.imageMediaId && <button type="button" className="admin-secondary" onClick={() => patch(item.key, { imageMediaId: null, enabled: false, alt: "" })}><X size={15} />Убрать</button>}</div>
        {image && <img className="catalog-menu-banner-preview" src={image.url} alt={item.alt || ""} />}
        <label className="admin-form-label">Короткое описание<input maxLength={240} value={item.description} onChange={(event) => patch(item.key, { description: event.target.value })} /></label>
        <label className="admin-form-label">Альтернативный текст<input maxLength={300} value={item.alt} onChange={(event) => patch(item.key, { alt: event.target.value })} /></label>
      </section>;
    })}</div>}</main>;
}
