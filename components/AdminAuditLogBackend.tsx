"use client";

import { useEffect, useMemo, useState } from "react";

type Row = { id: string; createdAt: string; userId: string | null; actorName: string | null; actorRole: string | null; action: string; entityType: string | null; entityId: string | null; cityName: string | null; changes: unknown };
type Employee = { id: string; name: string | null; role: string };

function changeText(value: unknown) {
  if (!value || typeof value !== "object") return "";
  return Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    if (!item || typeof item !== "object") return `${key}: ${String(item)}`;
    const pair = item as { old?: unknown; new?: unknown };
    return `${key}: ${JSON.stringify(pair.old ?? null)} → ${JSON.stringify(pair.new ?? null)}`;
  }).join("; ");
}

export default function AdminAuditLogBackend() {
  const [rows, setRows] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ userId: "", action: "", entityType: "", entityId: "", from: "", to: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const query = useMemo(() => new URLSearchParams({ page: String(page), pageSize: "25", ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) }).toString(), [page, filters]);

  useEffect(() => {
    setLoading(true); setError("");
    fetch(`/api/admin/audit-logs?${query}`, { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить журнал.");
      setRows(payload.data); setEmployees(payload.employees); setTotal(payload.pagination.total); setTotalPages(payload.pagination.totalPages);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Не удалось загрузить журнал.")).finally(() => setLoading(false));
  }, [query]);

  const setFilter = (key: keyof typeof filters, value: string) => { setPage(1); setFilters((current) => ({ ...current, [key]: value })); };
  return <main className="admin-content admin-workspace">
    <header className="admin-page-heading"><div><h1>Журнал действий</h1><p>Успешно сохранённые изменения в административной панели</p></div></header>
    <div className="panel admin-filters">
      <label>Сотрудник<select value={filters.userId} onChange={(event) => setFilter("userId", event.target.value)}><option value="">Все сотрудники</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name || employee.id} · {employee.role}</option>)}</select></label>
      <label>Действие<input value={filters.action} onChange={(event) => setFilter("action", event.target.value)} placeholder="например inventory.updated" /></label>
      <label>Объект<input value={filters.entityType} onChange={(event) => setFilter("entityType", event.target.value)} placeholder="например product" /></label>
      <label>ID объекта<input value={filters.entityId} onChange={(event) => setFilter("entityId", event.target.value)} placeholder="необязательно" /></label>
      <label>От<input type="date" value={filters.from} onChange={(event) => setFilter("from", event.target.value)} /></label>
      <label>До<input type="date" value={filters.to} onChange={(event) => setFilter("to", event.target.value)} /></label>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <p>Загрузка журнала…</p> : rows.length === 0 ? <div className="panel"><p>Записей пока нет.</p></div> : <div className="workspace-table panel"><table className="table"><thead><tr><th>Дата</th><th>Сотрудник</th><th>Роль</th><th>Действие</th><th>Объект</th><th>Город</th><th>Изменения</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString("ru-RU")}</td><td>{row.actorName || row.userId || "Не указан"}</td><td>{row.actorRole || "Не указана"}</td><td><code>{row.action}</code></td><td>{[row.entityType, row.entityId].filter(Boolean).join(" · ") || "Не указан"}</td><td>{row.cityName || "Не указан"}</td><td>{changeText(row.changes) || "Нет данных"}</td></tr>)}</tbody></table></div>}
    <footer className="admin-pagination"><span>{total} записей</span><button className="admin-secondary" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Назад</button><span>Страница {page} из {totalPages}</span><button className="admin-secondary" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Вперёд</button></footer>
  </main>;
}
