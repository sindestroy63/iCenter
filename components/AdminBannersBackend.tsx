"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Image, Power, RefreshCw, Upload, X } from "lucide-react";

type Placement = "home" | "home_brand_apple" | "home_brand_samsung" | "home_brand_dyson" | "home_brand_playstation" | "product_trade_in";
type Banner = {
  id: string;
  placement: Placement;
  title: string;
  subtitle: string | null;
  linkUrl: string | null;
  linkText: string | null;
  imageMediaId: string | null;
  imageName: string | null;
  imageUrl: string | null;
  imageMimeType: string | null;
  sortOrder: number;
  isActive: boolean;
};
type Media = { id: string; filename: string; storagePath: string; mimeType: string; url: string };
type MediaKind = "image" | "video";
type Draft = Omit<Banner, "id" | "imageName" | "imageUrl" | "imageMimeType"> & { id: string | null; mediaKind: MediaKind };
type SlotConfig = { placement: Placement; label: string; size: string; aspect: "hero" | "brand" | "trade-in" };

const slots: SlotConfig[] = [
  { placement: "home", label: "Главный баннер", size: "2400 × 680 px", aspect: "hero" },
  { placement: "home_brand_apple", label: "Apple", size: "800 × 440 px", aspect: "brand" },
  { placement: "home_brand_samsung", label: "Samsung", size: "800 × 440 px", aspect: "brand" },
  { placement: "home_brand_dyson", label: "Dyson", size: "800 × 440 px", aspect: "brand" },
  { placement: "home_brand_playstation", label: "PlayStation", size: "800 × 440 px", aspect: "brand" },
  { placement: "product_trade_in", label: "Trade-in карточки товара", size: "1920 × 420 px", aspect: "trade-in" },
];
const brandTitles: Partial<Record<Placement, string>> = {
  home_brand_apple: "Apple",
  home_brand_samsung: "Samsung",
  home_brand_dyson: "Dyson",
  home_brand_playstation: "PlayStation",
};
const csrf = () => decodeURIComponent(document.cookie.split("; ").find((part) => part.startsWith("icenter_csrf="))?.split("=")[1] ?? "");
const tradeInTitle = "Trade-in — карточка товара";

function blank(sortOrder: number, placement: Placement): Draft {
  return {
    id: null,
    placement,
    title: placement === "product_trade_in" ? tradeInTitle : brandTitles[placement] ?? "Технологии, которые вдохновляют.",
    subtitle: placement === "home" ? "Apple, Samsung, Dyson и другие премиальные бренды в одном месте." : null,
    linkUrl: placement === "home" ? "/catalog" : null,
    linkText: placement === "home" ? "Перейти в каталог" : null,
    imageMediaId: null,
    mediaKind: "image",
    sortOrder,
    isActive: true,
  };
}

function mediaError(code: string | undefined) {
  if (code === "INVALID_IMAGE" || code === "INVALID_MEDIA") return "Выберите поддерживаемое изображение или видео из медиатеки.";
  if (code === "BANNER_FORMAT_NOT_SUPPORTED") return "Для баннеров поддерживаются WebP, JPEG, PNG, MP4 и WebM.";
  if (code === "UPLOAD_TOO_LARGE") return "Видео превышает допустимый размер.";
  if (code === "UNSUPPORTED_MEDIA") return "Файл не соответствует формату JPG, PNG, WebP, MP4 или WebM.";
  return code || "Не удалось выполнить операцию с баннером.";
}

export default function AdminBannersBackend() {
  const [items, setItems] = useState<Banner[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [bannerResponse, mediaResponse] = await Promise.all([
        fetch("/api/admin/banners", { cache: "no-store" }),
        fetch("/api/admin/media", { cache: "no-store" }),
      ]);
      const [bannerBody, mediaBody] = await Promise.all([bannerResponse.json(), mediaResponse.json()]);
      if (!bannerResponse.ok || !mediaResponse.ok) throw new Error("Не удалось загрузить баннеры или медиатеку.");
      setItems(Array.isArray(bannerBody.data) ? bannerBody.data : []);
      setMedia(Array.isArray(mediaBody.data) ? mediaBody.data.filter((entry: Media) => entry.mimeType.startsWith("image/") || entry.mimeType.startsWith("video/")) : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка загрузки.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const edit = (banner: Banner): Draft => ({
    id: banner.id,
    placement: banner.placement,
    title: banner.title,
    subtitle: banner.subtitle,
    linkUrl: banner.linkUrl,
    linkText: banner.linkText,
    imageMediaId: banner.imageMediaId,
    mediaKind: banner.imageMimeType?.startsWith("video/") ? "video" : "image",
    sortOrder: banner.sortOrder,
    isActive: banner.isActive,
  });

  const getSlotBanner = (placement: Placement) => {
    const matching = items.filter((item) => item.placement === placement);
    return matching.find((item) => item.isActive) ?? matching[0];
  };

  const openSlot = (placement: Placement) => {
    const existing = getSlotBanner(placement);
    setDraft(existing ? edit(existing) : blank(items.length * 10, placement));
  };

  const save = async (value: Draft) => {
    setBusy(true);
    setError("");
    try {
      const { id, mediaKind: _mediaKind, ...draftValue } = value;
      const brandTitle = brandTitles[value.placement];
      const payload = {
        ...draftValue,
        ...(id !== null ? { id } : {}),
        title: brandTitle ?? (value.placement === "product_trade_in" ? tradeInTitle : value.title),
        subtitle: value.placement === "product_trade_in" || brandTitle ? null : value.subtitle || null,
        linkUrl: value.placement === "product_trade_in" || brandTitle ? null : value.linkUrl || null,
        linkText: value.placement === "product_trade_in" ? "Открыть форму Trade-in" : brandTitle ? null : value.linkText || null,
      };
      const response = await fetch("/api/admin/banners", {
        method: id !== null ? "PATCH" : "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(mediaError(body.error));
      setDraft(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить баннер.");
    } finally {
      setBusy(false);
    }
  };

  const selectedMedia = useMemo(() => draft?.imageMediaId ? media.find((entry) => entry.id === draft.imageMediaId) : null, [draft?.imageMediaId, media]);
  const selectedSlot = draft ? slots.find((slot) => slot.placement === draft.placement) : null;
  const selectableMedia = media.filter((entry) => draft?.mediaKind === "video"
    ? ["video/mp4", "video/webm"].includes(entry.mimeType)
    : ["image/jpeg", "image/png", "image/webp"].includes(entry.mimeType));

  async function uploadForBanner(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    const input = event.currentTarget;
    if (!file || !draft) return;
    const video = draft.mediaKind === "video";
    const allowedTypes = new Set(video ? ["video/mp4", "video/webm"] : ["image/webp", "image/jpeg", "image/png"]);
    const extension = file.name.toLowerCase().split(".").pop();
    const allowedExtensions = video ? ["mp4", "webm"] : ["webp", "jpg", "jpeg", "png"];
    if (!allowedTypes.has(file.type) || !allowedExtensions.includes(extension ?? "")) {
      setError(video ? "Выберите видео MP4 или WebM." : "Выберите файл WebP, JPEG или PNG.");
      input.value = "";
      return;
    }
    const maxBytes = video ? 80 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size < 1 || file.size > maxBytes) {
      setError(video ? "Размер видео должен быть не больше 80 МБ (или лимита BANNER_VIDEO_MAX_MB на сервере)." : "Размер изображения должен быть не больше 10 МБ.");
      input.value = "";
      return;
    }
    setUploading(true);
    setError("");
    try {
      const token = csrf();
      if (!token) throw new Error("Сессия или CSRF-токен недоступны. Войдите повторно.");
      const form = new FormData();
      form.set("file", file);
      form.set("alt", `Баннер: ${selectedSlot?.label ?? "витрина"}`);
      form.set("purpose", "banner");
      const response = await fetch("/api/admin/media", { method: "POST", headers: { "x-csrf-token": token }, body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(mediaError(body.error));
      const uploaded = body.data as Media;
      setMedia((current) => [uploaded, ...current.filter((entry) => entry.id !== uploaded.id)]);
      setDraft((current) => current ? { ...current, imageMediaId: uploaded.id } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить медиафайл.");
    } finally {
      input.value = "";
      setUploading(false);
    }
  }

  return <main className="admin-content admin-banners-page">
    <header className="admin-page-heading">
      <div><h1>Баннеры</h1><p>Изображения главной страницы и карточки товара</p></div>
      <button className="admin-secondary" type="button" aria-label="Обновить список баннеров" onClick={() => void load()}><RefreshCw size={16} /><span>Обновить</span></button>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="admin-home-banner-slots">
      {slots.map((slot) => {
        const banner = getSlotBanner(slot.placement);
        return <section className="admin-home-banner-slot" key={slot.placement}>
          <div className={`admin-home-banner-slot-preview is-${slot.aspect}`}>
            {banner?.imageUrl && banner.imageMimeType?.startsWith("video/") ? <video src={banner.imageUrl} muted playsInline preload="metadata" aria-label={`Видео: ${slot.label}`} /> : banner?.imageUrl ? <img src={banner.imageUrl} alt={`Превью: ${slot.label}`} /> : <Image size={22} aria-hidden="true" />}
          </div>
          <div className="admin-home-banner-slot-details">
            <div><h2>{slot.label}</h2><span>{slot.size} · WebP, JPEG, PNG, MP4, WebM</span></div>
            <span className={`admin-banner-state ${banner?.isActive ? "is-active" : "is-disabled"}`}><i />{banner ? banner.isActive ? "Активен" : "Отключён" : "Не настроен"}</span>
          </div>
          <div className="admin-home-banner-slot-actions">
            <button className="admin-secondary" type="button" onClick={() => openSlot(slot.placement)}>{banner ? "Настроить" : "Добавить медиа"}</button>
            {banner && <button className={`icon-action ${banner.isActive ? "admin-banner-power-active" : ""}`} type="button" aria-label={banner.isActive ? `Отключить: ${slot.label}` : `Включить: ${slot.label}`} title={banner.isActive ? "Отключить" : "Включить"} disabled={busy} onClick={() => void save({ ...edit(banner), isActive: !banner.isActive })}><Power size={16} /></button>}
          </div>
        </section>;
      })}
    </div>
    {draft && <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy && !uploading) setDraft(null); }}>
      <section className="admin-modal dictionary-modal admin-banner-modal" role="dialog" aria-modal="true" aria-label={selectedSlot?.label ?? "Баннер"}>
        <header><div><h2>{draft.id ? "Настройка баннера" : "Новый баннер"}</h2><p>{selectedSlot?.label} · рекомендуемый размер {selectedSlot?.size}</p></div><button type="button" onClick={() => setDraft(null)} aria-label="Закрыть"><X size={18} /></button></header>
        <div className="admin-modal-body">
          {draft.placement === "home" ? <>
            <label className="admin-form-label">Заголовок<input value={draft.title} maxLength={160} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <label className="admin-form-label">Описание<input value={draft.subtitle ?? ""} maxLength={500} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })} /></label>
            <label className="admin-form-label">Текст ссылки<input value={draft.linkText ?? ""} maxLength={80} onChange={(event) => setDraft({ ...draft, linkText: event.target.value })} /></label>
            <label className="admin-form-label">Ссылка<input value={draft.linkUrl ?? ""} maxLength={500} onChange={(event) => setDraft({ ...draft, linkUrl: event.target.value })} /></label>
          </> : <p className="admin-banner-slot-note">Текст, оформление и ссылка задаются на сайте. Здесь настраивается только фоновое изображение.</p>}
          {draft.placement === "home" && <label className="admin-form-label">Порядок отображения<input type="number" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })} /></label>}
          <label className="admin-form-label">Тип медиа<select value={draft.mediaKind} onChange={(event) => setDraft({ ...draft, mediaKind: event.target.value as MediaKind, imageMediaId: null })}><option value="image">Изображение</option><option value="video">Видео</option></select><small>MP4/WebM загружаются отложенно и воспроизводятся только когда баннер виден.</small></label>
          <label className="admin-form-label">{draft.mediaKind === "video" ? "Видео" : "Изображение"}<select value={draft.imageMediaId ?? ""} onChange={(event) => setDraft({ ...draft, imageMediaId: event.target.value || null })}><option value="">Без медиафайла</option>{selectedMedia && !selectableMedia.includes(selectedMedia) && <option value={selectedMedia.id} disabled>Текущий формат не поддерживается, замените файл</option>}{selectableMedia.map((entry) => <option key={entry.id} value={entry.id}>{entry.filename}</option>)}</select><small>{draft.mediaKind === "video" ? "MP4 или WebM. До 80 МБ по умолчанию." : "WebP, JPEG или PNG. Максимум 10 МБ."}</small></label>
          <div className="admin-banner-upload-row"><label className="admin-secondary admin-banner-upload"><Upload size={15} />{uploading ? "Загрузка…" : "Загрузить с компьютера"}<input type="file" accept={draft.mediaKind === "video" ? ".mp4,.webm,video/mp4,video/webm" : ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"} disabled={uploading} onChange={(event) => void uploadForBanner(event)} /></label>{draft.imageMediaId && <button type="button" className="admin-secondary" onClick={() => setDraft({ ...draft, imageMediaId: null })} disabled={busy || uploading}>Удалить привязку</button>}</div>
          {selectedMedia?.url && <div className={`admin-banner-preview-large is-${selectedSlot?.aspect ?? "brand"}`}>{selectedMedia.mimeType.startsWith("video/") ? <video src={selectedMedia.url} controls muted playsInline preload="metadata">Ваш браузер не поддерживает видео.</video> : <img src={selectedMedia.url} alt={`Предпросмотр: ${selectedSlot?.label ?? "баннер"}`} />}</div>}
          <label className="admin-check"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />Показывать баннер</label>
        </div>
        <footer><button type="button" className="admin-secondary" disabled={busy || uploading} onClick={() => setDraft(null)}>Отмена</button><button type="button" className="admin-primary" disabled={busy || uploading || (draft.placement === "home" && !draft.title.trim())} onClick={() => void save(draft)}>{busy ? "Сохранение…" : draft.id ? "Сохранить изменения" : "Сохранить"}</button></footer>
      </section>
    </div>}
  </main>;
}
