"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

function csrfToken() {
  const value = document.cookie.split("; ").find((part) => part.trim().startsWith("icenter_csrf="))?.split("=")[1];
  return value ? decodeURIComponent(value) : "";
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (newPassword.length < 14) { setError("Новый пароль должен содержать не менее 14 символов."); return; }
    if (newPassword !== confirmation) { setError("Пароли не совпадают."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error === "INVALID_CURRENT_PASSWORD" ? "Текущий пароль неверен." : "Не удалось изменить пароль.");
      router.replace("/admin");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось изменить пароль.");
    } finally { setBusy(false); }
  }

  return <main className="admin-login"><form className="admin-login-card" onSubmit={submit}>
    <div className="admin-login-brand">iCenter 2.0</div>
    <h1>Смена пароля</h1>
    <p>Для продолжения задайте новый пароль длиной не менее 14 символов.</p>
    <label>Текущий пароль<input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
    <label>Новый пароль<input type="password" autoComplete="new-password" minLength={14} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
    <label>Повторите новый пароль<input type="password" autoComplete="new-password" minLength={14} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
    {error && <p role="alert" className="admin-login-error">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? "Сохранение…" : "Изменить пароль"}</button>
  </form></main>;
}
