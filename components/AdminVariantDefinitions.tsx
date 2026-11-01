"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

type ProductType = { id: string; name: string };
type Definition = { id: string; code: string; name: string; scope: string; isActive: boolean; isManaged: boolean; productTypeIds: string[] };
type Option = { id: string; canonicalKey: string; label: string; isActive: boolean };

const csrf = () => decodeURIComponent(document.cookie.split("; ").find((item) => item.startsWith("icenter_csrf="))?.split("=")[1] ?? "");
const keyPart = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "value";

export default function AdminVariantDefinitions() {
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [types, setTypes] = useState<ProductType[]>([]);
  const [selected, setSelected] = useState<Definition | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [active, setActive] = useState(true);
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [optionLabel, setOptionLabel] = useState("");
  const [optionKey, setOptionKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const response = await fetch("/api/admin/dictionaries", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Не удалось загрузить типы характеристик.");
    setDefinitions((result.definitions ?? []).filter((item: Definition) => item.isManaged && item.scope === "VARIANT"));
    setTypes((result.legacyTypes ?? []).map((item: ProductType) => ({ id: item.id, name: item.name })));
  };

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Не удалось загрузить типы характеристик.")); }, []);

  const loadOptions = async (definition: Definition) => {
    const response = await fetch(`/api/admin/dictionaries?code=${encodeURIComponent(definition.code)}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Не удалось загрузить значения.");
    setOptions(result.data ?? []);
  };

  const edit = async (definition: Definition) => {
    setSelected(definition); setName(definition.name); setCode(definition.code); setActive(definition.isActive); setTypeIds(definition.productTypeIds ?? []); setMessage(""); setError("");
    try { await loadOptions(definition); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить значения."); }
  };

  const saveDefinition = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = selected
        ? await fetch("/api/admin/dictionaries", { method: "PATCH", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify({ kind: "definition", id: selected.id, name: name.trim(), isActive: active, productTypeIds: typeIds }) })
        : await fetch("/api/admin/dictionaries", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify({ kind: "definition", code: code.trim(), name: name.trim(), scope: "VARIANT", valueKind: "OPTION", isActive: active, productTypeIds: typeIds }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Не удалось сохранить тип характеристики.");
      await load(); setMessage("Тип характеристики сохранён.");
      if (!selected) { setName(""); setCode(""); setTypeIds([]); setActive(true); }
      else {
        const refreshed = definitions.find((item) => item.id === selected.id);
        if (refreshed) await edit({ ...refreshed, name: name.trim(), isActive: active, productTypeIds: Array.from(new Set([...(refreshed.productTypeIds ?? []), ...typeIds])) });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить тип характеристики."); }
    finally { setBusy(false); }
  };

  const addOption = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/dictionaries?code=${encodeURIComponent(selected.code)}`, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify({ canonicalKey: optionKey.trim() || `${selected.code}:${keyPart(optionLabel)}`, label: optionLabel.trim(), aliases: [], isActive: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Не удалось добавить значение.");
      setOptionLabel(""); setOptionKey(""); await loadOptions(selected); setMessage("Значение добавлено.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось добавить значение."); }
    finally { setBusy(false); }
  };

  const updateOption = async (option: Option, isActive: boolean) => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/dictionaries", { method: "PATCH", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify({ code: selected.code, id: option.id, isActive }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Не удалось изменить значение.");
      await loadOptions(selected);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить значение."); }
    finally { setBusy(false); }
  };

  const removeOption = async (option: Option) => {
    if (!selected || !window.confirm(`Удалить значение «${option.label}»?`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/dictionaries?code=${encodeURIComponent(selected.code)}&id=${encodeURIComponent(option.id)}`, { method: "DELETE", headers: { "x-csrf-token": csrf() } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error === "USED_VALUE" ? "Значение уже используется и не может быть удалено." : result.error || "Не удалось удалить значение.");
      await loadOptions(selected);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось удалить значение."); }
    finally { setBusy(false); }
  };

  const openNew = () => { setSelected(null); setOptions([]); setName(""); setCode(""); setActive(true); setTypeIds([]); setMessage(""); setError(""); };

  return <section className="dictionary-content admin-variant-definitions">
    <div className="dictionary-toolbar"><div><h2>Дополнительные характеристики вариантов</h2><p>Типы и значения хранятся в общем справочнике характеристик.</p></div><button type="button" className="admin-primary" onClick={openNew}><Plus size={15} />Новый тип</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="dictionary-message" role="status">{message}</p>}
    <div className="admin-variant-definitions-layout">
      <div className="workspace-table panel dictionary-table"><table className="table"><thead><tr><th>Название</th><th>Code</th><th>Статус</th><th /></tr></thead><tbody>{definitions.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td><code>{item.code}</code></td><td>{item.isActive ? "Активен" : "Архив"}</td><td><button type="button" className="admin-secondary" onClick={() => void edit(item)}>Настроить</button></td></tr>)}</tbody></table>{!definitions.length && <p className="dictionary-empty">Дополнительные типы характеристик не созданы.</p>}</div>
      <div className="admin-variant-definition-editor">
        <h3>{selected ? `Настройка: ${selected.name}` : "Новый тип характеристики"}</h3>
        <label>Название<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Уникальный code<input value={code} disabled={Boolean(selected)} onChange={(event) => setCode(event.target.value.toLowerCase())} placeholder="Например: warranty_period" /></label>
        <label className="admin-check"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Тип активен</label>
        <fieldset><legend>Применимость к типам товаров</legend>{types.map((type) => <label key={type.id} className="admin-check"><input type="checkbox" checked={typeIds.includes(type.id)} disabled={Boolean((selected?.productTypeIds ?? []).includes(type.id))} onChange={(event) => setTypeIds((current) => event.target.checked ? [...current, type.id] : current.filter((id) => id !== type.id))} />{type.name}{(selected?.productTypeIds ?? []).includes(type.id) ? " (связь сохраняется)" : ""}</label>)}</fieldset>
        {selected && <><h4>Значения</h4><div className="admin-variant-definition-add-value"><label>Название<input value={optionLabel} onChange={(event) => { setOptionLabel(event.target.value); if (!optionKey) setOptionKey(`${selected.code}:${keyPart(event.target.value)}`); }} /></label><label>Ключ<input value={optionKey} onChange={(event) => setOptionKey(event.target.value.toLowerCase())} placeholder={`${selected.code}:value`} /></label><button type="button" className="admin-secondary" disabled={busy || !optionLabel.trim() || !optionKey.trim()} onClick={() => void addOption()}><Plus size={14} />Добавить значение</button></div><div className="admin-variant-definition-values">{options.map((option) => <div key={option.id}><span><strong>{option.label}</strong><small><code>{option.canonicalKey}</code></small></span><label className="admin-check"><input type="checkbox" checked={option.isActive} disabled={busy} onChange={(event) => void updateOption(option, event.target.checked)} />Активно</label><button type="button" className="admin-icon-button" aria-label={`Удалить ${option.label}`} disabled={busy} onClick={() => void removeOption(option)}><Trash2 size={14} /></button></div>)}{!options.length && <p>Значения пока не добавлены.</p>}</div></>}
        <button type="button" className="admin-primary" disabled={busy || !name.trim() || !selected && !/^[a-z][a-z0-9_]*$/.test(code) || !typeIds.length} onClick={() => void saveDefinition()}>{busy ? "Сохранение…" : "Сохранить тип"}</button>
        {selected && <p className="dictionary-note">Применимость можно расширять. Существующие связи и использованные определения не удаляются.</p>}
      </div>
    </div>
  </section>;
}
