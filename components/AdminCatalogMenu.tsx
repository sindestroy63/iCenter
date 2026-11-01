"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, FolderPlus, Plus, Save, Trash2, Upload } from "lucide-react";
import { filterMenuModels, type CatalogMenuAction, type CatalogMenuConfig, type CatalogMenuNode, type CatalogMenuRule, type MenuTaxonomy } from "@/lib/catalog-menu";

type Media = { id: string; filename: string; url: string; mimeType: string; alt?: string };
type Payload = { menu: CatalogMenuConfig; options: MenuTaxonomy };
const csrf = () => decodeURIComponent(document.cookie.split("; ").find((part) => part.startsWith("icenter_csrf="))?.split("=")[1] ?? "");
const sorted = (items: CatalogMenuNode[], parentId: string | null) => items.filter((item) => item.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru"));
const newNode = (id: string, parentId: string | null, sortOrder: number): CatalogMenuNode => ({ id, parentId, title: "Новый раздел", description: "", visible: true, sortOrder, action: null, ...(parentId === null ? { banner: { enabled: false, imageMediaId: null, alt: "", description: "" } } : {}) });
const actionKind = (action: CatalogMenuAction | null) => action?.type ?? "none";
const actionLabel = (action: CatalogMenuAction | null) => {
  if (!action) return "Без перехода";
  if (action.type === "filters") {
    const model = action.rules.some((rule) => rule.field === "model");
    return model ? "Фильтр · модель" : "Фильтр каталога";
  }
  return ({ url: "Ссылка", category: "Категория", group: "Группа товаров" } as const)[action.type];
};

function descendantsOf(items: CatalogMenuNode[], id: string) {
  const result = new Set<string>();
  const visit = (parentId: string) => items.filter((item) => item.parentId === parentId).forEach((item) => { if (!result.has(item.id)) { result.add(item.id); visit(item.id); } });
  visit(id);
  return result;
}

export default function AdminCatalogMenu() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const config = payload?.menu;
  const selected = config?.items.find((item) => item.id === selectedId) ?? null;
  const roots = useMemo(() => config ? sorted(config.items, null) : [], [config]);

  async function load() {
    setLoading(true); setError("");
    try {
      const [menuResponse, mediaResponse] = await Promise.all([fetch("/api/admin/catalog-menu", { cache: "no-store" }), fetch("/api/admin/media", { cache: "no-store" })]);
      const menuBody = await menuResponse.json() as Payload;
      const mediaBody = await mediaResponse.json() as { data?: Media[] };
      if (!menuResponse.ok || !mediaResponse.ok) throw new Error("Не удалось загрузить меню или медиатеку.");
      setPayload(menuBody);
      setMedia((mediaBody.data ?? []).filter((item) => ["image/jpeg", "image/png", "image/webp"].includes(item.mimeType)));
      setSelectedId((current) => menuBody.menu.items.some((item) => item.id === current) ? current : menuBody.menu.items[0]?.id ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка загрузки."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function patch(id: string, update: Partial<CatalogMenuNode>) {
    setPayload((current) => current ? { ...current, menu: { ...current.menu, items: current.menu.items.map((item) => item.id === id ? { ...item, ...update } : item) } } : current);
  }
  function addRoot() {
    if (!config) return;
    const item = newNode(crypto.randomUUID(), null, roots.length);
    setPayload({ ...payload!, menu: { ...config, items: [...config.items, item] } }); setSelectedId(item.id);
  }
  function addChild(parent: CatalogMenuNode) {
    if (!config || depthOf(config.items, parent.id) >= 2) return;
    const item = newNode(crypto.randomUUID(), parent.id, sorted(config.items, parent.id).length);
    setPayload({ ...payload!, menu: { ...config, items: [...config.items, item] } }); setSelectedId(item.id);
  }
  function removeSelected() {
    if (!config || !selected || !window.confirm(`Удалить пункт «${selected.title}» и все его вложенные пункты?`)) return;
    const removed = descendantsOf(config.items, selected.id); removed.add(selected.id);
    const items = config.items.filter((item) => !removed.has(item.id));
    setPayload({ ...payload!, menu: { ...config, items } }); setSelectedId(sorted(items, null)[0]?.id ?? "");
  }
  function moveSelected(delta: number) {
    if (!config || !selected) return;
    const siblings = sorted(config.items, selected.parentId); const index = siblings.findIndex((item) => item.id === selected.id); const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= siblings.length) return;
    const next = [...siblings]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    const orders = new Map(next.map((item, order) => [item.id, order]));
    setPayload({ ...payload!, menu: { ...config, items: config.items.map((item) => orders.has(item.id) ? { ...item, sortOrder: orders.get(item.id)! } : item) } });
  }
  function changeParent(parentId: string) {
    if (!config || !selected) return;
    const excluded = descendantsOf(config.items, selected.id); excluded.add(selected.id);
    const subtreeHeight = maxDescendantDepth(config.items, selected.id);
    const parent = parentId ? config.items.find((item) => item.id === parentId) : null;
    if (parent && (excluded.has(parent.id) || depthOf(config.items, parent.id) + 1 + subtreeHeight > 2)) return;
    const nextItems = config.items.map((item) => {
      if (item.id !== selected.id) return item;
      if (parentId) { const { banner: _banner, ...withoutBanner } = item; return { ...withoutBanner, parentId, sortOrder: sorted(config.items, parentId).length }; }
      return { ...item, parentId: null, sortOrder: sorted(config.items, null).length, banner: item.banner ?? { enabled: false, imageMediaId: null, alt: "", description: "" } };
    });
    setPayload({ ...payload!, menu: { ...config, items: nextItems } });
  }
  function changeAction(kind: string) {
    if (!selected) return;
    const action: CatalogMenuAction | null = kind === "url" ? { type: "url", href: "/catalog" } : kind === "category" ? { type: "category", categoryId: payload?.options.categories[0]?.id ?? "" } : kind === "group" ? { type: "group", groupId: payload?.options.groups?.[0]?.id ?? "" } : kind === "filters" ? { type: "filters", rules: [{ field: "brand", value: payload?.options.brands[0]?.id ?? "" }] } : null;
    patch(selected.id, { action });
  }
  function changeRule(index: number, update: Partial<CatalogMenuRule>) {
    if (!selected?.action || selected.action.type !== "filters") return;
    const rules = selected.action.rules.map((rule, i) => i === index ? { ...rule, ...update } as CatalogMenuRule : rule);
    patch(selected.id, { action: { type: "filters", rules } });
  }
  function removeRule(index: number) {
    const action = selected?.action;
    if (selected && action?.type === "filters") patch(selected.id, { action: { type: "filters", rules: action.rules.filter((_, i) => i !== index) } });
  }
  function addRule() {
    const action = selected?.action;
    if (selected && action?.type === "filters" && action.rules.length < 8) patch(selected.id, { action: { type: "filters", rules: [...action.rules, { field: "brand", value: payload?.options.brands[0]?.id ?? "" }] } });
  }
  function upload(file?: File) {
    if (!file || !selected || selected.parentId !== null) return;
    setBusy(true); setError(""); const form = new FormData(); form.set("file", file); form.set("purpose", "catalog-menu");
    fetch("/api/admin/media", { method: "POST", headers: { "x-csrf-token": csrf(), "x-upload-purpose": "catalog-menu" }, body: form }).then(async (response) => {
      const result = await response.json(); if (!response.ok || !result.data?.id) throw new Error(result.error ?? "Не удалось загрузить изображение.");
      setMedia((items) => [result.data, ...items]); patch(selected.id, { banner: { enabled: true, imageMediaId: result.data.id, alt: result.data.alt ?? "", description: selected.banner?.description ?? "" } });
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Ошибка загрузки изображения.")).finally(() => setBusy(false));
  }
  async function save() {
    if (!config) return;
    const parents = [null, ...config.items.map((item) => item.id)]; const order = new Map<string, number>();
    for (const parent of parents) sorted(config.items, parent).forEach((item, index) => order.set(item.id, index));
    const menu = { ...config, items: config.items.map((item) => ({ ...item, sortOrder: order.get(item.id) ?? item.sortOrder })) };
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/catalog-menu", { method: "PUT", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify({ menu }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Не удалось сохранить меню.");
      setPayload({ ...payload!, menu }); setNotice("Меню каталога сохранено.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка сохранения."); }
    finally { setBusy(false); }
  }

  const renderTree = (parentId: string | null, depth = 0): React.ReactNode => sorted(config?.items ?? [], parentId).map((item) => <div key={item.id} className={`catalog-menu-tree-node${item.id === selectedId ? " active" : ""}`} style={{ "--menu-depth": depth } as React.CSSProperties}>
    <button type="button" className="catalog-menu-tree-select" onClick={() => setSelectedId(item.id)}><span className="catalog-menu-tree-label"><strong>{item.title}</strong><small>{actionLabel(item.action)}</small></span>{!item.visible && <EyeOff size={14} aria-label="Скрыт" />}</button>
    {renderTree(item.id, depth + 1)}
  </div>);
  const selectedMedia = media.find((entry) => entry.id === selected?.banner?.imageMediaId);
  const currentSiblings = selected && config ? sorted(config.items, selected.parentId) : [];
  const ancestorRules = (item: CatalogMenuNode | null) => {
    const rules: CatalogMenuRule[] = []; let parentId = item?.parentId ?? null;
    while (parentId && config) { const parent = config.items.find((entry) => entry.id === parentId); if (!parent) break; if (parent.action?.type === "filters") rules.push(...parent.action.rules); parentId = parent.parentId; }
    if (item?.action?.type === "filters") rules.push(...item.action.rules);
    return rules;
  };
  const availableValues = (field: CatalogMenuRule["field"]) => {
    const rules = ancestorRules(selected); const brandId = rules.find((rule) => rule.field === "brand")?.value; const typeId = rules.find((rule) => rule.field === "type")?.value;
    if (field === "brand") return payload?.options.brands ?? [];
    if (field === "type") return (payload?.options.types ?? []).filter((type) => !brandId || type.brandId === brandId);
    if (field === "category") return payload?.options.categories ?? [];
    if (field === "model") {
      const type = payload?.options.types.find((entry) => entry.id === typeId);
      return filterMenuModels(payload?.options.models ?? [], typeof brandId === "string" ? brandId : undefined, type?.globalProductTypeId);
    }
    return [];
  };
  const parentOptions = selected && config ? config.items.filter((candidate) => {
    if (candidate.id === selected.id || descendantsOf(config.items, selected.id).has(candidate.id)) return false;
    return depthOf(config.items, candidate.id) + 1 + maxDescendantDepth(config.items, selected.id) <= 2;
  }) : [];

  return <main className="admin-content admin-workspace">
    <header className="workspace-head"><div><h1>Меню каталога</h1><p>Структура, переходы, серверные фильтры и баннеры корневых разделов.</p></div><button className="admin-primary" disabled={busy || loading || !config} onClick={() => void save()}><Save size={16} />Сохранить</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="admin-note" role="status">{notice}</p>}
    {loading ? <div className="panel">Загрузка меню…</div> : <div className="catalog-menu-admin">
      <aside className="catalog-menu-tree panel"><div className="catalog-menu-tree-toolbar"><strong>Структура</strong><button type="button" className="admin-secondary" onClick={addRoot}><FolderPlus size={15} />Добавить раздел</button></div><div>{renderTree(null)}</div></aside>
      <section className="catalog-menu-editor panel">{selected ? <>
        <header className="catalog-menu-editor-head"><div><h2>{selected.parentId ? "Подраздел" : "Корневой раздел"}</h2><span className="catalog-menu-action-badge">{actionLabel(selected.action)}</span></div><div className="catalog-menu-icon-actions"><button type="button" className="admin-icon-button" title="Выше" aria-label="Переместить выше" disabled={currentSiblings[0]?.id === selected.id} onClick={() => moveSelected(-1)}><ArrowUp size={16} /></button><button type="button" className="admin-icon-button" title="Ниже" aria-label="Переместить ниже" disabled={currentSiblings.at(-1)?.id === selected.id} onClick={() => moveSelected(1)}><ArrowDown size={16} /></button><button type="button" className="admin-icon-button danger" title="Удалить" aria-label="Удалить пункт меню" onClick={removeSelected}><Trash2 size={16} /></button></div></header>
        <label className="admin-check"><input type="checkbox" checked={selected.visible} onChange={(e) => patch(selected.id, { visible: e.target.checked })} />Показывать на сайте <span>{selected.visible ? <Eye size={14} /> : <EyeOff size={14} />}</span></label>
        <label className="admin-form-label">Название<input maxLength={100} value={selected.title} onChange={(e) => patch(selected.id, { title: e.target.value })} /></label>
        <label className="admin-form-label">Родительский раздел<select value={selected.parentId ?? ""} onChange={(e) => changeParent(e.target.value)}><option value="">Корневой раздел</option>{parentOptions.map((parent) => <option key={parent.id} value={parent.id}>{parent.title}</option>)}</select></label>
        <label className="admin-form-label">Действие при нажатии<select value={actionKind(selected.action)} onChange={(e) => changeAction(e.target.value)}><option value="none">Без перехода</option><option value="url">Внутренний URL</option><option value="category">Категория каталога</option><option value="group">Группа товаров</option><option value="filters">Фильтры каталога</option></select></label>
        {selected.action?.type === "group" && <label className="admin-form-label">Группа товаров<select value={selected.action.groupId} onChange={(e) => patch(selected.id, { action: { type: "group", groupId: e.target.value } })}><option value="">Выберите группу</option>{(payload?.options.groups ?? []).map((group) => <option value={group.id} key={group.id}>{group.title} · {group.slug}</option>)}</select></label>}
        {selected.action?.type === "url" && <label className="admin-form-label">Внутренний путь<input maxLength={300} placeholder="/about" value={selected.action.href} onChange={(e) => patch(selected.id, { action: { ...selected.action!, href: e.target.value } as CatalogMenuAction })} /></label>}
        {selected.action?.type === "category" && <label className="admin-form-label">Категория каталога<select value={selected.action.categoryId} onChange={(e) => patch(selected.id, { action: { type: "category", categoryId: e.target.value } })}><option value="trade-in">Trade-in — подержанные товары</option>{payload?.options.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {selected.action?.type === "filters" && <div className="catalog-menu-rules"><strong>Все условия должны выполняться</strong>{selected.action.rules.map((rule, index) => <div className="catalog-menu-rule" key={`${index}-${rule.field}`}>
          <select aria-label="Поле фильтра" value={rule.field} onChange={(e) => { const field = e.target.value as CatalogMenuRule["field"]; const first = field === "tradeIn" ? true : availableValues(field)[0]?.id ?? ""; if (first) changeRule(index, { field, value: first }); }}><option value="brand">Бренд</option><option value="type">Тип товара</option><option value="model">Модель</option><option value="category">Категория</option><option value="tradeIn">Подержанный Trade-in</option></select>
          {rule.field === "tradeIn" ? <span>Да</span> : <select aria-label="Значение фильтра" value={String(rule.value)} onChange={(e) => changeRule(index, { value: e.target.value })}>{availableValues(rule.field).map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select>}
          <button type="button" className="admin-icon-button danger" aria-label="Удалить условие" onClick={() => removeRule(index)}><Trash2 size={15} /></button>
        </div>)}<button type="button" className="admin-secondary" disabled={selected.action.rules.length >= 8} onClick={addRule}><Plus size={15} />Добавить условие</button></div>}
        {selected.parentId === null && <section className="catalog-menu-banner-editor"><h3>Баннер раздела</h3><label className="admin-check"><input type="checkbox" checked={selected.banner?.enabled ?? false} onChange={(e) => patch(selected.id, { banner: { enabled: e.target.checked, imageMediaId: selected.banner?.imageMediaId ?? null, alt: selected.banner?.alt ?? "", description: selected.banner?.description ?? "" } })} />Показывать баннер</label><label className="admin-form-label">Изображение<select value={selected.banner?.imageMediaId ?? ""} onChange={(e) => patch(selected.id, { banner: { enabled: Boolean(e.target.value), imageMediaId: e.target.value || null, alt: selected.banner?.alt ?? "", description: selected.banner?.description ?? "" } })}><option value="">Без изображения</option>{media.map((item) => <option key={item.id} value={item.id}>{item.filename}</option>)}</select></label><label className="admin-secondary catalog-menu-upload"><Upload size={15} />Загрузить изображение<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => { upload(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} /></label>{selectedMedia && <div className="catalog-menu-preview"><img src={selectedMedia.url} alt={selected.banner?.alt ?? ""} /><button type="button" className="admin-secondary" onClick={() => patch(selected.id, { banner: { enabled: false, imageMediaId: null, alt: "", description: selected.banner?.description ?? "" } })}><Trash2 size={14} />Убрать</button></div>}<label className="admin-form-label">Альтернативный текст<input maxLength={300} value={selected.banner?.alt ?? ""} onChange={(e) => patch(selected.id, { banner: { enabled: selected.banner?.enabled ?? false, imageMediaId: selected.banner?.imageMediaId ?? null, alt: e.target.value, description: selected.banner?.description ?? "" } })} /></label><label className="admin-form-label">Подпись баннера<input maxLength={240} value={selected.banner?.description ?? ""} onChange={(e) => patch(selected.id, { banner: { enabled: selected.banner?.enabled ?? false, imageMediaId: selected.banner?.imageMediaId ?? null, alt: selected.banner?.alt ?? "", description: e.target.value } })} /></label></section>}
        {config && depthOf(config.items, selected.id) < 2 && <button type="button" className="admin-secondary catalog-menu-add-child" onClick={() => addChild(selected)}><Plus size={15} />Добавить подраздел</button>}
      </> : <div className="catalog-menu-empty"><h2>Выберите раздел меню</h2><p>Создайте верхний пункт, затем настройте переходы и подразделы.</p></div>}</section>
    </div>}
  </main>;
}

function depthOf(items: CatalogMenuNode[], id: string) {
  let depth = 0; let current = items.find((item) => item.id === id); const seen = new Set<string>();
  while (current?.parentId) { if (seen.has(current.id)) return 99; seen.add(current.id); current = items.find((item) => item.id === current!.parentId); depth++; }
  return depth;
}
function maxDescendantDepth(items: CatalogMenuNode[], id: string): number {
  const children = items.filter((item) => item.parentId === id);
  return children.length ? 1 + Math.max(...children.map((item) => maxDescendantDepth(items, item.id))) : 0;
}
