"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, LoaderCircle, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { productSlugBase } from "@/lib/product-slug";

type Group = { id: string; slug: string; title: string; description: string; isActive: boolean; sortOrder: number; manualCount: number; variantCount: number; ruleCount: number };
type Variant = { id: string; productId: string; sku: string; label: string | null; storage: string | null; ram: string | null; simType: string | null; connectivity: string | null; size: string | null; material: string | null; attributes: Record<string, unknown> | null; price: string | null; oldPrice: string | null; availability: string | null; allowPreorder: boolean; deliveryTime: string | null; stock: number | null };
type Product = { id: string; name: string; slug: string; brandName: string; typeName: string; variants: Variant[] };
type Rule = { id: string };
type DetailVariant = Variant & { variantId?: string; sortOrder: number; productName: string };
type Detail = { data: Group; products: Array<{ productId: string; name: string; status: string }>; variants: DetailVariant[]; rules: Rule[]; previewCount: number | null; variantSchemaAvailable: boolean };
type Options = { brands: Array<{ id: string; name: string }>; types: Array<{ id: string; name: string }>; models: Array<{ id: string; name: string; brandId: string; globalProductTypeId: string }>; products: Product[]; cities: Array<{ id: string; slug: string; name: string }> };
type Draft = { title: string; slug: string; description: string; sortOrder: number; isActive: boolean };

const emptyOptions: Options = { brands: [], types: [], models: [], products: [], cities: [] };
const emptyDraft: Draft = { title: "", slug: "", description: "", sortOrder: 0, isActive: true };
const csrf = () => decodeURIComponent(document.cookie.split("; ").find((part) => part.startsWith("icenter_csrf="))?.split("=")[1] ?? "");
const hiddenAttributeKeys = new Set(["storage", "memory", "ram", "sim", "simType", "connectivity", "size", "material", "color", "colorName"]);

function characteristics(variant: Variant) {
  const values: string[] = [];
  const add = (value: unknown) => { const text = String(value ?? "").trim(); if (text && !values.some((item) => item.toLowerCase() === text.toLowerCase())) values.push(text); };
  [variant.storage, variant.ram, variant.simType, variant.connectivity, variant.size, variant.material].forEach(add);
  if (variant.label && ![variant.storage, variant.ram, variant.simType, variant.connectivity, variant.size, variant.material].some((value) => value && variant.label!.toLowerCase().includes(value.toLowerCase()))) add(variant.label);
  Object.entries(variant.attributes ?? {}).forEach(([key, value]) => { if (!hiddenAttributeKeys.has(key)) add(value); });
  return values.join(" · ") || "Стандартный вариант";
}
function price(value: string | null) { const amount = Number(value); return Number.isFinite(amount) ? new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(amount) : "Цена не указана"; }
function availability(value: string | null, allowPreorder: boolean) { if (value === "IN_STOCK") return "В наличии"; if (value === "PREORDER" || allowPreorder) return "Предзаказ"; if (value === "OUT_OF_STOCK") return "Нет в наличии"; return "Доступность не указана"; }

export default function AdminProductGroupsBackend() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [options, setOptions] = useState<Options>(emptyOptions);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [city, setCity] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedVariants, setSelectedVariants] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [validationAttempted, setValidationAttempted] = useState(false);

  const loadOptions = useCallback(async (q = "", nextCity = city) => {
    setOptionsLoading(true);
    try {
      const response = await fetch(`/api/admin/product-groups?options=1${q ? `&q=${encodeURIComponent(q)}` : ""}${nextCity ? `&city=${encodeURIComponent(nextCity)}` : ""}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить варианты.");
      setOptions(payload);
      setCity((value) => value || payload.cities[0]?.slug || "");
    } finally { setOptionsLoading(false); }
  }, [city]);
  const loadGroups = useCallback(async () => {
    const response = await fetch("/api/admin/product-groups", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить группы.");
    setGroups(payload.data ?? []);
    return payload.data as Group[];
  }, []);
  const loadDetail = useCallback(async (id: string, nextCity: string, hydrate = true) => {
    if (!id) { setDetail(null); return; }
    const response = await fetch(`/api/admin/product-groups?id=${encodeURIComponent(id)}${nextCity ? `&city=${encodeURIComponent(nextCity)}` : ""}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить группу.");
    const ids = new Set<string>((payload.variants ?? []).map((item: DetailVariant) => item.variantId ?? item.id));
    setDetail(payload);
    if (hydrate) {
      setSelectedVariants(ids); setSavedIds(ids);
      setDraft({ title: payload.data.title, slug: payload.data.slug, description: payload.data.description, sortOrder: payload.data.sortOrder, isActive: payload.data.isActive });
      setValidationAttempted(false);
    }
  }, []);

  useEffect(() => { Promise.all([loadOptions(), loadGroups()]).catch((cause) => setError(cause instanceof Error ? cause.message : "Ошибка загрузки.")).finally(() => setLoading(false)); }, [loadGroups, loadOptions]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId, city, true).catch((cause) => setError(cause instanceof Error ? cause.message : "Ошибка загрузки группы.")); }, [selectedId, loadDetail]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId, city, false).catch((cause) => setError(cause instanceof Error ? cause.message : "Ошибка обновления предпросмотра.")); }, [city, loadDetail, selectedId]);
  useEffect(() => { const timer = window.setTimeout(() => { void loadOptions(search, city).catch((cause) => setError(cause instanceof Error ? cause.message : "Ошибка поиска.")); }, 250); return () => window.clearTimeout(timer); }, [search, city, loadOptions]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(detail?.data ? { title: detail.data.title, slug: detail.data.slug, description: detail.data.description, sortOrder: detail.data.sortOrder, isActive: detail.data.isActive } : emptyDraft) || selectedVariants.size !== savedIds.size || Array.from(selectedVariants).some((id) => !savedIds.has(id)), [detail, draft, savedIds, selectedVariants]);
  const detailIds = savedIds;
  const selectedCount = selectedVariants.size;
  const selectedProductsCount = useMemo(() => {
    const ids = new Set<string>();
    for (const product of options.products) if (product.variants.some((variant) => selectedVariants.has(variant.id))) ids.add(product.id);
    for (const variant of detail?.variants ?? []) if (selectedVariants.has(variant.variantId ?? variant.id)) ids.add(variant.productId);
    return ids.size;
  }, [detail, options.products, selectedVariants]);
  const selectedDisplay = useMemo(() => {
    const map = new Map<string, { id: string; name: string; variants: Array<Variant & { persisted: boolean }> }>();
    const add = (productId: string, name: string, variant: Variant, persisted: boolean) => { const entry = map.get(productId) ?? { id: productId, name, variants: [] }; if (!entry.variants.some((item) => item.id === variant.id)) entry.variants.push({ ...variant, persisted }); map.set(productId, entry); };
    for (const item of detail?.variants ?? []) { const normalized = { ...item, id: item.variantId ?? item.id }; if (selectedVariants.has(normalized.id)) add(item.productId, item.productName, normalized, true); }
    for (const product of options.products) for (const variant of product.variants) if (selectedVariants.has(variant.id) && !detailIds.has(variant.id)) add(product.id, product.name, variant, false);
    return Array.from(map.values());
  }, [detail, detailIds, options.products, selectedVariants]);
  const legacyProducts = detail?.products ?? [];
  const hasLegacy = legacyProducts.length > 0;
  const hasUnsavedChanges = selectedId ? dirty : draft.title.trim().length > 0 || selectedVariants.size > 0;

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [hasUnsavedChanges]);

  const resetNewGroup = () => { if (hasUnsavedChanges && !window.confirm("Есть несохранённые изменения. Отбросить их?")) return; setSelectedId(""); setDetail(null); setDraft(emptyDraft); setSelectedVariants(new Set()); setSavedIds(new Set()); setValidationAttempted(false); setNotice(""); setError(""); };
  const selectGroup = (id: string) => { if (id === selectedId) return; if (hasUnsavedChanges && !window.confirm("Есть несохранённые изменения. Переключить группу без сохранения?")) return; setError(""); setNotice(""); setSelectedId(id); };
  const saveGroup = async () => {
    setValidationAttempted(true);
    if (busy) return;
    const title = draft.title.trim();
    const nextSlug = selectedId ? draft.slug.trim() : productSlugBase(title);
    if (!title) { setError("Укажите название группы."); return; }
    if (!nextSlug) { setError("Не удалось сформировать slug группы."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/product-groups", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify({ kind: "save", ...(selectedId ? { id: selectedId } : {}), ...draft, title, slug: nextSlug, variantIds: Array.from(selectedVariants) }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Не удалось сохранить группу и её состав.");
      const id = selectedId || payload.data.id;
      await loadGroups();
      await loadDetail(id, city);
      setSelectedId(id);
      setNotice("Группа и выбранный состав сохранены.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка сохранения группы."); }
    finally { setBusy(false); }
  };
  const deleteGroup = async () => {
    if (!selectedId || busy || !window.confirm("Удалить группу?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/product-groups", { method: "DELETE", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify({ kind: "group", id: selectedId }) });
      const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error ?? "Не удалось удалить группу.");
      await loadGroups(); setSelectedId(""); setDetail(null); setDraft(emptyDraft); setSelectedVariants(new Set()); setSavedIds(new Set()); setNotice("Группа удалена.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка удаления группы."); }
    finally { setBusy(false); }
  };

  const typeLabel = (group: Group) => group.manualCount && group.ruleCount ? "Смешанная" : group.ruleCount ? "Правила (legacy)" : "Ручная";
  const changeTitle = (title: string) => setDraft((current) => ({ ...current, title, slug: productSlugBase(title) }));

  return <main className="admin-content admin-workspace product-groups-page">
    <header className="workspace-head"><div><h1>Группы товаров</h1><p>Новые группы формируются вручную из конкретных вариантов.</p></div><button type="button" className="admin-secondary" disabled={busy} onClick={() => { void loadGroups(); void loadOptions(search, city); }}><RefreshCw size={16}/> Обновить</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="admin-note" role="status">{notice}</p>}
    <div className="product-groups-layout">
      <section className="panel product-groups-list"><div className="product-groups-section-head"><h2>Группы</h2><button type="button" className="admin-primary" disabled={busy} onClick={resetNewGroup}><Plus size={16}/> Новая группа</button></div>
        {loading ? <div className="admin-empty"><LoaderCircle className="spin" size={22}/> Загрузка…</div> : groups.length === 0 ? <div className="admin-empty">Групп пока нет.</div> : <div className="product-groups-items">{groups.map((group) => <button type="button" className={`product-group-item${group.id === selectedId ? " active" : ""}`} key={group.id} onClick={() => selectGroup(group.id)}><span><strong>{group.title}</strong><small>{typeLabel(group)} · {group.variantCount ?? 0} вариантов · {group.ruleCount} правил</small></span><ChevronRight size={16}/></button>)}</div>}
      </section>
      <section className="panel product-group-editor"><div className="product-groups-section-head"><h2>{selectedId ? "Редактор группы" : "Новая группа"}</h2>{selectedId && <button type="button" className="icon-action danger" disabled={busy} onClick={() => void deleteGroup()}><Trash2 size={16}/> Удалить</button>}</div>
        <div className="product-group-form">
          <label className="admin-form-label">Название<input aria-invalid={validationAttempted && !draft.title.trim()} value={draft.title} onChange={(event) => changeTitle(event.target.value)}/>{validationAttempted && !draft.title.trim() && <small className="form-error">Укажите название группы.</small>}</label>
          <label className="admin-form-label">Slug<input className="product-group-slug-readonly" readOnly aria-readonly="true" aria-invalid={validationAttempted && !draft.slug.trim()} value={draft.slug} onChange={() => undefined}/>{validationAttempted && !draft.slug.trim() && <small className="form-error">Slug формируется автоматически из названия.</small>}<small className="admin-form-hint">Формируется автоматически и не редактируется вручную.</small></label>
          <label className="admin-form-label">Порядок<input type="number" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })}/></label>
          <label className="admin-check"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}/><span>Активна</span></label>
        </div>
        <div className="product-group-save-row">{hasUnsavedChanges && <span className="product-group-unsaved">Есть несохранённые изменения</span>}<button type="button" className="admin-primary product-group-save" onClick={() => void saveGroup()} disabled={busy || (!!selectedId && !dirty)}>{busy ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} {busy ? "Сохранение…" : "Сохранить группу"}</button></div>
        {(detail || !selectedId) && <>
          {hasLegacy && <p className="product-group-legacy-note" role="note">В этой legacy-группе сохранены {legacyProducts.length} whole-product записей. Они продолжают влиять на каталог; новые variant-записи пока нельзя сохранить вместе с ними. Состав legacy-записей не изменён.</p>}
          {!!detail?.rules.length && <p className="product-group-legacy-note" role="note">В группе сохранено {detail.rules.length} legacy-правил. Они остаются активны в каталоге, но редактирование и добавление правил отключены.</p>}
          <div className="product-group-preview"><strong>Предпросмотр:</strong><select value={city} onChange={(event) => setCity(event.target.value)}>{options.cities.map((item) => <option value={item.slug} key={item.id}>{item.name}</option>)}</select><span>{detail ? (detail.previewCount === null ? "Выберите город" : `${detail.previewCount} товаров`) : "Сохраните группу для предпросмотра"}</span><span>{selectedProductsCount} товаров · {selectedCount} вариантов</span></div>
          <div className="product-group-subsection product-group-manual-section"><div className="product-group-section-heading"><div><h3>Ручной состав</h3><p>Выбирайте конкретные варианты. Поиск работает по названию товара и SKU.</p></div><span className="product-group-count">{selectedCount} выбрано</span></div>
            <div className="product-group-search"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск товара или SKU"/><span>{optionsLoading ? <LoaderCircle className="spin" size={15}/> : `${options.products.length} товаров`}</span></div>
            <div className="product-group-picker-layout"><div className="product-group-products-picker">{optionsLoading && options.products.length === 0 ? <div className="admin-empty"><LoaderCircle className="spin" size={20}/> Загрузка вариантов…</div> : options.products.length === 0 ? <div className="admin-empty">Поиск не дал результатов.</div> : options.products.map((product) => { const isOpen = expanded.has(product.id); const available = product.variants ?? []; const selected = available.filter((variant) => selectedVariants.has(variant.id)); return <div className="product-group-product-picker" key={product.id}><button type="button" className="product-group-product-head" aria-expanded={isOpen} onClick={() => setExpanded((current) => { const next = new Set(current); next.has(product.id) ? next.delete(product.id) : next.add(product.id); return next; })}><span>{isOpen ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}<strong>{product.brandName} · {product.name}</strong><small>{product.typeName} · {selected.length}/{available.length} вариантов</small></span></button>{isOpen && <div className="product-group-variant-list">{available.length === 0 ? <span className="admin-muted">Для выбранного города нет активных вариантов с inventory.</span> : available.map((variant) => { const isSelected = selectedVariants.has(variant.id); return <label className={`product-group-variant-row${isSelected ? " is-selected" : ""}${detailIds.has(variant.id) ? " is-persisted" : ""}`} key={variant.id}><input type="checkbox" checked={isSelected} disabled={busy || (hasLegacy && isSelected && detailIds.has(variant.id))} onChange={(event) => setSelectedVariants((current) => { const next = new Set(current); event.target.checked ? next.add(variant.id) : next.delete(variant.id); return next; })}/><span><strong>{characteristics(variant)}</strong><small><b>{variant.sku}</b> · {price(variant.price)} · {availability(variant.availability, variant.allowPreorder)}{variant.stock !== null ? ` · остаток ${variant.stock}` : ""}</small></span>{detailIds.has(variant.id) && <em>Сохранён</em>}</label>; })}</div>}</div>; })}</div>
              <aside className="product-group-selection-panel"><div className="product-group-selection-head"><div><h4>Выбранные варианты</h4><small>{selectedProductsCount} товаров · {selectedCount} вариантов</small></div><span className="admin-muted">Сохраняются кнопкой выше</span></div>{selectedDisplay.length === 0 ? <div className="admin-empty">Выберите варианты слева.</div> : <div className="product-group-selected-groups">{selectedDisplay.map((group) => <section className="product-group-selected-product" key={group.id}><strong>{group.name}</strong>{group.variants.map((variant) => <div className="product-group-row" key={variant.id}><span><b>{characteristics(variant)}</b><small>{variant.sku} · {price(variant.price)} · {variant.persisted ? "Сохранён" : "Не сохранён"}</small></span><button type="button" className="icon-action" disabled={busy || (hasLegacy && variant.persisted)} title={variant.persisted && hasLegacy ? "Legacy-состав не изменяется автоматически" : "Убрать вариант из выбора"} onClick={() => setSelectedVariants((current) => { const next = new Set(current); next.delete(variant.id); return next; })}><X size={15}/> Убрать</button></div>)}</section>)}</div>}</aside>
            </div>
          </div>
        </>}
      </section>
    </div>
  </main>;
}
