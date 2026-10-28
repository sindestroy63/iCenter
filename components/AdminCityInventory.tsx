"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  productId: string;
  productName: string;
  variantId: string;
  sku: string;
  label: string;
  inventoryId: string;
  cityId: string;
  cityName: string;
  price: number | null;
  stock: number | null;
  availability: string;
  canManagePrices: boolean;
  canManageStock: boolean;
};

const states = ["UNSPECIFIED", "IN_STOCK", "PREORDER", "OUT_OF_STOCK"];

function csrf() {
  return decodeURIComponent(document.cookie.split("; ").find((part) => part.trim().startsWith("icenter_csrf="))?.split("=")[1] ?? "");
}

export default function AdminCityInventory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Partial<Pick<Row, "price" | "stock">>>>({});

  async function load() {
    const response = await fetch("/api/admin/city-inventory", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить цены и остатки.");
    setRows(payload.data);
  }

  useEffect(() => {
    load().catch((cause) => setError(cause instanceof Error ? cause.message : "Не удалось загрузить данные."));
  }, []);

  const filtered = useMemo(
    () => rows.filter((row) => `${row.productName} ${row.sku} ${row.cityName}`.toLowerCase().includes(query.toLowerCase())),
    [rows, query],
  );

  async function save(row: Row, patch: Partial<Pick<Row, "price" | "stock" | "availability">>) {
    const key = `${row.variantId}:${row.cityId}`;
    setBusy(key);
    setError("");
    try {
      const response = await fetch("/api/admin/city-inventory", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ variantId: row.variantId, cityId: row.cityId, ...patch }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Изменение не сохранено.");
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Изменение не сохранено.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="admin-content">
      <header className="admin-page-heading">
        <div><h1>Цены и остатки</h1><p>Доступны только товары разрешённых городов.</p></div>
      </header>
      <label className="admin-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск товара, SKU или города" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="workspace-table panel">
        <table className="table">
          <thead><tr><th>Товар / SKU</th><th>Город</th><th>Цена</th><th>Остаток</th><th>Доступность</th><th>Состояние</th></tr></thead>
          <tbody>
            {filtered.map((row) => {
              const key = `${row.variantId}:${row.cityId}`;
              return <tr key={key}>
                <td>{row.productName}<br /><small>{row.sku}{row.label ? ` · ${row.label}` : ""}</small></td>
                <td>{row.cityName}</td>
                <td><input aria-label={`Цена ${row.sku} ${row.cityName}`} type="number" min="0" step="0.01" value={drafts[key]?.price === undefined ? row.price ?? "" : drafts[key].price ?? ""} disabled={!row.canManagePrices || busy === key} onChange={(event) => { const value = event.currentTarget.value.trim() === "" ? null : Number(event.currentTarget.value); setDrafts((current) => ({ ...current, [key]: { ...current[key], price: value } })); }} onBlur={() => { const value = drafts[key]?.price; if (value !== undefined && value !== row.price) void save(row, { price: value }); }} /></td>
                <td><input aria-label={`Остаток ${row.sku} ${row.cityName}`} type="number" min="0" step="1" value={drafts[key]?.stock === undefined ? row.stock ?? "" : drafts[key].stock ?? ""} disabled={!row.canManageStock || busy === key} onChange={(event) => { const value = event.currentTarget.value.trim() === "" ? null : Number(event.currentTarget.value); setDrafts((current) => ({ ...current, [key]: { ...current[key], stock: value } })); }} onBlur={() => { const value = drafts[key]?.stock; if (value !== undefined && value !== row.stock) void save(row, { stock: value }); }} /></td>
                <td><select aria-label={`Доступность ${row.sku} ${row.cityName}`} value={row.availability} disabled={!row.canManageStock || busy === key} onChange={(event) => void save(row, { availability: event.target.value })}>{states.map((state) => <option key={state} value={state}>{state}</option>)}</select></td>
                <td>{busy === key ? "Сохранение…" : ""}</td>
              </tr>;
            })}
            {!filtered.length && <tr><td colSpan={6}>Нет доступных позиций.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
