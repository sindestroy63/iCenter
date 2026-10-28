"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";

function safeAdminNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/admin";
  try {
    const target = new URL(value, window.location.origin);
    if (
      target.origin !== window.location.origin ||
      !(target.pathname === "/admin" || target.pathname.startsWith("/admin/")) ||
      target.pathname === "/admin/login"
    ) return "/admin";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/admin";
  }
}

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось войти");
      router.replace(safeAdminNext(searchParams.get("next")));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <div className={styles.brand}>iCenter</div>
        <div className={styles.heading}>
          <h1>Панель управления</h1>
        </div>

        <div className={styles.fields}>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        </div>

        {error && (
          <p role="alert" aria-live="polite" className={styles.error}>
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Проверяем…" : "Войти"}
        </button>
      </form>
    </main>
  );
}
