"use client";

import { useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, UserRoundPlus } from "lucide-react";

type Role = "ADMIN" | "DEVELOPER" | "CITY_MANAGER";
type City = { id: string; slug: string; name: string };
type Employee = { id: string; name: string; email: string; role: Role; isActive: boolean; allCities: boolean; allCitiesCanManagePrices: boolean; allCitiesCanManageStock: boolean; cities: Array<City & { canManagePrices: boolean; canManageStock: boolean }> };
type Draft = { id?: string; name: string; email: string; role: Role; citySlugs: string[]; cities: Array<City & { canManagePrices: boolean; canManageStock: boolean }>; allCities: boolean; allCitiesCanManagePrices: boolean; allCitiesCanManageStock: boolean; active: boolean };

const roles: Role[] = ["ADMIN", "DEVELOPER", "CITY_MANAGER"];
const roleLabels: Record<Role, string> = { ADMIN: "Администратор", DEVELOPER: "Разработчик", CITY_MANAGER: "Менеджер города" };
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [temporaryCredential, setTemporaryCredential] = useState<{ email: string; password: string } | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<Employee | null>(null);

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
          ? { id: draft.id, name: draft.name, email: draft.email, role: draft.role, citySlugs: draft.citySlugs, cityGrants: draft.cities?.map((city) => ({ slug: city.slug, canManagePrices: city.canManagePrices, canManageStock: false })), allCities: false, allCitiesCanManagePrices: false, allCitiesCanManageStock: false, active: draft.active }
          : { name: draft.name, email: draft.email, role: draft.role, citySlugs: draft.citySlugs, cityGrants: draft.cities?.map((city) => ({ slug: city.slug, canManagePrices: city.canManagePrices, canManageStock: false })), allCities: false, allCitiesCanManagePrices: false, allCitiesCanManageStock: false, temporaryPassword: password }),
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

  function closeDraft() {
    if (busy) return;
    if (draft && !window.confirm("Закрыть форму без сохранения изменений?")) return;
    setDraft(null);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (passwordTarget) setPasswordTarget(null);
      else if (draft) closeDraft();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const visible = employees;
  const updateDraft = (value: Partial<Draft>) => setDraft((current) => current ? { ...current, ...value } : current);
  const cityNames = (employee: Employee) => employee.role === "CITY_MANAGER" && employee.allCities ? "Все города, включая будущие" : employee.cities.map((city) => city.name).join(", ") || (employee.role === "CITY_MANAGER" ? "Город не назначен" : "Все города");

  return <section className="admin-content employees-page">
    <header className="admin-page-heading employee-page-heading"><div><h1>Сотрудники</h1><p>Учётные записи и назначенные города</p></div><button className="admin-primary" type="button" onClick={() => { setError(""); setTemporaryCredential(null); setDraft({ name: "", email: "", role: "CITY_MANAGER", citySlugs: [], cities: [], allCities: false, allCitiesCanManagePrices: false, allCitiesCanManageStock: false, active: true }); }}><UserRoundPlus size={17} />Добавить сотрудника</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {temporaryCredential && <section className="panel employee-credential" aria-live="polite"><strong>Новый пароль для {temporaryCredential.email}</strong><p>Показывается только сейчас. Передайте его сотруднику защищённым способом.</p><code>{temporaryCredential.password}</code><div><button type="button" className="admin-secondary" onClick={() => void navigator.clipboard?.writeText(temporaryCredential.password)}>Копировать</button><button type="button" className="admin-secondary" onClick={() => setTemporaryCredential(null)}>Скрыть</button></div></section>}
    {visible.length ? <div className="workspace-table panel"><table className="table"><thead><tr><th>Сотрудник</th><th>Email</th><th>Роль</th><th>Города</th><th>Статус</th><th>Действия</th></tr></thead><tbody>
      {visible.map((employee) => <tr key={employee.id}><td>{employee.name || "Без имени"}</td><td>{employee.email}</td><td>{roleLabels[employee.role]}</td><td>{cityNames(employee)}</td><td>{employee.isActive ? "Активен" : "Заблокирован"}</td><td><button className="icon-action" type="button" title="Изменить сотрудника" aria-label="Изменить сотрудника" onClick={() => { setError(""); setTemporaryCredential(null); setDraft({ id: employee.id, name: employee.name, email: employee.email, role: employee.role, citySlugs: employee.cities.map((city) => city.slug), cities: employee.cities, allCities: employee.allCities, allCitiesCanManagePrices: employee.allCitiesCanManagePrices, allCitiesCanManageStock: employee.allCitiesCanManageStock, active: employee.isActive }); }}><Pencil size={16} /></button><button className="icon-action" type="button" title="Сменить пароль" aria-label="Сменить пароль" disabled={busy || !employee.isActive} onClick={() => setPasswordTarget(employee)}><KeyRound size={16} /></button></td></tr>)}
    </tbody></table></div> : <p>Сотрудники не найдены.</p>}
    {draft && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDraft(); }}><section className="modal employee-modal" role="dialog" aria-modal="true" aria-labelledby="employee-editor-title"><header><div><h2 id="employee-editor-title">{draft.id ? "Изменить сотрудника" : "Новый сотрудник"}</h2><p>Учетная запись и доступ к рабочим городам</p></div><button type="button" className="icon-action" aria-label="Закрыть" onClick={closeDraft}>×</button></header>
      <label className="admin-form-label">Имя<input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} required maxLength={160} /></label>
      <label className="admin-form-label">Email<input type="email" value={draft.email} onChange={(event) => updateDraft({ email: event.target.value })} required maxLength={320} /></label>
      <label className="admin-form-label">Роль<select value={draft.role} onChange={(event) => { const role = event.target.value as Role; updateDraft({ role, citySlugs: role === "CITY_MANAGER" ? draft.citySlugs.slice(0, 1) : [], cities: role === "CITY_MANAGER" ? draft.cities.slice(0, 1) : [], allCities: false, allCitiesCanManagePrices: false, allCitiesCanManageStock: false }); }}>{roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
      {draft.role === "CITY_MANAGER" && <>
        <label className="admin-form-label">Город<select value={draft.citySlugs[0] ?? ""} onChange={(event) => { const city = cities.find((item) => item.slug === event.target.value); if (!city) return; const previous = draft.cities.find((item) => item.slug === city.slug); updateDraft({ citySlugs: [city.slug], cities: [{ ...city, canManagePrices: previous?.canManagePrices ?? true, canManageStock: previous?.canManageStock ?? true }], allCities: false }); }}><option value="">Выберите город</option>{cities.map((city) => <option key={city.id} value={city.slug}>{city.name}</option>)}</select></label>
        <div className="employee-permissions"><span className="admin-form-label">Права доступа</span><label className="admin-check"><input type="checkbox" checked={draft.cities[0]?.canManagePrices ?? true} disabled={!draft.citySlugs.length} onChange={(event) => updateDraft({ cities: draft.cities.map((city, index) => index === 0 ? { ...city, canManagePrices: event.target.checked } : city) })} />Изменение цен</label></div>
      </>}
      <footer><button type="button" className="admin-secondary" onClick={closeDraft}>Отмена</button><button type="button" className="admin-primary" disabled={busy} onClick={save}><Plus size={16} />{busy ? "Сохранение…" : "Сохранить"}</button></footer>
    </section></div>}
    {passwordTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setPasswordTarget(null); }}><section className="modal employee-password-modal" role="dialog" aria-modal="true" aria-labelledby="password-title"><header><div><h2 id="password-title">Сменить пароль</h2><p>{passwordTarget.email}</p></div><button type="button" className="icon-action" aria-label="Закрыть" onClick={() => !busy && setPasswordTarget(null)}>×</button></header><div className="employee-password-body"><p>Новый пароль будет сгенерирован автоматически и показан один раз после сохранения.</p></div><footer><button type="button" className="admin-secondary" disabled={busy} onClick={() => setPasswordTarget(null)}>Отмена</button><button type="button" className="admin-primary" disabled={busy} onClick={() => { const employee = passwordTarget; setPasswordTarget(null); void resetPassword(employee); }}><KeyRound size={16} />{busy ? "Смена…" : "Сменить пароль"}</button></footer></section></div>}
  </section>;
}
