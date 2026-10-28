"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ExternalLink, ImageOff, RefreshCw, Search, Trash2, Upload } from "lucide-react";

type MediaItem = {
  id: string;
  filename: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  alt: string | null;
  uploadedAt: string;
  used: boolean;
  url: string;
};

const csrf = () => decodeURIComponent(document.cookie.split("; ").find((part) => part.startsWith("icenter_csrf="))?.split("=")[1] ?? "");

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function mediaError(code: string | undefined) {
  if (code === "MEDIA_IN_USE") return "Изображение используется на сайте. Сначала удалите ссылки на него из товаров, баннеров или других материалов.";
  if (code === "MEDIA_NOT_FOUND") return "Файл уже удалён или недоступен.";
  return code || "Не удалось выполнить операцию с файлом.";
}

export default function AdminMediaBackend() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/media", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось загрузить медиатеку.");
      setItems(Array.isArray(result.data) ? result.data : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить медиатеку.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru-RU");
    return items.filter((item) => item.filename.toLocaleLowerCase("ru-RU").includes(normalized));
  }, [items, query]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const input = event.currentTarget;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const token = csrf();
      if (!token) throw new Error("Сессия или CSRF-токен недоступны. Войдите повторно.");
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/media", { method: "POST", headers: { "x-csrf-token": token }, body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Не удалось загрузить файл (${response.status}).`);
      const uploaded = result.data as MediaItem;
      setItems((current) => [uploaded, ...current.filter((item) => item.id !== uploaded.id)]);
      setMessage("Изображение загружено.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить изображение.");
    } finally {
      input.value = "";
      setUploading(false);
    }
  }

  async function remove(item: MediaItem) {
    if (item.used) {
      setError(mediaError("MEDIA_IN_USE"));
      return;
    }
    if (!window.confirm(`Удалить файл «${item.filename}»?`)) return;
    setDeleting(item.id);
    setError("");
    setMessage("");
    try {
      const token = csrf();
      if (!token) throw new Error("Сессия или CSRF-токен недоступны. Войдите повторно.");
      const response = await fetch(`/api/admin/media/${encodeURIComponent(item.id)}`, { method: "DELETE", headers: { "x-csrf-token": token } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(mediaError(result.error));
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setMessage("Файл удалён.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось удалить файл.");
    } finally {
      setDeleting(null);
    }
  }

  return <main className="admin-content admin-workspace">
    <header className="workspace-head">
      <div><h1>Медиа</h1><p>Изображения товаров, вариантов и баннеров</p></div>
      <label className={`admin-primary upload-control${uploading ? " disabled" : ""}`}>
        <Upload size={16} />{uploading ? "Загрузка…" : "Загрузить изображение"}
        <input type="file" accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif" disabled={uploading} onChange={(event) => void upload(event)} />
      </label>
    </header>

    <div className="workspace-toolbar">
      <label className="admin-field-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по имени файла" /></label>
      <button type="button" className="admin-secondary" onClick={() => void load()} disabled={loading || uploading || deleting !== null} aria-label="Обновить медиатеку" title="Обновить"><RefreshCw size={16} />Обновить</button>
    </div>

    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="admin-note" role="status">{message}</p>}
    {loading ? <div className="panel" role="status">Загрузка медиатеки…</div>
      : visible.length ? <div className="media-grid">
        {visible.map((item) => <article className="media-card panel" key={item.id}>
          <div>
            {item.mimeType.startsWith("image/")
              ? <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`Открыть оригинал: ${item.filename}`}><img src={item.url} alt={item.alt || item.filename} loading="lazy" /></a>
              : <ImageOff size={28} aria-label="Предпросмотр недоступен" />}
          </div>
          <strong title={item.filename}>{item.filename}</strong>
          <span>{formatSize(item.fileSize)} · {item.mimeType.replace("image/", "").toUpperCase()}</span>
          {item.used && <span className="admin-media-used">Используется на сайте; удаление недоступно.</span>}
          <footer className="admin-media-actions">
            <a className="admin-secondary" href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />Оригинал</a>
            <button type="button" className="icon-action danger" onClick={() => void remove(item)} disabled={item.used || deleting !== null} title={item.used ? "Изображение используется на сайте" : "Удалить файл"} aria-label={`Удалить ${item.filename}`}>
              <Trash2 size={16} />{deleting === item.id ? "Удаление…" : "Удалить"}
            </button>
          </footer>
        </article>)}
      </div>
      : <div className="admin-empty"><ImageOff size={28} /><h2>{query ? "Файлы не найдены" : "Медиатека пуста"}</h2><p>{query ? "Измените поисковый запрос." : "Загрузите изображение, чтобы использовать его в каталоге или баннерах."}</p></div>}
  </main>;
}
