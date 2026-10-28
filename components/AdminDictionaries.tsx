"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { DICTIONARY_REGISTRY, type DictionaryCode } from "@/lib/product-dictionaries";
import { catalogColorHex, catalogColorNames } from "@/lib/catalog-colors";
import ColorName from "@/components/ColorName";

type Entry = { id: string; dictionary: DictionaryCode; canonicalKey: string; label: string; name?: string; nameEn?: string; nameRu?: string | null; aliases: string[]; sortOrder: number; isActive: boolean; brandId?: string | null; globalProductTypeId?: string | null; brandIds?: string[]; hex?: string | null };
type ApiData = { data: Entry[]; globalTypes?: Entry[]; legacyTypes: Array<{ id: string; name: string; brandId: string }>; brands?: Array<{ id: string; name: string }>; role: string; canWrite: boolean; registry: typeof DICTIONARY_REGISTRY };
const labels: Record<DictionaryCode, string> = { brand: "Бренд", productType: "Тип товара", productModel: "Модель", color: "Цвет", memory: "Память", ram: "Оперативная память (RAM)", sim: "SIM", connectivity: "Подключение", size: "Размер", material: "Материал", chip: "Процессор / чип", region: "Регион / версия", condition: "Состояние", bundle: "Комплектация", productLine: "Линейка товара" };
const keyPart = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "value";
const csrf = () => decodeURIComponent(document.cookie.split("; ").find((item) => item.startsWith("icenter_csrf="))?.split("=")[1] ?? "");

export default function AdminDictionaries({ initialCode = "brand" }: { initialCode?: DictionaryCode }) {
  const [code, setCode] = useState<DictionaryCode>(initialCode);
  const [payload, setPayload] = useState<ApiData | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [aliases, setAliases] = useState("");
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [modelBrandId, setModelBrandId] = useState("");
  const [modelTypeId, setModelTypeId] = useState("");
  const [modelActive, setModelActive] = useState(true);
  const [colorNameRu, setColorNameRu] = useState("");
  const [hex, setHex] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (selected = code) => {
    setError("");
    try {
      const response = await fetch(`/api/admin/dictionaries?code=${encodeURIComponent(selected)}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 503 ? "Справочники ещё не доступны: требуется применить подготовленную SQL-миграцию к базе." : result.error || "Не удалось загрузить справочники.");
      setPayload(result);
      setEntries(result.data ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить справочники."); }
  };
  useEffect(() => { void load(code); }, [code]);

  const selectedDefinition = DICTIONARY_REGISTRY.find((item) => item.code === code)!;
  const normalizedHex = hex.trim().toUpperCase();
  const validHex = /^#[0-9A-F]{6}$/.test(normalizedHex);
  const hexInvalid = code === "color" && normalizedHex.length > 0 && !validHex;
  const visible = useMemo(() => entries.filter((item) => `${item.label} ${item.nameRu ?? ""} ${item.canonicalKey} ${item.aliases.join(" ")}`.toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU"))), [entries, query]);
  const openEditor = (entry?: Entry) => {
    const current = entry ?? { id: "", dictionary: code, canonicalKey: "", label: "", aliases: [], sortOrder: entries.length * 10, isActive: true };
    setEditing(current);
    setLabel(current?.nameEn ?? current?.label ?? "");
    setKey(current?.canonicalKey ?? `${code === "productType" ? "product_type" : code}:${keyPart("")}`);
    setAliases(current?.aliases.join(", ") ?? "");
    setBrandIds(current?.brandIds ?? []);
    setModelBrandId(current?.brandId ?? "");
    setModelTypeId(current?.globalProductTypeId ?? "");
    setModelActive(current?.isActive !== false);
    setColorNameRu(current.nameRu ?? catalogColorNames({ name: current.nameEn ?? current.label, slug: current.canonicalKey.replace(/^color:/, "") }).secondary ?? "");
    setHex(current.hex ?? "");
    setMessage("");
  };
  const save = async () => {
    if (!payload?.canWrite || !editing) return;
    if (hexInvalid) { setMessage("Укажите HEX в формате #RRGGBB."); return; }
    setBusy(true); setMessage("");
    try {
      const data = { ...(editing.id ? { id: editing.id } : {}), canonicalKey: key, label: label.trim(), aliases: aliases.split(",").map((item) => item.trim()).filter(Boolean), sortOrder: editing.sortOrder ?? entries.length * 10, isActive: code === "productModel" ? modelActive : true, ...(code === "productModel" ? { brandId: modelBrandId, globalProductTypeId: modelTypeId } : {}), ...(code === "productType" ? { brandIds } : {}), ...(code === "color" ? { nameRu: colorNameRu.trim() || null, hex: validHex ? normalizedHex : null } : {}) };
      const response = editing.id
        ? await fetch("/api/admin/dictionaries", { method: "PATCH", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify({ code, id: editing.id, label: data.label, sortOrder: data.sortOrder, isActive: data.isActive, ...(code === "color" ? { nameRu: colorNameRu.trim() || null, hex: validHex ? normalizedHex : null } : {}), ...(code === "productModel" ? { brandId: modelBrandId, globalProductTypeId: modelTypeId } : {}), ...(code === "productType" ? { brandIds } : {}) }) })
        : await fetch(`/api/admin/dictionaries?code=${encodeURIComponent(code)}`, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify(data) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error === "DICTIONARY_MIGRATION_REQUIRED" ? "Для сохранения русских названий требуется применить подготовленную миграцию справочника цветов." : result.error === "USED_VALUE" ? "Значение используется связанными данными и не может быть изменено." : result.error || "Не удалось сохранить значение.");
      setEditing(null); await load(code); setMessage("Изменения сохранены.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось сохранить значение."); }
    finally { setBusy(false); }
  };
  const removeEntry = async (entry: Entry) => {
    if (!payload?.canWrite || !window.confirm(`Удалить «${entry.label}»? Это действие нельзя отменить.`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/dictionaries?code=${encodeURIComponent(code)}&id=${encodeURIComponent(entry.id)}`, { method: "DELETE", headers: { "x-csrf-token": csrf() } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error === "USED_VALUE" ? "Значение используется товарами, вариантами или другими связанными данными и не может быть удалено." : result.error || "Не удалось удалить значение.");
      await load(code); setMessage("Значение удалено.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось удалить значение."); }
    finally { setBusy(false); }
  };

  const brandName = (id?: string | null) => payload?.brands?.find((brand) => brand.id === id)?.name ?? "";
  const typeName = (id?: string | null) => payload?.globalTypes?.find((type) => type.id === id)?.label ?? payload?.globalTypes?.find((type) => type.id === id)?.name ?? "";
  const modelTypeOptions = payload?.globalTypes?.filter((type) => !modelBrandId || !type.brandIds || type.brandIds.includes(modelBrandId)) ?? [];
  return <main className="admin-content admin-workspace admin-dictionaries">
    <div className="workspace-head dictionary-page-head"><div className="dictionary-heading-copy"><span>Управление каталогом</span><h1>Справочники</h1><p>Единые значения для товаров, вариантов и характеристик</p></div>{payload?.canWrite && <button className="admin-primary" onClick={() => openEditor()}><Plus size={16} />Добавить значение</button>}</div>
    <div className="dictionary-layout">
      <aside className="dictionary-nav" aria-label="Справочники">{DICTIONARY_REGISTRY.map((item) => <button key={item.code} className={code === item.code ? "active" : ""} onClick={() => { setCode(item.code); setQuery(""); setEditing(null); }}>{labels[item.code]}</button>)}</aside>
      <section className="dictionary-content">
        <div className="dictionary-toolbar"><div><h2>{labels[code]}</h2><p>{visible.length} из {entries.length} значений</p></div><label className="admin-field-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию или ключу" /></label></div>
        {error ? <div className="empty-state"><p>{error}</p><button className="admin-secondary" onClick={() => void load(code)}>Повторить</button></div> : <div className="workspace-table panel dictionary-table"><table className="table"><thead><tr><th>Название</th>{code === "productModel" && <><th>Бренд</th><th>Тип товара</th></>}<th>Статус</th><th /></tr></thead><tbody>{visible.map((entry) => { const colorHex=code === "color" ? catalogColorHex({ name:entry.nameEn ?? entry.label,hex:entry.hex }) : null; return <tr key={entry.id}><td><span className="dictionary-entry-name">{code === "color" && <i className={colorHex ? "dictionary-color-swatch" : "dictionary-color-swatch neutral-color"} style={colorHex ? { background:colorHex } : undefined} aria-hidden="true" />}<span>{code === "color" ? <ColorName color={{ name:entry.nameEn ?? entry.label,nameRu:entry.nameRu }} /> : <strong>{entry.label}</strong>}{code === "color" && <small>{entry.hex || colorHex || "HEX не указан"}</small>}{entry.aliases.length > 0 && <small>Алиасы: {entry.aliases.join(", ")}</small>}</span></span></td>{code === "productModel" && <><td>{brandName(entry.brandId)}</td><td>{typeName(entry.globalProductTypeId)}</td></>}<td><span className={entry.isActive ? "dictionary-status active" : "dictionary-status"}>{entry.isActive ? "Активно" : "Архив"}</span></td><td>{payload?.canWrite && <span className="row-actions"><button className="icon-action" onClick={() => openEditor(entry)} aria-label="Изменить" title="Изменить"><Pencil size={15} /></button><button className="icon-action danger" onClick={() => void removeEntry(entry)} disabled={busy} aria-label="Удалить" title="Удалить"><Trash2 size={15} /></button></span>}</td></tr>; })}</tbody></table>{visible.length === 0 && <p className="dictionary-empty">В этом справочнике пока нет записей.</p>}</div>}
        {code === "productType" && payload?.legacyTypes?.length ? <p className="dictionary-note">Legacy-типы ({payload.legacyTypes.length}) доступны для товара и не изменяются; глобальные типы связываются с ними mapping-таблицей.</p> : null}
        {message && <p className="dictionary-message" role="status">{message}</p>}
      </section>
    </div>
    {editing !== null && <div className="admin-modal-backdrop"><section className="admin-modal dictionary-modal">
      <header><h2>{editing.id ? "Изменить значение" : "Новое значение"}</h2><button onClick={() => setEditing(null)} aria-label="Закрыть"><X size={18} /></button></header>
      <div className="admin-modal-body">
        <label className="admin-form-label">{code === "color" ? "Название на английском" : "Название"}<input value={label} onChange={(event) => { const next = event.target.value; setLabel(next); if (!editing.id) setKey(`${code === "productType" ? "product_type" : code}:${keyPart(next)}`); }} /></label>
        {code === "color" && <label className="admin-form-label">Название на русском<input value={colorNameRu} onChange={(event) => setColorNameRu(event.target.value)} placeholder="Необязательно" /></label>}
        {code !== "productModel" && code !== "productType" && code !== "brand" && code !== "color" && <label className="admin-form-label">Алиасы, через запятую<input value={aliases} onChange={(event) => setAliases(event.target.value)} /></label>}
        {code === "productModel" && <><label className="admin-form-label">Бренд<select value={modelBrandId} onChange={(event) => { setModelBrandId(event.target.value); setModelTypeId(""); }}><option value="">Выберите бренд</option>{payload?.brands?.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label><label className="admin-form-label">Тип товара<select value={modelTypeId} onChange={(event) => setModelTypeId(event.target.value)}><option value="">Выберите тип</option>{modelTypeOptions.map((type) => <option key={type.id} value={type.id}>{type.label ?? type.name}</option>)}</select></label></>}
        {code === "productType" && <label className="admin-form-label">Доступные бренды<select multiple value={brandIds} onChange={(event) => setBrandIds(Array.from(event.target.selectedOptions, (option) => option.value))}>{(payload as any)?.brands?.map((brand: any) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>}
        {code === "color" && <div className="dictionary-color-editor"><label className="admin-form-label">Цвет HEX<div className="dictionary-hex-row"><input className={hexInvalid ? "invalid" : ""} value={hex} onChange={(event) => setHex(event.target.value)} onBlur={() => validHex && setHex(normalizedHex)} placeholder="#000000" inputMode="text" aria-invalid={hexInvalid} /><label className="dictionary-color-picker" title="Выбрать цвет"><input type="color" value={validHex ? normalizedHex : "#000000"} onChange={(event) => setHex(event.target.value.toUpperCase())} /><span style={{ backgroundColor: validHex ? normalizedHex : "#000000" }} /></label></div>{hexInvalid && <small className="admin-field-error">Формат: #RRGGBB</small>}</label><div className="dictionary-color-preview"><span style={{ backgroundColor: validHex ? normalizedHex : "transparent" }} /><div><strong>{label.trim() || "Предпросмотр цвета"}</strong>{colorNameRu.trim() && <small>{colorNameRu.trim()}</small>}<em>{validHex ? normalizedHex : "HEX не указан"}</em></div></div></div>}
      </div>
      <footer><button className="admin-secondary" onClick={() => setEditing(null)}>Отмена</button><button className="admin-primary" disabled={busy || hexInvalid || !label.trim() || (code === "productModel" && (!modelBrandId || !modelTypeId))} onClick={() => void save()}>{busy ? "Сохранение…" : "Сохранить"}</button></footer>
    </section></div>}
  </main>;
}
