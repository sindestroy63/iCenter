"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { ADMIN_DICTIONARY_REGISTRY, DICTIONARY_REGISTRY, type DictionaryCode } from "@/lib/product-dictionaries";
import { catalogColorHex, catalogColorNames } from "@/lib/catalog-colors";
import ColorName from "@/components/ColorName";

type Entry = { id: string; dictionary: string; canonicalKey: string; label: string; name?: string; nameEn?: string; nameRu?: string | null; aliases: string[]; sortOrder: number; isActive: boolean; brandId?: string | null; globalProductTypeId?: string | null; hex?: string | null };
type Definition = { id: string; code: string; name: string; scope: string; valueKind: string; sortOrder: number; isActive: boolean; isManaged?: boolean; productTypeIds?: string[] };
type ApiData = { data: Entry[]; globalTypes?: Entry[]; productTypes?: Array<{ id: string; name: string; isActive: boolean }>; legacyTypes?: Array<{ id: string; name: string; brandId: string }>; brands?: Array<{ id: string; name: string }>; role: string; canWrite: boolean; canManageAttributes?: boolean; definitions?: Definition[]; registry: typeof DICTIONARY_REGISTRY };
const labels: Record<DictionaryCode, string> = { brand: "Бренд", productType: "Тип товара", productModel: "Модель", color: "Цвет", memory: "Память", ram: "RAM", sim: "SIM", connectivity: "Подключение", size: "Размер", material: "Материал", chip: "Процессор / чип", region: "Регион / версия", condition: "Состояние", bundle: "Комплектация", productLine: "Линейка товара" };
const cyrillicSlug: Record<string, string> = { а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ё:"e", ж:"zh", з:"z", и:"i", й:"y", к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r", с:"s", т:"t", у:"u", ф:"f", х:"h", ц:"ts", ч:"ch", ш:"sh", щ:"sch", ъ:"", ы:"y", ь:"", э:"e", ю:"yu", я:"ya" };
const keyPart = (value: string) => value.toLocaleLowerCase("ru-RU").replace(/[а-яё]/g, (letter) => cyrillicSlug[letter] ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "value";
const csrf = () => decodeURIComponent(document.cookie.split("; ").find((item) => item.startsWith("icenter_csrf="))?.split("=")[1] ?? "");

export default function AdminDictionaries({ initialCode = "brand" }: { initialCode?: DictionaryCode }) {
  const [code, setCode] = useState<string>(ADMIN_DICTIONARY_REGISTRY.some((item) => item.code === initialCode) ? initialCode : "brand");
  const [payload, setPayload] = useState<ApiData | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [definitionEditing, setDefinitionEditing] = useState<Definition | null>(null);
  const [definitionName, setDefinitionName] = useState("");
  const [definitionIsActive, setDefinitionIsActive] = useState(true);
  const [definitionProductTypeIds, setDefinitionProductTypeIds] = useState<string[]>([]);
  const [duplicateDefinitionCode, setDuplicateDefinitionCode] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [aliases, setAliases] = useState("");
  const [modelBrandId, setModelBrandId] = useState("");
  const [modelTypeId, setModelTypeId] = useState("");
  const [modelActive, setModelActive] = useState(true);
  const [entryActive, setEntryActive] = useState(true);
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

  const definitions = payload?.definitions ?? [];
  const selectedDefinition = DICTIONARY_REGISTRY.find((item) => item.code === code);
  const currentDefinition = definitions.find((item) => item.code === code);
  const canManageValues = currentDefinition?.isManaged ? payload?.canManageAttributes : payload?.canWrite;
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
    setModelBrandId(current?.brandId ?? "");
    setModelTypeId(current?.globalProductTypeId ?? "");
    setModelActive(current?.isActive !== false);
    setEntryActive(current?.isActive !== false);
    setColorNameRu(current.nameRu ?? catalogColorNames({ name: current.nameEn ?? current.label, slug: current.canonicalKey.replace(/^color:/, "") }).secondary ?? "");
    setHex(current.hex ?? "");
    setMessage("");
  };
  const openDefinitionEditor = (definition?: Definition) => { setDefinitionEditing(definition ?? { id: "", code: "", name: "", scope: "VARIANT", valueKind: "OPTION", sortOrder: definitions.length * 10, isActive: true, productTypeIds: [] }); setDefinitionName(definition?.name ?? ""); setDefinitionIsActive(definition?.isActive ?? true); setDefinitionProductTypeIds(definition?.productTypeIds ?? []); setMessage(""); };
  const saveDefinition = async () => {
    if (!payload?.canManageAttributes || !definitionEditing || !definitionName.trim()) return;
    setBusy(true); setMessage(""); setDuplicateDefinitionCode(null);
    try {
      const body = definitionEditing.id
        ? { kind: "definition", id: definitionEditing.id, name: definitionName.trim(), isActive: definitionIsActive, sortOrder: definitionEditing.sortOrder, productTypeIds: definitionProductTypeIds }
        : { kind: "definition", name: definitionName.trim(), isActive: true, sortOrder: definitionEditing.sortOrder, productTypeIds: definitionProductTypeIds };
      const response = await fetch("/api/admin/dictionaries", { method: definitionEditing.id ? "PATCH" : "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (result.error === "ATTRIBUTE_NAME_EXISTS") {
          const existing = definitions.find((item) => item.name.trim().toLocaleLowerCase("ru-RU") === definitionName.trim().toLocaleLowerCase("ru-RU"));
          setDuplicateDefinitionCode(existing?.code ?? null);
          throw new Error(existing ? `Характеристика «${existing.name}» уже существует.` : "Характеристика с таким названием уже существует.");
        }
        if (result.error === "ATTRIBUTE_IN_USE") throw new Error("Нельзя снять характеристику с типа товара: она уже используется связанными товарами или вариантами.");
        throw new Error(result.error || "Не удалось сохранить характеристику.");
      }
      setDefinitionEditing(null); await load(code); setMessage("Характеристика сохранена.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось сохранить характеристику."); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!canManageValues || !editing) return;
    if (hexInvalid) { setMessage("Укажите HEX в формате #RRGGBB."); return; }
    setBusy(true); setMessage("");
    try {
    const data = { ...(editing.id ? { id: editing.id } : {}), canonicalKey: key, label: label.trim(), aliases: aliases.split(",").map((item) => item.trim()).filter(Boolean), sortOrder: editing.sortOrder ?? entries.length * 10, isActive: code === "productModel" ? modelActive : editing.id ? entryActive : true, ...(code === "productModel" ? { brandId: modelBrandId, globalProductTypeId: modelTypeId } : {}), ...(code === "color" ? { nameRu: colorNameRu.trim() || null, hex: validHex ? normalizedHex : null } : {}) };
      const response = editing.id
        ? await fetch("/api/admin/dictionaries", { method: "PATCH", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify({ code, id: editing.id, label: data.label, sortOrder: data.sortOrder, isActive: data.isActive, ...(code === "color" ? { nameRu: colorNameRu.trim() || null, hex: validHex ? normalizedHex : null } : {}), ...(code === "productModel" ? { brandId: modelBrandId, globalProductTypeId: modelTypeId } : {}) }) })
        : await fetch(`/api/admin/dictionaries?code=${encodeURIComponent(code)}`, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify(data) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error === "DICTIONARY_MIGRATION_REQUIRED" ? "Для сохранения русских названий требуется применить подготовленную миграцию справочника цветов." : result.error === "USED_VALUE" ? "Значение используется связанными данными и не может быть изменено." : result.error || "Не удалось сохранить значение.");
      setEditing(null); await load(code); setMessage("Изменения сохранены.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось сохранить значение."); }
    finally { setBusy(false); }
  };
  const removeEntry = async (entry: Entry) => {
    if (!canManageValues || !window.confirm(`Удалить «${entry.label}»? Это действие нельзя отменить.`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/dictionaries?code=${encodeURIComponent(code)}&id=${encodeURIComponent(entry.id)}`, { method: "DELETE", headers: { "x-csrf-token": csrf() } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error === "USED_VALUE" ? "Значение используется товарами, вариантами или другими связанными данными и не может быть удалено." : result.error || "Не удалось удалить значение.");
      await load(code); setMessage("Значение удалено.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось удалить значение."); }
    finally { setBusy(false); }
  };
  const removeDefinition = async (definition: Definition) => {
    if (!window.confirm(`Удалить характеристику «${definition.name}»? Удаление доступно только если характеристика и её значения нигде не используются.`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/dictionaries?kind=definition&id=${encodeURIComponent(definition.id)}`, { method: "DELETE", headers: { "x-csrf-token": csrf() } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error === "USED_VALUE" ? "Характеристика или её значения уже используются и не могут быть удалены." : result.error === "ATTRIBUTE_HAS_VALUES" ? "Сначала удалите неиспользуемые значения характеристики." : result.error === "ATTRIBUTE_IN_USE" ? "Сначала снимите характеристику с типов товаров." : result.error || "Не удалось удалить характеристику.");
      if (code === definition.code) setCode("brand");
      await load(code === definition.code ? "brand" : code); setMessage("Характеристика удалена.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось удалить характеристику."); } finally { setBusy(false); }
  };

  const brandName = (id?: string | null) => payload?.brands?.find((brand) => brand.id === id)?.name ?? "";
  const typeName = (id?: string | null) => payload?.globalTypes?.find((type) => type.id === id)?.label ?? payload?.globalTypes?.find((type) => type.id === id)?.name ?? "";
  const modelTypeOptions = payload?.globalTypes ?? [];
  return <main className="admin-content admin-workspace admin-dictionaries">
    <div className="workspace-head dictionary-page-head"><div className="dictionary-heading-copy"><h1>Справочники</h1></div><span className="row-actions">{payload?.canManageAttributes && <button className="admin-secondary" onClick={() => openDefinitionEditor()}><Plus size={16} />Характеристика</button>}{canManageValues && <button className="admin-primary" onClick={() => openEditor()}><Plus size={16} />Добавить значение</button>}</span></div>
    <div className="dictionary-layout">
      <aside className="dictionary-nav" aria-label="Справочники">{ADMIN_DICTIONARY_REGISTRY.map((item) => { const definition = definitions.find((entry) => entry.code === item.code); const name = definition?.name ?? labels[item.code] ?? item.label; return <span className="dictionary-nav-custom" key={item.code}><button className={code === item.code ? "active" : ""} title={name} onClick={() => { setCode(item.code); setQuery(""); setEditing(null); }}><span>{name}{definition && !definition.isActive ? " (архив)" : ""}</span></button>{definition && !definition.isManaged && payload?.canManageAttributes && <button className="icon-action" onClick={() => openDefinitionEditor(definition)} aria-label={`Настроить ${name}`} title="Изменить характеристику"><Pencil size={14} /></button>}</span>; })}{definitions.filter((item) => item.isManaged).map((item) => <span className="dictionary-nav-custom" key={item.code}><button className={code === item.code ? "active" : ""} title={item.name} onClick={() => { setCode(item.code); setQuery(""); setEditing(null); }}><span>{item.name}{!item.isActive ? " (архив)" : ""}</span></button>{payload?.canManageAttributes && <><button className="icon-action" onClick={() => openDefinitionEditor(item)} aria-label={`Изменить ${item.name}`} title="Изменить характеристику"><Pencil size={14} /></button><button className="icon-action danger" disabled={busy} onClick={() => void removeDefinition(item)} aria-label={`Удалить ${item.name}`} title="Удалить характеристику"><Trash2 size={14} /></button></>}</span>)}</aside>
      <section className="dictionary-content">
        <div className="dictionary-toolbar"><div><h2>{currentDefinition?.name ?? selectedDefinition?.label ?? code}</h2><p>{visible.length} из {entries.length} значений</p>{currentDefinition && !currentDefinition.isManaged && <small>{currentDefinition.scope === "VARIANT" ? "Системная характеристика" : "Системная характеристика товара"}{canManageValues ? " · значения доступны для управления" : " · просмотр, изменение ограничено правами"}</small>}</div>{(code === "color" || currentDefinition) && <label className="admin-field-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию" /></label>}</div>
        {error ? <div className="empty-state"><p>{error}</p><button className="admin-secondary" onClick={() => void load(code)}>Повторить</button></div> : <div className="workspace-table panel dictionary-table"><table className="table"><thead><tr><th>Название</th>{code === "productModel" && <><th>Бренд</th><th>Тип товара</th></>}<th>Статус</th><th /></tr></thead><tbody>{visible.map((entry) => { const colorHex=code === "color" ? catalogColorHex({ name:entry.nameEn ?? entry.label,hex:entry.hex }) : null; return <tr key={entry.id}><td><span className="dictionary-entry-name">{code === "color" && <i className={colorHex ? "dictionary-color-swatch" : "dictionary-color-swatch neutral-color"} style={colorHex ? { background:colorHex } : undefined} aria-hidden="true" />}<span>{code === "color" ? <ColorName color={{ name:entry.nameEn ?? entry.label,nameRu:entry.nameRu }} /> : <strong>{entry.label}</strong>}{code === "color" && <small>{entry.hex || colorHex || "HEX не указан"}</small>}{entry.aliases.length > 0 && <small>Алиасы: {entry.aliases.join(", ")}</small>}</span></span></td>{code === "productModel" && <><td>{brandName(entry.brandId)}</td><td>{typeName(entry.globalProductTypeId)}</td></>}<td><span className={entry.isActive ? "dictionary-status active" : "dictionary-status"}>{entry.isActive ? "Активно" : "Архив"}</span></td><td>{canManageValues && <span className="row-actions"><button className="icon-action" onClick={() => openEditor(entry)} aria-label="Изменить" title="Изменить"><Pencil size={15} /></button><button className="icon-action danger" onClick={() => void removeEntry(entry)} disabled={busy} aria-label="Удалить" title="Удалить"><Trash2 size={15} /></button></span>}</td></tr>; })}</tbody></table>{visible.length === 0 && <p className="dictionary-empty">В этом справочнике пока нет записей.</p>}</div>}
        {message && <p className="dictionary-message" role="status">{message}</p>}
      </section>
    </div>
    {editing !== null && <div className="admin-modal-backdrop"><section className="admin-modal dictionary-modal">
      <header><h2>{editing.id ? "Изменить значение" : "Новое значение"}</h2><button onClick={() => setEditing(null)} aria-label="Закрыть"><X size={18} /></button></header>
      <div className="admin-modal-body">
        <label className="admin-form-label">{code === "color" ? "Название на английском" : "Название"}<input value={label} onChange={(event) => { const next = event.target.value; setLabel(next); if (!editing.id) setKey(`${code === "productType" ? "product_type" : code}:${keyPart(next)}`); }} /></label>
        {code === "color" && <label className="admin-form-label">Название на русском<input value={colorNameRu} onChange={(event) => setColorNameRu(event.target.value)} placeholder="Необязательно" /></label>}
        {code !== "productModel" && code !== "productType" && code !== "brand" && <label className="admin-form-label">Алиасы, через запятую<input value={aliases} onChange={(event) => setAliases(event.target.value)} /></label>}
        {code === "productModel" && <><label className="admin-form-label">Бренд<select value={modelBrandId} onChange={(event) => { setModelBrandId(event.target.value); setModelTypeId(""); }}><option value="">Выберите бренд</option>{payload?.brands?.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label><label className="admin-form-label">Тип товара<select value={modelTypeId} onChange={(event) => setModelTypeId(event.target.value)}><option value="">Выберите тип</option>{modelTypeOptions.map((type) => <option key={type.id} value={type.id}>{type.label ?? type.name}</option>)}</select></label></>}
        {editing.id && code !== "productModel" && <label className="admin-check"><input type="checkbox" checked={entryActive} onChange={(event) => setEntryActive(event.target.checked)} />Значение активно</label>}
        {code === "color" && (
          <div className="dictionary-color-editor">
            <label className="admin-form-label">
              Цвет HEX
              <div className="dictionary-hex-row">
                <input className={hexInvalid ? "invalid" : ""} value={hex} onChange={(event) => setHex(event.target.value)} onBlur={() => validHex && setHex(normalizedHex)} placeholder="#000000" inputMode="text" aria-invalid={hexInvalid} />
                <label className="dictionary-color-picker" title="Выбрать цвет">
                  <input type="color" value={validHex ? normalizedHex : "#000000"} onChange={(event) => setHex(event.target.value.toUpperCase())} />
                  <span style={{ backgroundColor: validHex ? normalizedHex : "#000000" }} />
                </label>
              </div>
              {hexInvalid && <small className="admin-field-error">Формат: #RRGGBB</small>}
            </label>
            <div className="dictionary-color-preview">
              <span style={{ backgroundColor: validHex ? normalizedHex : "transparent" }} />
              <div>
                <strong>{label.trim() || "Предпросмотр цвета"}</strong>
                {colorNameRu.trim() && <small>{colorNameRu.trim()}</small>}
                <em>{validHex ? normalizedHex : "HEX не указан"}</em>
              </div>
            </div>
          </div>
        )}
      </div>
      <footer><button className="admin-secondary" onClick={() => setEditing(null)}>Отмена</button><button className="admin-primary" disabled={busy || hexInvalid || !label.trim() || (code === "productModel" && (!modelBrandId || !modelTypeId))} onClick={() => void save()}>{busy ? "Сохранение…" : "Сохранить"}</button></footer>
    </section></div>}
    {definitionEditing !== null && <div className="admin-modal-backdrop"><section className="admin-modal dictionary-modal dictionary-definition-modal"><header><h2>{definitionEditing.id ? "Настройки характеристики" : "Новая характеристика"}</h2><button onClick={() => setDefinitionEditing(null)} aria-label="Закрыть"><X size={18} /></button></header><div className="admin-modal-body"><label className="admin-form-label">Название характеристики<input value={definitionName} onChange={(event) => { setDefinitionName(event.target.value); setDuplicateDefinitionCode(null); }} placeholder="Например, Диагональ" /></label>{definitionEditing.id && <label className="dictionary-definition-toggle"><span><strong>Активность</strong><small>Показывать характеристику в админке и каталоге</small></span><input type="checkbox" checked={definitionIsActive} onChange={(event) => setDefinitionIsActive(event.target.checked)} aria-label="Характеристика активна" /></label>}<fieldset className="dictionary-definition-types"><legend>Типы товаров</legend><div>{payload?.productTypes?.map((type) => <label key={type.id}><span>{type.name}{!type.isActive && <small>Неактивен</small>}</span><input type="checkbox" checked={definitionProductTypeIds.includes(type.id)} onChange={(event) => setDefinitionProductTypeIds((current) => event.target.checked ? [...current,type.id] : current.filter((id) => id !== type.id))} /></label>)}</div></fieldset>{duplicateDefinitionCode && <><p className="dictionary-message" role="status">{message}</p><button type="button" className="admin-secondary" onClick={() => { setDefinitionEditing(null); setCode(duplicateDefinitionCode); setQuery(""); setEditing(null); setMessage(""); }}>{`Открыть существующую характеристику «${definitions.find((item) => item.code === duplicateDefinitionCode)?.name ?? definitionName}»`}</button></>}</div><footer><button className="admin-secondary" onClick={() => setDefinitionEditing(null)}>Отмена</button><button className="admin-primary" disabled={busy || !definitionName.trim()} onClick={() => void saveDefinition()}>{busy ? "Сохранение…" : "Сохранить"}</button></footer></section></div>}
  </main>;
}
