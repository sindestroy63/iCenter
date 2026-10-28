"use client";
import { useEffect,useMemo,useState,type ChangeEvent } from "react";
import { ChevronDown,ChevronUp,ImagePlus,Plus,Search,Trash2,X } from "lucide-react";
import { DICTIONARY_REGISTRY,isAttributeApplicable,compareMemoryValues,type DictionaryCode,type ProductTypeCode } from "@/lib/product-dictionaries";
type Option={
  id: string;
  name: string;
  slug?: string;
  canonicalKey?: string;
  brandId?: string|null;
  brandIds?: string[];
  globalTypeKey?: string|null;
  globalTypeId?: string;
};
type City=Option&{
  slug: string;
};
type Inventory={
  cityId: string;
  price: number|null;
  oldPrice: number|null;
  availability: string;
  allowPreorder: boolean;
  deliveryTime: string|null;
};
type Variant={
  id?: string;
  sku?: string;
  label?: string;
  colorId: string|null;
  storage: string;
  ram: string;
  simType: string;
  connectivity: string;
  size: string;
  material: string;
  dictionaryOptionIds: Record<string,string|null>;
  attributes: Record<string,unknown>;
  active: boolean;
  inventory: Record<string,Inventory>;
  presentCities: Set<string>;
};
type ImageLink={
  mediaId: string;
  colorId: string|null;
  sortOrder: number;
};
type Product={
  id?: string;
  name: string;
  slug: string;
  brandId: string;
  productTypeId: string;
  globalProductTypeId?: string;
  modelId: string|null;
  productLineId: string|null;
  categoryId: string;
  model: string;
  generation: string;
  chip: string;
  displaySize: string;
  releaseYear: string;
  description: string;
  dictionaryOptionIds: Record<string,string|null>;
  specifications: Record<string,unknown>;
  relatedProductIds: string[];
  isNew: boolean;
  status: string;
  variants: Variant[];
  images: ImageLink[];
};
type Media={
  id: string;
  filename: string;
  url: string;
  alt: string|null;
  used: boolean;
};
type Payload={
  data: any[];
  options: {
    brands: Option[];
    types: Array<Option&{
      brandId?: string;
      brandIds?: string[];
      variantAttributes?: unknown;
    }>;
    categories: Array<Option&{
      parentId: string|null;
    }>;
    colors: Option[];
    cities: City[];
    models: Array<Option&{ brandId: string; globalProductTypeId: string; isActive: boolean }>;
  };
};
type DictionaryEntry={
  id: string;
  dictionary: string;
  canonicalKey: string;
  label: string;
  isActive: boolean;
};
type Tab="main"|"variants"|"images"|"specs"|"related";
const tabItems: Array<{
  id: Tab;
  label: string;
}>=[{ id: "main",label: "Основное" },{ id: "variants",label: "Варианты" },{ id: "related",label: "Сопутствующие" }];
const variantNames={} as Record<"storage"|"ram"|"simType"|"connectivity"|"size"|"material",string>;
const emptyProduct=(): Product => ({ name: "",slug: "",brandId: "",productTypeId: "",modelId: null,productLineId: null,categoryId: "",model: "",generation: "",chip: "",displaySize: "",releaseYear: "",description: "",dictionaryOptionIds: {},specifications: {},relatedProductIds: [],isNew: false,status: "DRAFT",variants: [emptyVariant()],images: [] });
function emptyVariant(): Variant { return { colorId: null,storage: "",ram: "",simType: "",connectivity: "",size: "",material: "",dictionaryOptionIds: {},attributes: {},active: true,inventory: {},presentCities: new Set() }; }
function slugify(value: string) { const translit: Record<string,string>={ а: "a",б: "b",в: "v",г: "g",д: "d",е: "e",ё: "yo",ж: "zh",з: "z",и: "i",й: "y",к: "k",л: "l",м: "m",н: "n",о: "o",п: "p",р: "r",с: "s",т: "t",у: "u",ф: "f",х: "h",ц: "ts",ч: "ch",ш: "sh",щ: "sch",ъ: "",ы: "y",ь: "",э: "e",ю: "yu",я: "ya" }; return value.toLowerCase().replace(/[а-яё]/g,(char) => translit[char]??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
function uniqueSlugPreview(value: string,rows: Array<{
  slug: string;
}>) {
  const base=slugify(value)||"product"; const used=new Set(rows.map((row) => row.slug)); if(!used.has(base))
    return base; let suffix=2; while(used.has(`${base}-${suffix}`))
    suffix+=1; return `${base}-${suffix}`;
}
function csrf() { return decodeURIComponent(document.cookie.split("; ").find((item) => item.startsWith("icenter_csrf="))?.split("=")[1]??""); }
function parsePairs(value: unknown): Record<string,unknown> {
  if(!value||typeof value!=="object"||Array.isArray(value))
    return {}; return value as Record<string,unknown>;
}
function formatValue(value: unknown) { return typeof value==="string"||typeof value==="number"? String(value):value==null? "":JSON.stringify(value); }
function inventoryFor(city: City,value?: any): Inventory { return { cityId: city.id,price: value?.price??null,oldPrice: value?.oldPrice??null,availability: value?.availability??"UNSPECIFIED",allowPreorder: value?.allowPreorder??false,deliveryTime: value?.deliveryTime??null }; }
function productFromRow(row: any,cities: City[]): Product {
  return { id: row.id,name: row.name,slug: row.slug,brandId: row.brandId,productTypeId: row.productTypeId,modelId: row.modelId??null,productLineId: row.productLineId??null,categoryId: row.categoryId,model: row.model??"",generation: row.generation??"",chip: row.chip??"",displaySize: row.displaySize??"",releaseYear: row.releaseYear? String(row.releaseYear):"",description: row.description??"",dictionaryOptionIds: row.dictionaryOptionIds??{},specifications: parsePairs(row.specifications),relatedProductIds: row.relatedProductIds??[],isNew: Boolean(row.isNew),status: row.status,variants: (row.variants??[]).map((variant: any) => ({ id: variant.id,sku: variant.sku,label: variant.label,colorId: variant.colorId??null,storage: variant.storage??"",ram: variant.ram??"",simType: variant.simType??"",connectivity: variant.connectivity??"",size: variant.size??"",material: variant.material??"",dictionaryOptionIds: variant.dictionaryOptionIds??{},attributes: parsePairs(variant.attributes),active: variant.active!==false,inventory: Object.fromEntries(cities.map((city) => [city.id,inventoryFor(city,variant.inventory?.find((item: any) => item.cityId===city.id))])),presentCities: new Set<string>((variant.inventory??[]).map((item: any) => item.cityId)) })),images: (row.images??[]).map((image: any) => ({ mediaId: image.mediaId,colorId: image.colorId??null,sortOrder: image.sortOrder??0 })) };
}
function publicationReason(row: any) {
  if(row.status!=="PUBLISHED")
    return "Не опубликован";
  if(!row.variants?.some((variant: any) => variant.active&&Object.keys(variant.inventory??{}).length>0))
    return "Нет активного варианта с наличием по городу";
  return "";
}
function attributesFor(type?: Payload["options"]["types"][number]) {
  const value=type?.variantAttributes; if(Array.isArray(value))
    return value.map((item) => typeof item==="string"? item:item&&typeof item==="object"&&"name" in item? String((item as {
      name: unknown;
    }).name):"").filter(Boolean); if(value&&typeof value==="object")
    return Object.keys(value as Record<string,unknown>); return [];
}
export default function AdminProductsBackend() {
  const [payload,setPayload]=useState<Payload|null>(null);
  const [media,setMedia]=useState<Media[]>([]);
  const [editing,setEditing]=useState<Product|null>(null);
  const [tab,setTab]=useState<Tab>("main");
  const [selectedVariant,setSelectedVariant]=useState(0);
  const [query,setQuery]=useState("");
  const [loadError,setLoadError]=useState("");
  const [formError,setFormError]=useState("");
  const [dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(false);
  const [dictionaryOptions,setDictionaryOptions]=useState<DictionaryEntry[]>([]);
  const load=async () => {
    setLoadError("");
    try {
      const [productsResponse,mediaResponse]=await Promise.all([fetch("/api/admin/products",{ cache: "no-store" }),fetch("/api/admin/media",{ cache: "no-store" })]);
      const productsData=await productsResponse.json().catch(() => ({}));
      if(!productsResponse.ok)
        throw new Error(productsData.error||(productsResponse.status===401? "Сессия истекла. Войдите снова.":`Не удалось загрузить каталог (${productsResponse.status}).`));
      if(!Array.isArray(productsData.data)||!productsData.options)
        throw new Error("Сервер вернул некорректный ответ каталога.");
      setPayload(productsData);
      if(mediaResponse.ok) {
        const mediaData=await mediaResponse.json();
        setMedia(Array.isArray(mediaData.data)? mediaData.data:[]);
      }
      else
        setMedia([]);
    }
    catch(error) {
      setLoadError(error instanceof Error? error.message:"Не удалось загрузить каталог.");
    }
  };
  useEffect(() => { void load(); },[]);
  useEffect(() => {
    fetch("/api/admin/dictionaries",{ cache: "no-store" }).then((response) => response.ok? response.json():null).then((data) => {
      if(Array.isArray(data?.data))
        setDictionaryOptions(data.data);
    }).catch(() => undefined);
  },[]);
  useEffect(() => {
    if(!editing)
      return; const beforeUnload=(event: BeforeUnloadEvent) => {
        if(!dirty)
          return; event.preventDefault(); event.returnValue="";
      }; window.addEventListener("beforeunload",beforeUnload); return () => window.removeEventListener("beforeunload",beforeUnload);
  },[editing,dirty]);
  const filtered=useMemo(() => (payload?.data??[]).filter((row) => `${row.name} ${row.slug} ${row.variants.map((variant: any) => variant.sku).join(" ")}`.toLowerCase().includes(query.toLowerCase())),[payload,query]);
  const activeType=payload?.options.types.find((item) => item.id===editing?.productTypeId);
  const attributeNames: string[]=[];
  const closeEditor=() => {
    if(dirty&&!window.confirm("Есть несохранённые изменения. Закрыть редактор без сохранения?"))
      return; setEditing(null); setDirty(false); setFormError("");
  };
  const startEdit=(row?: any) => {
    if(!payload)
      return; if(!row) {
        const product=emptyProduct();
        product.brandId=payload.options.brands[0]?.id??"";
        product.productTypeId=payload.options.types.find((item) => item.brandId===product.brandId)?.id??"";
        product.categoryId=payload.options.categories[0]?.id??"";
        setEditing(product);
      }
    else
      setEditing(productFromRow(row,payload.options.cities)); setTab("main"); setSelectedVariant(0); setDirty(false); setFormError("");
  };
  const update=(patch: Partial<Product>) => setEditing((current) => current? { ...current,...patch }:current);
  const patchVariant=(index: number,patch: Partial<Variant>) => setEditing((current) => current? { ...current,variants: current.variants.map((variant,itemIndex) => itemIndex===index? { ...variant,...patch }:variant) }:current);
  const patchInventory=(variantIndex: number,cityId: string,patch: Partial<Inventory>) => setEditing((current) => current? { ...current,variants: current.variants.map((variant,itemIndex) => itemIndex===variantIndex? { ...variant,inventory: { ...variant.inventory,[cityId]: { ...variant.inventory[cityId],cityId,...patch } } }:variant) }:current);
  const patchImage=(index: number,patch: Partial<ImageLink>) => setEditing((current) => current? { ...current,images: current.images.map((image,itemIndex) => itemIndex===index? { ...image,...patch }:image) }:current);
  const addPair=(kind: "product"|"variant") => {
    if(!editing)
      return; const source=kind==="product"? editing.specifications:editing.variants[selectedVariant]?.attributes??{}; let suffix=Object.keys(source).length+1; let name=`Новая характеристика ${suffix}`; while(Object.hasOwn(source,name))
      name=`Новая характеристика ${++suffix}`; if(kind==="product")
      update({ specifications: { ...source,[name]: "" } });
    else
      patchVariant(selectedVariant,{ attributes: { ...source,[name]: "" } }); setDirty(true);
  };
  const updatePair=(kind: "product"|"variant",oldName: string,key: "name"|"value",value: string) => {
    if(!editing)
      return; const source=kind==="product"? editing.specifications:editing.variants[selectedVariant]?.attributes??{}; const entries=Object.entries(source); const index=entries.findIndex(([name]) => name===oldName); if(index<0||key==="name"&&value!==oldName&&Object.hasOwn(source,value))
      return; const [name,current]=entries[index]; entries[index]=key==="name"? [value,current]:[name,value]; const next=Object.fromEntries(entries); if(kind==="product")
      update({ specifications: next });
    else
      patchVariant(selectedVariant,{ attributes: next }); setDirty(true);
  };
  const removePair=(kind: "product"|"variant",name: string) => {
    if(!editing)
      return; const source=kind==="product"? editing.specifications:editing.variants[selectedVariant]?.attributes??{}; const next={ ...source }; delete next[name]; if(kind==="product")
      update({ specifications: next });
    else
      patchVariant(selectedVariant,{ attributes: next }); setDirty(true);
  };
  const save=async () => {
    if(!editing||!payload)
      return;
    if(!editing.name.trim()||!editing.brandId||!editing.productTypeId||!editing.categoryId||!editing.slug.trim()) {
      setTab("main");
      setFormError("Заполните название, slug, бренд, тип и категорию.");
      return;
    }
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(editing.slug)) {
      setTab("main");
      setFormError("Slug может содержать латинские буквы, цифры и дефисы.");
      return;
    }
    if(!editing.variants.length) {
      setTab("variants");
      setFormError("Добавьте хотя бы один вариант товара.");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const csrfValue=csrf();
      if(!csrfValue)
        throw new Error("Сессия или CSRF-токен недоступны. Войдите повторно.");
      const body={ ...editing,images: editing.images.filter((image) => image.mediaId),releaseYear: editing.releaseYear? Number(editing.releaseYear):null,variants: editing.variants.map(({ presentCities,...variant }) => ({ ...variant,inventory: Object.values(variant.inventory).filter((record) => presentCities.has(record.cityId)||record.price!==null||record.oldPrice!==null||record.availability!=="UNSPECIFIED"||record.allowPreorder||record.deliveryTime) })) };
      const response=await fetch("/api/admin/products",{ method: editing.id? "PATCH":"POST",headers: { "content-type": "application/json","x-csrf-token": csrfValue },body: JSON.stringify(editing.id? { id: editing.id,data: body }:body) });
      const result=await response.json().catch(() => ({}));
      if(!response.ok)
        throw new Error(result.error||`Не удалось сохранить товар (${response.status}).`);
      setEditing(null);
      setDirty(false);
      await load();
    }
    catch(error) {
      setFormError(error instanceof Error? error.message:"Не удалось сохранить товар.");
    }
    finally {
      setBusy(false);
    }
  };
  const setField=(patch: Partial<Product>) => {
    update(patch); setDirty(true); if(formError)
      setFormError("");
  };
  const setVariantField=(index: number,patch: Partial<Variant>) => {
    patchVariant(index,patch); setDirty(true); if(formError)
      setFormError("");
  };
  const setInventoryField=(variantIndex: number,cityId: string,patch: Partial<Inventory>) => { patchInventory(variantIndex,cityId,patch); setDirty(true); };
  const setImageField=(index: number,patch: Partial<ImageLink>) => {
    const current=editing?.images[index]; if(!editing||!current)
      return; const mediaId=patch.mediaId??current.mediaId; const colorId=patch.colorId===undefined? current.colorId:patch.colorId; if(mediaId&&editing.images.some((image,itemIndex) => itemIndex!==index&&image.mediaId===mediaId&&image.colorId===colorId)) {
        setFormError("Это фото уже добавлено в выбранную галерею.");
        return;
      } patchImage(index,patch); setDirty(true);
  };
  return <div className="admin-content admin-workspace">
    <div className="workspace-head"><div><h1>Товары</h1><p>Каталог PostgreSQL · изменения сохраняются после подтверждения</p></div><button type="button" className="admin-primary" onClick={() => startEdit()}><Plus size={16} />Добавить товар</button></div>
    <div className="workspace-toolbar"><label className="admin-field-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию, slug или SKU" /></label></div>
    {loadError? <div className="panel admin-products-load-error" role="alert"><p>{loadError}</p><button className="admin-secondary" type="button" onClick={() => void load()}>Повторить загрузку</button></div>:!payload? <div className="panel">Загрузка каталога…</div>:filtered.length? <div className="workspace-table panel"><table className="table"><thead><tr><th>Товар</th><th>Бренд</th><th>Категория</th><th>Варианты</th><th>Статус</th><th /></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.slug}</small></td><td>{row.brandName}</td><td>{row.categoryName}</td><td>{row.variants.length}</td><td><span>{row.status}</span>{publicationReason(row)&&<small className="admin-publication-warning">{publicationReason(row)}</small>}</td><td><button type="button" className="admin-secondary" onClick={() => startEdit(row)}>Изменить</button></td></tr>)}</tbody></table></div>:<div className="panel">Товаров не найдено.</div>}
    {editing&&payload&&<div className="admin-modal-backdrop admin-product-editor-backdrop" onMouseDown={(event) => {
      if(event.target===event.currentTarget)
        closeEditor();
    }}>
      <ProductEditor title={editing.id? "Редактирование товара":"Новый товар"} editing={editing} payload={payload} media={media} activeTab={tab} setActiveTab={setTab} selectedVariant={selectedVariant} setSelectedVariant={setSelectedVariant} attributeNames={attributeNames} activeType={activeType} dirty={dirty} error={formError} busy={busy} setField={setField} setVariantField={setVariantField} setInventoryField={setInventoryField} setImageField={setImageField} addVariant={() => { update({ variants: [...editing.variants,emptyVariant()] }); setSelectedVariant(editing.variants.length); setDirty(true); }} removeVariant={(index) => {
        if(editing.variants[index]?.id)
          return; if(editing.variants.length<2) {
            setFormError("У товара должен остаться хотя бы один вариант.");
            return;
          } update({ variants: editing.variants.filter((_,itemIndex) => itemIndex!==index) }); setSelectedVariant(Math.max(0,Math.min(selectedVariant,editing.variants.length-2))); setDirty(true);
      }} makeMainImage={(index) => {
        const image=editing.images[index]; if(!image)
          return; const next=editing.images.map((item) => ({ ...item })); next.forEach((item,itemIndex) => {
            if(item.colorId===image.colorId&&item.sortOrder<image.sortOrder)
              item.sortOrder+=1;
          }); next[index].sortOrder=0; update({ images: next }); setDirty(true);
      }} addImage={(colorId) => { update({ images: [...editing.images,{ mediaId: "",colorId,sortOrder: editing.images.filter((image) => image.colorId===colorId).length }] }); setDirty(true); }} removeImage={(index) => { update({ images: editing.images.filter((_,itemIndex) => itemIndex!==index) }); setDirty(true); }} addPair={addPair} updatePair={updatePair} removePair={removePair} upload={async (file,colorId) => {
        const csrfValue=csrf(); if(!csrfValue)
          throw new Error("Сессия или CSRF-токен недоступны. Войдите повторно."); const data=new FormData(); data.set("file",file); const response=await fetch("/api/admin/media",{ method: "POST",headers: { "x-csrf-token": csrfValue },body: data }); const result=await response.json().catch(() => ({})); if(!response.ok)
          throw new Error(result.error||`Не удалось загрузить изображение (${response.status}).`); const uploaded=result.data as Media; setMedia((items) => [uploaded,...items]); update({ images: [...editing.images,{ mediaId: uploaded.id,colorId,sortOrder: editing.images.filter((image) => image.colorId===colorId).length }] }); setDirty(true);
      }} close={closeEditor} save={() => void save()} />
    </div>}
  </div>;
}
function ProductEditor(props: {
  title: string;
  editing: Product;
  payload: Payload;
  media: Media[];
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  selectedVariant: number;
  setSelectedVariant: (index: number) => void;
  attributeNames: string[];
  activeType?: Payload["options"]["types"][number];
  dirty: boolean;
  error: string;
  busy: boolean;
  setField: (patch: Partial<Product>) => void;
  setVariantField: (index: number,patch: Partial<Variant>) => void;
  setInventoryField: (index: number,cityId: string,patch: Partial<Inventory>) => void;
  setImageField: (index: number,patch: Partial<ImageLink>) => void;
  addVariant: () => void;
  removeVariant: (index: number) => void;
  makeMainImage: (index: number) => void;
  addImage: (colorId: string|null) => void;
  removeImage: (index: number) => void;
  addPair: (kind: "product"|"variant") => void;
  updatePair: (kind: "product"|"variant",oldName: string,key: "name"|"value",value: string) => void;
  removePair: (kind: "product"|"variant",name: string) => void;
  upload: (file: File,colorId: string|null) => Promise<void>;
  close: () => void;
  save: () => void;
}) {
  const { editing,payload,media,selectedVariant,setSelectedVariant }=props;
  const [registeredOptions,setRegisteredOptions]=useState<DictionaryEntry[]>([]);
  const [selectedCity,setSelectedCity]=useState(payload.options.cities[0]?.id??"");
  const [variantFilters,setVariantFilters]=useState({ memory:"", color:"", sim:"", activity:"all", price:"all" });
  useEffect(() => {
    if(!payload.options.cities.some((city) => city.id===selectedCity)) setSelectedCity(payload.options.cities[0]?.id??"");
  },[payload.options.cities,selectedCity]);
  useEffect(() => {
    const controller=new AbortController();
    fetch("/api/admin/dictionaries",{ signal: controller.signal,cache: "no-store" }).then((response) => response.ok? response.json():null).then((result) => {
      if(!controller.signal.aborted&&Array.isArray(result?.data))
        setRegisteredOptions(result.data);
    }).catch(() => undefined);
    return () => controller.abort();
  },[]);
  const optionsFor=(dictionary: string,legacyValue="") => {
    const registered=registeredOptions.filter((entry) => entry.dictionary===dictionary&&entry.isActive);
    const ids=new Set(registered.map((entry) => entry.id));
    const selectedId=editing.dictionaryOptionIds[dictionary]??variant?.dictionaryOptionIds[dictionary]??"";
    const legacy=legacyValue&&!registered.some((entry) => entry.label===legacyValue)? [{ id: "",dictionary,canonicalKey: "legacy:unmapped",label: `${legacyValue} (текущее значение)`,isActive: false }]:[];
    const rows=[...legacy,...registered];
    return { rows,selectedId: ids.has(selectedId)? selectedId:selectedId===""&&legacy.length? "":selectedId };
  };
  const chooseVariantOption=(dictionary: string,field: keyof Variant,id: string) => {
    const option=registeredOptions.find((entry) => entry.id===id&&entry.dictionary===dictionary);
    const current=editing.variants[selectedVariant];
    props.setVariantField(selectedVariant,{ [field]: option?.label??"",dictionaryOptionIds: { ...current.dictionaryOptionIds,[dictionary]: id||null } } as Partial<Variant>);
  };
  const chooseProductOption=(dictionary: string,field: "chip"|"model",id: string) => {
    const option=registeredOptions.find((entry) => entry.id===id&&entry.dictionary===dictionary);
    const current=editing.dictionaryOptionIds;
    props.setField({ [field]: option?.label??"",dictionaryOptionIds: { ...current,[dictionary]: id||null } } as Partial<Product>);
  };
  const updateVariantAttributes=(dictionaryOptionIds: Record<string,string|null>,attributes: Record<string,unknown>,changedCode: string,optionId: string|null) => {
    const field=({ memory: "storage",ram: "ram",sim: "simType",connectivity: "connectivity",size: "size",material: "material" } as Record<string,keyof Variant|undefined>)[changedCode];
    const option=optionId? registeredOptions.find((item) => item.dictionary===changedCode&&item.id===optionId):undefined;
    props.setVariantField(selectedVariant,{ dictionaryOptionIds,attributes,...(field? { [field]: option?.label??"" }: {}) } as Partial<Variant>);
  };
  const variant=editing.variants[selectedVariant];
  const sharedImages=editing.images.map((image,index) => ({ image,index })).filter(({ image }) => image.colorId===null);
  const variantsLabel=(item: Variant,index: number) => [payload.options.colors.find((color) => color.id===item.colorId)?.name,item.storage,item.ram].filter(Boolean).join(" · ")||`Вариант ${index+1}`;
  const memoryOptions=Array.from(new Set(editing.variants.map((item) => item.storage).filter(Boolean))).sort(compareMemoryValues);
  const colorOptions=Array.from(new Set(editing.variants.map((item) => item.colorId).filter(Boolean))).map((id) => payload.options.colors.find((item) => item.id===id)).filter((item): item is Option => Boolean(item)).sort((a,b) => a.name.localeCompare(b.name,"ru"));
  const simOptions=Array.from(new Set(editing.variants.map((item) => item.simType || registeredOptions.find((option) => option.id===item.dictionaryOptionIds.sim)?.label || "").filter(Boolean))).sort((a,b) => a.localeCompare(b,"ru"));
  const filteredVariants=editing.variants.map((item,index) => ({ item,index })).filter(({ item }) => {
    const priceState=Object.values(item.inventory).some((record) => record.price!==null) ? "with" : "without";
    return (!variantFilters.memory || item.storage===variantFilters.memory)
      && (!variantFilters.color || item.colorId===variantFilters.color)
      && (!variantFilters.sim || (item.simType || registeredOptions.find((option) => option.id===item.dictionaryOptionIds.sim)?.label)===variantFilters.sim)
      && (variantFilters.activity==="all" || (variantFilters.activity==="active" ? item.active : !item.active))
      && (variantFilters.price==="all" || variantFilters.price===priceState);
  });
  useEffect(() => {
    if (filteredVariants.some(({ index }) => index===selectedVariant)) return;
    if (filteredVariants[0]) setSelectedVariant(filteredVariants[0].index);
  }, [filteredVariants,selectedVariant,setSelectedVariant]);
  return <section className="admin-modal admin-product-editor" role="dialog" aria-modal="true" aria-label={props.title}>
    <header className="admin-product-editor-head"><div><h2>{props.title}</h2><p>{props.dirty? "Есть несохранённые изменения":"Все данные загружены из каталога"}</p></div><button type="button" onClick={props.close} aria-label="Закрыть"><X size={19} /></button></header>
    <nav className="admin-product-editor-tabs" role="tablist" aria-label="Разделы товара">{tabItems.map((item) => <button type="button" key={item.id} role="tab" aria-selected={props.activeTab===item.id} className={props.activeTab===item.id? "active":""} onClick={() => props.setActiveTab(item.id)}>{item.label}{item.id==="variants"? <small>{editing.variants.length}</small>:null}</button>)}</nav>
    <div className="admin-product-editor-body">

      {props.activeTab==="main"&&<div className="admin-product-editor-panel"><div className="admin-product-section-title"><div><h3>Основная информация</h3><p>Название, связь со справочниками и видимость товара</p></div></div><div className="admin-product-fields"><label className="wide">Название <sup>*</sup><input required autoFocus value={editing.name} onChange={(event) => props.setField({ name: event.target.value,slug: editing.id? editing.slug:uniqueSlugPreview(event.target.value,payload.data) })} /></label><label>Slug <sup>*</sup><input required readOnly value={editing.slug} aria-readonly="true" /><small>Формируется автоматически; не меняется после создания</small></label><label>Бренд <sup>*</sup><select required value={editing.brandId} onChange={(event) => { const brandId=event.target.value; props.setField({ brandId,productTypeId: payload.options.types.find((item) => item.brandId===brandId)?.id??"" }); }}><option value="">Выберите бренд</option>{payload.options.brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Тип товара <sup>*</sup><select required value={editing.productTypeId} onChange={(event) => props.setField({ productTypeId: event.target.value })}><option value="">Выберите тип</option>{payload.options.types.filter((item) => item.brandId===editing.brandId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Категория <sup>*</sup><select required value={editing.categoryId} onChange={(event) => props.setField({ categoryId: event.target.value })}><option value="">Выберите категорию</option>{payload.options.categories.map((item) => <option key={item.id} value={item.id}>{item.parentId? "↳ ":""}{item.name}</option>)}</select></label><label>Статус<select value={editing.status} onChange={(event) => props.setField({ status: event.target.value })}><option value="DRAFT">Черновик</option><option value="PUBLISHED">Опубликован</option><option value="HIDDEN">Скрыт</option><option value="ARCHIVED">Архив</option></select></label><label className="wide">Описание<textarea rows={5} value={editing.description} onChange={(event) => props.setField({ description: event.target.value })} /></label></div><div className="admin-product-inline-fields"><label className="admin-check"><input type="checkbox" checked={editing.isNew} onChange={(event) => props.setField({ isNew: event.target.checked })} />Новинка</label></div></div>}
      {props.activeTab==="variants"&&<div className="admin-product-editor-panel"><div className="admin-product-section-title"><div><h3>Варианты и цены</h3><p>Выберите вариант, чтобы изменить его параметры, городские цены и фотографии</p></div><button type="button" className="admin-secondary" onClick={props.addVariant}><Plus size={15} />Добавить вариант</button></div><div className="admin-variant-filters"><label>Память<select value={variantFilters.memory} onChange={(event) => setVariantFilters((current) => ({ ...current,memory:event.target.value }))}><option value="">Все</option>{memoryOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Цвет<select value={variantFilters.color} onChange={(event) => setVariantFilters((current) => ({ ...current,color:event.target.value }))}><option value="">Все</option>{colorOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>SIM<select value={variantFilters.sim} onChange={(event) => setVariantFilters((current) => ({ ...current,sim:event.target.value }))}><option value="">Все</option>{simOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Активность<select value={variantFilters.activity} onChange={(event) => setVariantFilters((current) => ({ ...current,activity:event.target.value }))}><option value="all">Все</option><option value="active">Активные</option><option value="inactive">Неактивные</option></select></label><label>Цена<select value={variantFilters.price} onChange={(event) => setVariantFilters((current) => ({ ...current,price:event.target.value }))}><option value="all">Все</option><option value="with">С ценой</option><option value="without">Без цены</option></select></label><button type="button" className="admin-secondary admin-variant-filter-reset" onClick={() => setVariantFilters({ memory:"",color:"",sim:"",activity:"all",price:"all" })}>Сбросить</button><span className="admin-variant-filter-count">Показано {filteredVariants.length} из {editing.variants.length}</span></div><div className="admin-variant-layout"><div className="admin-variant-list" role="tablist" aria-label="Варианты товара">{filteredVariants.map(({ item,index }) => <div key={item.id??`new-${index}`} className={selectedVariant===index? "selected":""}><button type="button" onClick={() => setSelectedVariant(index)}><strong>{variantsLabel(item,index)}</strong><small>{item.sku??"SKU при сохранении"}</small><span className={item.active? "variant-status-active":"variant-status-inactive"}>{item.active? "Активен":"Неактивен"}</span></button><label className="variant-active-toggle" title={item.active? "Деактивировать вариант":"Активировать вариант"}><input type="checkbox" checked={item.active} onChange={(event) => props.setVariantField(index,{ active:event.target.checked })} /><span aria-hidden="true" /></label>{!item.id&&<button type="button" className="remove" aria-label={`Убрать ${variantsLabel(item,index)}`} onClick={() => props.removeVariant(index)}><Trash2 size={15} /></button>}</div>)}</div>{variant? <div className="admin-variant-detail"><div className="admin-product-fields"><label>SKU<input readOnly value={variant.sku??"Создаётся автоматически"} /></label><label>Цвет<select value={variant.colorId??""} onChange={(event) => props.setVariantField(selectedVariant,{ colorId: event.target.value||null })}><option value="">Без цвета</option>{payload.options.colors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{(Object.keys(variantNames) as Array<keyof typeof variantNames>).filter((key) => !props.attributeNames.some((name) => name.toLowerCase()===variantNames[key].toLowerCase())).map((key) => <label key={key}>{variantNames[key]}<input value={variant[key]} onChange={(event) => props.setVariantField(selectedVariant,{ [key]: event.target.value })} /></label>)}<label className="admin-check"><input type="checkbox" checked={variant.active} onChange={(event) => props.setVariantField(selectedVariant,{ active: event.target.checked })} />Вариант активен</label></div><VariantAttributesEditor key={variant.id??selectedVariant} variant={variant} variantKey={variant.id??selectedVariant} options={registeredOptions} onChange={updateVariantAttributes} /><div className="admin-city-table-wrap"><table className="admin-city-table"><thead><tr><th>Город</th><th>Цена</th><th>Старая цена</th><th>Доступность</th></tr></thead><tbody>{payload.options.cities.map((city) => { const inventory=variant.inventory[city.id]??inventoryFor(city); return <tr key={city.id}><th>{city.name}</th><td><input aria-label={`Цена, ${city.name}`} type="number" min="0" step="0.01" value={inventory.price??""} onChange={(event) => props.setInventoryField(selectedVariant,city.id,{ price: event.target.value===""? null:Number(event.target.value),...(event.target.value!==""? { availability: inventory.availability==="UNSPECIFIED"? "IN_STOCK":inventory.availability }:{}) })} /></td><td><input aria-label={`Старая цена, ${city.name}`} type="number" min="0" step="0.01" value={inventory.oldPrice??""} onChange={(event) => props.setInventoryField(selectedVariant,city.id,{ oldPrice: event.target.value===""? null:Number(event.target.value) })} /></td><td><select aria-label={`Доступность, ${city.name}`} value={inventory.availability} onChange={(event) => props.setInventoryField(selectedVariant,city.id,{ availability: event.target.value })}><option value="UNSPECIFIED">Не указана</option><option value="IN_STOCK">В наличии</option><option value="PREORDER">Предзаказ</option><option value="OUT_OF_STOCK">Нет в наличии</option></select></td></tr>; })}</tbody></table></div><ProductGalleryPanel title="Фотографии варианта" images={editing.images} scopeColorId={variant.colorId} colorName={payload.options.colors.find((item) => item.id===variant.colorId)?.name??null} media={media} upload={props.upload} addImage={props.addImage} setImageField={props.setImageField} makeMainImage={props.makeMainImage} removeImage={props.removeImage} /></div>:null}</div></div>}
      {props.activeTab==="images"&&<div className="admin-product-editor-panel"><div className="admin-product-section-title"><div><h3>Общая галерея товара</h3><p>Эти фотографии используются для вариантов без галереи собственного цвета.</p></div></div><ProductGalleryPanel title="Общие фотографии" images={editing.images} scopeColorId={null} colorName={null} media={media} upload={props.upload} addImage={props.addImage} setImageField={props.setImageField} makeMainImage={props.makeMainImage} removeImage={props.removeImage} /></div>}
      {props.activeTab==="specs"&&<DictionaryAssignmentPanel product={editing} variant={variant} options={registeredOptions} typeKey={props.activeType?.globalTypeKey??null} brands={payload.options.brands} onProduct={(dictionary,id) => {
        const option=registeredOptions.find((item) => item.id===id); const ids={ ...editing.dictionaryOptionIds,[dictionary]: id||null }; if(dictionary==="chip")
          props.setField({ chip: option?.label??"",dictionaryOptionIds: ids });
        else {
          const specifications={ ...editing.specifications };
          if(option)
            specifications[dictionary]=option.label;
          else
            delete specifications[dictionary];
          props.setField({ specifications,dictionaryOptionIds: ids });
        }
      }} onVariant={(dictionary,id) => {
        const option=registeredOptions.find((item) => item.id===id); const ids={ ...variant.dictionaryOptionIds,[dictionary]: id||null }; const field=({ memory: "storage",ram: "ram",sim: "simType",connectivity: "connectivity",size: "size",material: "material" } as Record<string,keyof Variant>)[dictionary]; if(field)
          props.setVariantField(selectedVariant,{ [field]: option?.label??"",dictionaryOptionIds: ids } as Partial<Variant>);
        else {
          const attributes={ ...variant.attributes };
          if(option)
            attributes[dictionary]=option.label;
          else
            delete attributes[dictionary];
          props.setVariantField(selectedVariant,{ attributes,dictionaryOptionIds: ids });
        }
      }} />}
      {props.activeTab==="related"&&<RelatedProductsEditor current={editing} candidates={payload.data} onChange={(relatedProductIds) => props.setField({ relatedProductIds })} />}
    </div>
    {props.error&&<div className="admin-product-editor-error" role="alert">{props.error}</div>}
    <footer className="admin-product-editor-footer"><span>{props.dirty? "Несохранённые изменения":"Изменений нет"}</span><div><button type="button" className="admin-secondary" disabled={props.busy} onClick={props.close}>Отмена</button><button type="button" className="admin-primary" disabled={props.busy} onClick={props.save}>{props.busy? "Сохранение…":"Сохранить"}</button></div></footer>
  </section>;
}
function RelatedProductsEditor({ current,candidates,onChange }: { current: Product; candidates: any[]; onChange: (ids: string[]) => void }) {
  const [query,setQuery]=useState("");
  const selected=current.relatedProductIds.map((id) => candidates.find((item) => item.id===id)).filter(Boolean);
  const selectedIds=new Set(current.relatedProductIds);
  const eligible=(item: any) => item.id!==current.id&&item.status==="PUBLISHED"&&item.variants?.some((variant: any) => variant.active&&variant.inventory?.some((inventory: any) => inventory.availability==="IN_STOCK"||inventory.availability==="PREORDER"||inventory.allowPreorder));
  const available=candidates.filter((item) => eligible(item)&&!selectedIds.has(item.id)&&`${item.name} ${item.slug} ${item.variants?.map((variant: any) => variant.sku).join(" ")}`.toLowerCase().includes(query.toLowerCase())).slice(0,20);
  const move=(index: number,direction: -1|1) => { const next=[...current.relatedProductIds]; const target=index+direction; if(target<0||target>=next.length) return; [next[index],next[target]]=[next[target],next[index]]; onChange(next); };
  return <div className="admin-product-editor-panel related-products-editor"><div className="admin-product-section-title"><div><h3>Сопутствующие товары</h3><p>До 12 опубликованных товаров с доступным вариантом. Порядок задаёт порядок карточек на витрине.</p></div></div><label className="related-admin-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию или SKU" /></label><div className="related-admin-columns"><div className="related-admin-results">{available.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.slug}</small></span><button type="button" aria-label={`Добавить ${item.name}`} disabled={current.relatedProductIds.length>=12} onClick={() => onChange([...current.relatedProductIds,item.id])}><Plus size={16} /></button></div>)}{!available.length&&<p>Подходящих товаров не найдено.</p>}</div><div className="related-admin-selected"><strong>Выбранные товары ({selected.length}/12)</strong>{selected.map((item,index) => <div key={item.id}><span>{index+1}. {item.name}</span><div><button type="button" aria-label={`Переместить ${item.name} выше`} disabled={index===0} onClick={() => move(index,-1)}><ChevronUp size={15} /></button><button type="button" aria-label={`Переместить ${item.name} ниже`} disabled={index===selected.length-1} onClick={() => move(index,1)}><ChevronDown size={15} /></button><button type="button" aria-label={`Удалить ${item.name}`} onClick={() => onChange(current.relatedProductIds.filter((id) => id!==item.id))}><Trash2 size={15} /></button></div></div>)}{!selected.length&&<p>Сопутствующие товары не выбраны.</p>}</div></div></div>;
}

function VariantAttributesEditor(props: {
  variant: Variant;
  variantKey: string|number;
  options: DictionaryEntry[];
  onChange: (dictionaryOptionIds: Record<string,string|null>,attributes: Record<string,unknown>,changedCode: string,optionId: string|null) => void;
}) {
  const [drafts,setDrafts]=useState<Array<{ dictionary: string; optionId: string }>>([]);
  useEffect(() => { setDrafts([]); },[props.variantKey]);
  const definitions=DICTIONARY_REGISTRY.filter((entry) => entry.scope==="VARIANT"&&entry.source==="attribute_options");
  const definitionByCode=new Map(definitions.map((entry) => [entry.code,entry]));
  const persisted=Object.entries(props.variant.dictionaryOptionIds).filter(([code]) => definitionByCode.has(code as DictionaryCode));
  const hasActiveValues=(code: string) => props.options.some((option) => option.dictionary===code&&option.isActive);
  const usedTypes=new Set([...persisted.map(([code]) => code),...drafts.map((draft) => draft.dictionary).filter(Boolean)]);
  const canAddType=definitions.some((definition) => hasActiveValues(definition.code)&&!usedTypes.has(definition.code));
  const typeLabel=(code: string) => definitions.find((entry) => entry.code===code)?.label??code;
  const valueOptions=(code: string,selectedId: string|null) => {
    const active=props.options.filter((option) => option.dictionary===code&&option.isActive);
    const selected=selectedId? props.options.find((option) => option.dictionary===code&&option.id===selectedId):undefined;
    return selected&&!active.some((option) => option.id===selected.id)? [selected,...active]:active;
  };
  const updateType=(previousCode: string,nextCode: string,draftIndex?: number) => {
    const used=new Set(persisted.map(([code]) => code));
    drafts.forEach((draft,index) => { if(index!==draftIndex&&draft.dictionary) used.add(draft.dictionary); });
    if(nextCode&&(used.has(nextCode)||!hasActiveValues(nextCode))) return;
    if(draftIndex!==undefined) {
      setDrafts((rows) => rows.map((row,index) => index===draftIndex? { dictionary: nextCode,optionId: "" }:row));
      return;
    }
    if(!nextCode) {
      return;
    }
    const ids={ ...props.variant.dictionaryOptionIds };
    const attributes={ ...props.variant.attributes };
    if(previousCode) { delete ids[previousCode]; delete attributes[previousCode]; }
    ids[nextCode]=null;
    delete attributes[nextCode];
    props.onChange(ids,attributes,nextCode,null);
  };
  const updateValue=(code: string,id: string) => {
    const ids={ ...props.variant.dictionaryOptionIds,[code]: id||null };
    const attributes={ ...props.variant.attributes };
    const option=id? props.options.find((item) => item.dictionary===code&&item.id===id):undefined;
    if(option) attributes[code]=option.label;
    else delete attributes[code];
    props.onChange(ids,attributes,code,id||null);
  };
  const removeSaved=(code: string) => {
    const ids={ ...props.variant.dictionaryOptionIds };
    const attributes={ ...props.variant.attributes };
    delete ids[code]; delete attributes[code];
    props.onChange(ids,attributes,code,null);
  };
  return <section className="admin-variant-attributes">
    <div className="admin-product-section-title"><div><h4>Характеристики</h4><p>Выберите тип и значение из активного справочника.</p></div><button type="button" className="admin-secondary" onClick={() => setDrafts((rows) => [...rows,{ dictionary: "",optionId: "" }])} disabled={!canAddType}><Plus size={14} />Добавить характеристику</button></div>
    {!persisted.length&&!drafts.length&&<div className="admin-product-empty-images">Для варианта пока не добавлены характеристики.</div>}
    <div className="admin-variant-attribute-list">
      {persisted.map(([code,optionId]) => <div className="admin-variant-attribute-row" key={`saved-${code}`}>
        <select aria-label="Тип характеристики" value={code} onChange={(event) => updateType(code,event.target.value)}>{definitions.map((definition) => <option key={definition.code} value={definition.code} disabled={(definition.code!==code&&!hasActiveValues(definition.code))||(definition.code!==code&&persisted.some(([savedCode]) => savedCode===definition.code))}>{definition.label}{!hasActiveValues(definition.code)?" — Нет значений — добавьте в справочнике":""}</option>)}{!definitions.some((definition) => definition.code===code)&&<option value={code}>{typeLabel(code)} (сохранённое)</option>}</select>
        <select aria-label={`Значение характеристики ${typeLabel(code)}`} value={optionId??""} onChange={(event) => updateValue(code,event.target.value)}><option value="">Не выбрано</option>{valueOptions(code,optionId).map((option) => <option key={option.id} value={option.id}>{option.label}{!option.isActive? " (неактивно)":""}</option>)}</select>
        <button type="button" className="admin-icon-button" aria-label={`Удалить характеристику ${typeLabel(code)}`} onClick={() => removeSaved(code)}><Trash2 size={15} /></button>
      </div>)}
      {drafts.map((draft,index) => <div className="admin-variant-attribute-row" key={`draft-${index}`}>
        <select aria-label="Тип характеристики" value={draft.dictionary} onChange={(event) => updateType(draft.dictionary,event.target.value,index)}><option value="">Тип характеристики</option>{definitions.map((definition) => <option key={definition.code} value={definition.code} disabled={!hasActiveValues(definition.code)||persisted.some(([savedCode]) => savedCode===definition.code)||drafts.some((row,rowIndex) => rowIndex!==index&&row.dictionary===definition.code)}>{definition.label}{!hasActiveValues(definition.code)?" — Нет значений — добавьте в справочнике":""}</option>)}</select>
        <select aria-label="Значение характеристики" value={draft.optionId} disabled={!draft.dictionary} onChange={(event) => { const optionId=event.target.value; setDrafts((rows) => rows.filter((_,rowIndex) => rowIndex!==index)); if(draft.dictionary&&optionId) updateValue(draft.dictionary,optionId); }}><option value="">Значение</option>{valueOptions(draft.dictionary,draft.optionId).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
        <button type="button" className="admin-icon-button" aria-label="Удалить строку характеристики" onClick={() => setDrafts((rows) => rows.filter((_,rowIndex) => rowIndex!==index))}><Trash2 size={15} /></button>
      </div>)}
    </div>
  </section>;
}

function ProductGalleryPanel(props: {
  title: string;
  images: ImageLink[];
  scopeColorId: string|null;
  colorName: string|null;
  media: Media[];
  upload: (file: File,colorId: string|null) => Promise<void>;
  addImage: (colorId: string|null) => void;
  setImageField: (index: number,patch: Partial<ImageLink>) => void;
  makeMainImage: (index: number) => void;
  removeImage: (index: number) => void;
}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const images=props.images.map((image,index) => ({ image,index })).filter(({ image }) => image.colorId===props.scopeColorId).sort((a,b) => a.image.sortOrder-b.image.sortOrder);
  const mainIndex=images[0]?.index;
  const addUpload=async (event: ChangeEvent<HTMLInputElement>) => {
    const file=event.currentTarget.files?.[0];
    event.currentTarget.value="";
    if(!file)
      return;
    setBusy(true);
    setError("");
    try {
      await props.upload(file,props.scopeColorId);
    }
    catch(cause) {
      setError(cause instanceof Error? cause.message:"Не удалось загрузить фото.");
    }
    finally {
      setBusy(false);
    }
  };
  return <section className="admin-variant-photos">
    <div className="admin-product-section-title"><div><h4>{props.title}{props.colorName? ` · ${props.colorName}`:""}</h4><p>{props.scopeColorId? "Галерея привязана к цвету: варианты этого цвета используют одни фотографии.":"Общая галерея товара; индивидуальные фото для варианта без цвета моделью не поддерживаются."}</p></div><div className="admin-product-image-actions"><label className={`admin-secondary upload-control ${busy? "disabled":""}`}><ImagePlus size={15} />{busy? "Загрузка…":"Загрузить фото"}<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" disabled={busy} onChange={(event) => void addUpload(event)} /></label><button type="button" className="admin-secondary" onClick={() => props.addImage(props.scopeColorId)}><Plus size={15} />Из медиатеки</button></div></div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {images.length? <div className="admin-product-image-grid">{images.map(({ image,index }) => {
      const asset=props.media.find((item) => item.id===image.mediaId);
      return <article key={`${image.mediaId}-${index}`} className={props.scopeColorId? "color-image":""}>
        {asset? <img src={asset.url} alt={asset.alt||asset.filename} />:<div className="admin-product-image-placeholder">Выберите файл</div>}
        <div className="admin-product-image-meta"><strong>{index===mainIndex? "Главное фото":`Фото · порядок ${image.sortOrder+1}`}</strong>
          <label>Файл<select value={image.mediaId} onChange={(event) => props.setImageField(index,{ mediaId: event.target.value })}><option value="">Выберите фото</option>{props.media.map((item) => <option key={item.id} value={item.id}>{item.filename}</option>)}</select></label>
          <label>Порядок<input type="number" min="0" max="1000" value={image.sortOrder} onChange={(event) => props.setImageField(index,{ sortOrder: Number(event.target.value) })} /></label>
          {index!==mainIndex&&<button type="button" className="admin-secondary" onClick={() => props.makeMainImage(index)}>Сделать главным</button>}
          <button type="button" className="admin-icon-button admin-product-remove-image" aria-label="Удалить привязку фото" onClick={() => props.removeImage(index)}><Trash2 size={15} />Убрать привязку</button>
        </div>
      </article>;
    })}</div>:<div className="admin-product-empty-images">В этой галерее пока нет фото. Выберите изображение из медиатеки или загрузите его.</div>}
  </section>;
}
function DictionaryAssignmentPanel(props: {
  product: Product;
  variant?: Variant;
  options: DictionaryEntry[];
  typeKey: string|null;
  brands?: Option[];
  onProduct: (code: string,id: string) => void;
  onVariant: (code: string,id: string) => void;

}) {
  const applicable=(code: string) => !props.typeKey||isAttributeApplicable((props.typeKey.split(":").pop()??"other") as ProductTypeCode,code as any);
  const productCodes=["chip","condition"];
  const variantCodes=["memory","ram","sim","connectivity","size","material","region","bundle"];
  const names: Record<string,string>={ chip: "Процессор / чип",condition: "Состояние",memory: "Память",ram: "Оперативная память (RAM)",sim: "SIM",connectivity: "Подключение",size: "Размер",material: "Материал",region: "Регион / версия",bundle: "Комплектация" };
  const select=(code: string,id: string,onChange: (code: string,id: string) => void) => {
    const options=props.options.filter((entry) => entry.dictionary===code&&entry.isActive);
    return <label key={code}>{names[code]}<select value={id??""} onChange={(event) => onChange(code,event.target.value)}><option value="">Не выбрано</option>{options.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select>{!id&&code==="chip"&&props.product.chip&&<small>Текущее legacy-значение: {props.product.chip}</small>}{!id&&code!=="chip"&&code!=="condition"&&props.variant?.[({ memory: "storage",ram: "ram",sim: "simType",connectivity: "connectivity",size: "size",material: "material" } as Record<string,"storage"|"ram"|"simType"|"connectivity"|"size"|"material">)[code]]&&<small>Текущее legacy-значение сохранится: {props.variant[({ memory: "storage",ram: "ram",sim: "simType",connectivity: "connectivity",size: "size",material: "material" } as Record<string,"storage"|"ram"|"simType"|"connectivity"|"size"|"material">)[code]]}</small>}</label>;
  };
  return <div className="admin-product-specs-layout"><section><h4>Модель и характеристики товара</h4><label>Модель товара<input readOnly value={props.product.name} /></label>{productCodes.filter(applicable).map((code) => select(code,props.product.dictionaryOptionIds[code]??"",props.onProduct))}</section><section><h4>Характеристики выбранного варианта</h4>{props.variant&&variantCodes.filter(applicable).map((code) => select(code,props.variant?.dictionaryOptionIds[code]??"",props.onVariant))}</section></div>;
}
function PairEditor(props: {
  kind: "product"|"variant";
  value: Record<string,unknown>;
  update: (kind: "product"|"variant",oldName: string,key: "name"|"value",value: string) => void;
  remove: (kind: "product"|"variant",name: string) => void;
  add: (kind: "product"|"variant") => void;
}) {
  return null;
  /* Legacy custom characteristics remain in storage and are preserved on save. */
  /* eslint-disable-next-line no-unreachable */
  return <div className="admin-product-pairs"><div className="admin-product-pairs-head"><h5>Дополнительные характеристики</h5><button type="button" className="admin-secondary" onClick={() => props.add(props.kind)}><Plus size={14} />Добавить поле</button></div>{Object.entries(props.value).map(([name,value],index) => { const display=formatValue(value); return <div className="admin-product-pair" key={`${name}-${index}`}><label>Название<input value={name} placeholder="Например, Цвет корпуса" onChange={(event) => props.update(props.kind,name,"name",event.target.value)} /></label><label>Значение<input value={display} placeholder="Например, Натуральный титан" onChange={(event) => props.update(props.kind,name,"value",event.target.value)} /></label><button type="button" className="admin-icon-button" aria-label="Удалить характеристику" onClick={() => props.remove(props.kind,name)}><Trash2 size={15} /></button></div>; })}</div>;
}
