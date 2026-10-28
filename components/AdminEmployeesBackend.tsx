"use client";

import { useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, UserRoundPlus } from "lucide-react";

type Role = "OWNER" | "ADMIN" | "DEVELOPER" | "CITY_MANAGER";
type City = { id: string; slug: string; name: string };
type Employee = { id: string; name: string; email: string; role: Role; isActive: boolean; cities: Array<City & { canManagePrices: boolean; canManageStock: boolean }> };
type Draft = { id?: string; name: string; email: string; role: Role; citySlugs: string[]; active: boolean };

const roles: Role[] = ["OWNER", "ADMIN", "DEVELOPER", "CITY_MANAGER"];
const csrf = () => decodeURIComponent(document.cookie.split("; ").find((part) => part.trim().startsWith("icenter_csrf="))?.split("=")[1] ?? "");
function createTemporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = "";
  for (let index = 0; index < bytes.length; index++) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default function AdminEmployeesBackend() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [temporaryCredential, setTemporaryCredential] = useState<{ email: string; password: string } | null>(null);

  async function load() {
    const response = await fetch("/api/admin/employees", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить сотрудников.");
    setEmployees(payload.data);
    setCities(payload.cities);
  }
  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : "Ошибка загрузки.")); }, []);

  async function save() {
    if (!draft) return;
    setBusy(true); setError(""); setTemporaryCredential(null);
    try {
      const password = draft.id ? null : createTemporaryPassword();
      const response = await fetch("/api/admin/employees", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify(draft.id
          ? { id: draft.id, name: draft.name, email: draft.email, role: draft.role, citySlugs: draft.citySlugs, active: draft.active }
          : { name: draft.name, email: draft.email, role: draft.role, citySlugs: draft.citySlugs, temporaryPassword: password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Не удалось сохранить сотрудника.");
      if (password) setTemporaryCredential({ email: draft.email, password });
      setDraft(null);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить сотрудника."); }
    finally { setBusy(false); }
  }

  async function resetPassword(employee: Employee) {
    setBusy(true); setError(""); setTemporaryCredential(null);
    try {
      const password = createTemporaryPassword();
      const response = await fetch(`/api/admin/employees/${encodeURIComponent(employee.id)}/reset-password`, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify({ temporaryPassword: password }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Не удалось сбросить пароль.");
      setTemporaryCredential({ email: employee.email, password });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сбросить пароль."); }
    finally { setBusy(false); }
  }

  const visible = employees.filter((employee) => `${employee.name} ${employee.email} ${employee.role}`.toLowerCase().includes(query.trim().toLowerCase()));
  const updateDraft = (value: Partial<Draft>) => setDraft((current) => current ? { ...current, ...value } : current);
  const cityNames = (employee: Employee) => employee.cities.map((city) => city.name).join(", ") || (employee.role === "CITY_MANAGER" ? "Город не назначен" : "Все города");

  return <section className="admin-content">
    <header className="admin-page-heading"><div><h1>Сотрудники</h1><p>Учетные записи и назначенные города</p></div><button className="admin-primary" type="button" onClick={() => { setError(""); setTemporaryCredential(null); setDraft({ name: "", email: "", role: "CITY_MANAGER", citySlugs: [], active: true }); }}><UserRoundPlus size={17} />Добавить сотрудника</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {temporaryCredential && <section className="panel" aria-live="polite"><strong>Временный пароль для {temporaryCredential.email}</strong><p>Показывается только сейчас. Передайте его сотруднику защищённым способом.</p><code>{temporaryCredential.password}</code><button type="button" className="admin-secondary" onClick={() => setTemporaryCredential(null)}>Скрыть</button></section>}
    <label className="admin-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по имени, email или роли" /></label>
    {visible.length ? <div className="workspace-table panel"><table className="table"><thead><tr><th>Сотрудник</th><th>Email</th><th>Роль</th><th>Города</th><th>Статус</th><th>Действия</th></tr></thead><tbody>
      {visible.map((employee) => <tr key={employee.id}><td>{employee.name || "Без имени"}</td><td>{employee.email}</td><td>{employee.role}</td><td>{cityNames(employee)}</td><td>{employee.isActive ? "Активен" : "Заблокирован"}</td><td><button className="icon-action" type="button" title="Изменить сотрудника" aria-label="Изменить сотрудника" onClick={() => { setError(""); setTemporaryCredential(null); setDraft({ id: employee.id, name: employee.name, email: employee.email, role: employee.role, citySlugs: employee.cities.map((city) => city.slug), active: employee.isActive }); }}><Pencil size={16} /></button><button className="icon-action" type="button" title="Сбросить пароль" aria-label="Сбросить пароль" disabled={busy || !employee.isActive} onClick={() => resetPassword(employee)}><KeyRound size={16} /></button></td></tr>)}
    </tbody></table></div> : <p>Сотрудники не найдены.</p>}
    {draft && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDraft(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="employee-editor-title"><header><h2 id="employee-editor-title">{draft.id ? "Изменить сотрудника" : "Новый сотрудник"}</h2><button type="button" className="icon-action" aria-label="Закрыть" onClick={() => setDraft(null)}>×</button></header>
      <label className="admin-form-label">Имя<input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} required maxLength={160} /></label>
      <label className="admin-form-label">Email<input type="email" value={draft.email} onChange={(event) => updateDraft({ email: event.target.value })} required maxLength={320} /></label>
      <label className="admin-form-label">Роль<select value={draft.role} onChange={(event) => updateDraft({ role: event.target.value as Role, citySlugs: event.target.value === "CITY_MANAGER" ? draft.citySlugs : [] })}>{roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
      {draft.role === "CITY_MANAGER" && <fieldset className="admin-form-label"><legend>Разрешенные города</legend>{cities.map((city) => <label className="admin-check" key={city.id}><input type="checkbox" checked={draft.citySlugs.includes(city.slug)} onChange={(event) => updateDraft({ citySlugs: event.target.checked ? [...draft.citySlugs, city.slug] : draft.citySlugs.filter((slug) => slug !== city.slug) })} />{city.name}</label>)}</fieldset>}
      {draft.id && <label className="admin-check"><input type="checkbox" checked={draft.active} onChange={(event) => updateDraft({ active: event.target.checked })} />Активная учетная запись</label>}
      <footer><button type="button" className="admin-secondary" onClick={() => setDraft(null)}>Отмена</button><button type="button" className="admin-primary" disabled={busy} onClick={save}><Plus size={16} />{busy ? "Сохранение…" : "Сохранить"}</button></footer>
    </section></div>}
  </section>;
}
