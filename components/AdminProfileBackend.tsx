"use client";

import { useContext, useEffect, useState } from "react";
import { AdminUserContext } from "@/components/AdminShell";

type Profile = { firstName: string | null; lastName: string | null; legacyName: string | null; email: string; role: string; cities: { id: string; name: string }[]; avatarMediaId: string | null; avatarUrl: string | null };
const roleNames: Record<string, string> = { OWNER: "Владелец", ADMIN: "Администратор", DEVELOPER: "Разработчик", CITY_MANAGER: "Менеджер города" };
const csrfToken = () => decodeURIComponent(document.cookie.split("; ").find((part) => part.startsWith("icenter_csrf="))?.split("=")[1] ?? "");

export default function AdminProfileBackend() {
  const userContext = useContext(AdminUserContext);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/profile", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить профиль.");
      if (!active) return;
      setProfile(payload.data);
      setFirstName(payload.data.firstName ?? "");
      setLastName(payload.data.lastName ?? "");
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Не удалось загрузить профиль."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!file) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function save() {
    if (!profile || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    const form = new FormData();
    form.set("firstName", firstName.trim());
    form.set("lastName", lastName.trim());
    if (file) form.set("avatar", file);
    if (removeAvatar) form.set("removeAvatar", "true");
    try {
      const response = await fetch("/api/admin/profile", { method: "PATCH", headers: { "x-csrf-token": csrfToken() }, body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const messages: Record<string, string> = { AVATAR_TOO_LARGE: "Размер изображения не должен превышать 5 МБ.", INVALID_AVATAR: "Выберите изображение JPG, PNG или WebP.", FORBIDDEN: "Недостаточно прав для сохранения профиля.", UNAUTHORIZED: "Войдите в систему повторно." };
        throw new Error(messages[payload.error] ?? "Не удалось сохранить профиль.");
      }
      const updated = { ...profile, ...payload.data };
      setProfile(updated);
      setFirstName(updated.firstName ?? "");
      setLastName(updated.lastName ?? "");
      setFile(null);
      setRemoveAvatar(false);
      userContext?.setUser((current) => current ? { ...current, firstName: updated.firstName, lastName: updated.lastName, avatarMediaId: updated.avatarMediaId, avatarUrl: updated.avatarUrl } : current);
      setNotice("Профиль сохранён.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить профиль.");
    } finally {
      setSaving(false);
    }
  }

  const visibleAvatar = previewUrl || (removeAvatar ? "" : profile?.avatarUrl ?? "");
  const fallbackName = !profile?.firstName && !profile?.lastName ? profile?.legacyName : null;
  const avatarLabel = profile?.firstName?.[0] || profile?.legacyName?.[0] || profile?.email?.[0] || "С";

  return <section className="admin-content admin-profile-page">
    <header className="admin-page-heading"><div><h1>Мой профиль</h1><p>Личные данные сотрудника</p></div></header>
    {error && !profile ? <p className="form-error" role="alert">{error}</p> : !profile ? <p>Загрузка профиля…</p> : <div className="admin-profile-grid">
      <section className="panel admin-profile-card">
        <div className="admin-profile-avatar">{visibleAvatar ? <img src={visibleAvatar} alt="Аватар профиля" /> : <span>{avatarLabel.toUpperCase()}</span>}</div>
        <label className="admin-form-label">Аватар<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setError(""); setFile(event.target.files?.[0] ?? null); setRemoveAvatar(false); }} /></label>
        <small>JPG, PNG или WebP, до 5 МБ.</small>
        {(profile.avatarMediaId || file) && <button type="button" className="admin-secondary" disabled={saving} onClick={() => { setFile(null); setRemoveAvatar(true); }}>Удалить аватар</button>}
      </section>
      <section className="panel admin-profile-card">
        {fallbackName && <p className="admin-profile-legacy">Текущее имя: <strong>{fallbackName}</strong></p>}
        <label className="admin-form-label">Имя<input maxLength={100} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label>
        <label className="admin-form-label">Фамилия<input maxLength={100} value={lastName} onChange={(event) => setLastName(event.target.value)} /></label>
        <label className="admin-form-label">Логин / email<input value={profile.email} readOnly /></label>
        <label className="admin-form-label">Роль<input value={roleNames[profile.role] ?? profile.role} readOnly /></label>
        <div className="admin-form-label">Назначенные города<div className="admin-profile-cities">{profile.cities.length ? profile.cities.map((city) => <span key={city.id}>{city.name}</span>) : <span>Не назначены</span>}</div></div>
        {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="admin-profile-notice" role="status">{notice}</p>}
        <button type="button" className="admin-primary" disabled={saving} onClick={() => void save()}>{saving ? "Сохранение…" : "Сохранить изменения"}</button>
      </section>
    </div>}
  </section>;
}
