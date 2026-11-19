"use client";
import { useEffect,useMemo,useState,type ChangeEvent } from "react";
import { ArrowDown,ArrowUp,ChevronDown,ChevronLeft,ChevronRight,ChevronUp,ChevronsDown,ChevronsUp,Download,EyeOff,GripVertical,ImagePlus,ListOrdered,Plus,Save,Search,Trash2,Upload,X } from "lucide-react";
import { compareMemoryValues,dictionaryValuesMatch,DICTIONARY_REGISTRY,classifyProductType,isAttributeApplicable,type DictionaryCode,type ProductTypeCode } from "@/lib/product-dictionaries";
import { productSlugBase } from "@/lib/product-slug";
import { adminVariantFieldValue,type AdminVariantFieldCode } from "@/lib/admin-variant-fields";
import { moveProductOrder,productOrderChanged,productOrderSaveErrorMessage } from "@/lib/product-manual-order";
import { calculateOldPrice } from "@/lib/product-price";
import { approvedAvailability, APPROVED_AVAILABILITY_OPTIONS, availabilityLabel as inventoryAvailabilityLabel, inventoryTupleForAvailability, type ApprovedAvailability } from "@/lib/inventory-availability";
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
  availability: string;
  allowPreorder: boolean;
  deliveryTime: string|null;
};
type Variant={
  id?: string;
  sku?: string;
  productTypeId?: string;
  label?: string;
  colorId: string|null;
  storage: string;
  ram: string;
  simType: string;
  connectivity: string;
  size: string;
  material: string;
  dictionaryOptionIds: Record<string,string|null>;
  dictionaryOptionLabels?: Record<string,string|null>;
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
  role?: string;
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
type PriceExportOptions={cities: Option[];brands: Option[];categories: Option[]};
type PriceImportPreview={
  token:string|null;
  counts:{total:number;changed:number;unchanged:number;errors:number};
  rows:Array<{rowNumber:number;productName:string;sku:string;originalPrice:string|null;price:number|null;originalAvailability:string;availability:string;changed:boolean;errors:string[];warnings:string[]}>;
};
type DictionaryEntry={
  id: string;
  dictionary: string;
  canonicalKey: string;
  label: string;
  isActive: boolean;
  scope?: string|null;
  definitionName?: string|null;
  definitionIsActive?: boolean|null;
  productTypeIds?: string[];
};
type Tab="main"|"variants"|"images"|"specs"|"related";
const PRODUCT_ORDER_PAGE_SIZE=25;
const tabItems: Array<{
  id: Tab;
  label: string;
}>=[{ id: "main",label: "Основное" },{ id: "variants",label: "Варианты" },{ id: "related",label: "Сопутствующие" }];
const emptyProduct=(): Product => ({ name: "",slug: "",brandId: "",productTypeId: "",globalProductTypeId: "",modelId: null,productLineId: null,categoryId: "",model: "",generation: "",chip: "",displaySize: "",releaseYear: "",description: "",dictionaryOptionIds: {},specifications: {},relatedProductIds: [],isNew: false,status: "DRAFT",variants: [emptyVariant()],images: [] });
function emptyVariant(): Variant { return { colorId: null,storage: "",ram: "",simType: "",connectivity: "",size: "",material: "",dictionaryOptionIds: {},attributes: {},active: true,inventory: {},presentCities: new Set() }; }
function uniqueSlugPreview(value: string,rows: Array<{
  slug: string;
}>,excludeSlug?: string) {
  const base=productSlugBase(value); const used=new Set(rows.map((row) => row.slug).filter((slug) => slug!==excludeSlug)); if(!used.has(base))
    return base; let suffix=2; while(used.has(`${base}-${suffix}`))
    suffix+=1; return `${base}-${suffix}`;
}
function csrf() { return decodeURIComponent(document.cookie.split("; ").find((item) => item.startsWith("icenter_csrf="))?.split("=")[1]??""); }
function parsePairs(value: unknown): Record<string,unknown> {
  if(!value||typeof value!=="object"||Array.isArray(value))
    return {}; return value as Record<string,unknown>;
}
function isTradeInProduct(product: Product) { return product.specifications.tradeIn===true; }
function tradeInSpecification(product: Product,key: string) { const value=product.specifications[key]; return typeof value==="string"||typeof value==="number"? String(value):""; }
function inventoryFor(city: City,value?: any): Inventory { return { cityId: city.id,price: value?.price??null,availability: value?.availability??"UNSPECIFIED",allowPreorder: value?.allowPreorder??false,deliveryTime: value?.deliveryTime??null }; }
function productFromRow(row: any,cities: City[]): Product {
  return { id: row.id,name: row.name,slug: row.slug,brandId: row.brandId,productTypeId: row.productTypeId,globalProductTypeId: row.globalProductTypeId??row.globalTypeId??"",modelId: row.modelId??null,productLineId: row.productLineId??null,categoryId: row.categoryId,model: row.model??"",generation: row.generation??"",chip: row.chip??"",displaySize: row.displaySize??"",releaseYear: row.releaseYear? String(row.releaseYear):"",description: row.description??"",dictionaryOptionIds: row.dictionaryOptionIds??{},specifications: parsePairs(row.specifications),relatedProductIds: row.relatedProductIds??[],isNew: Boolean(row.isNew),status: row.status,variants: (row.variants??[]).map((variant: any) => ({ id: variant.id,sku: variant.sku,productTypeId: row.productTypeId,label: variant.label,colorId: variant.colorId??null,storage: variant.storage??"",ram: variant.ram??"",simType: variant.simType??"",connectivity: variant.connectivity??"",size: variant.size??"",material: variant.material??"",dictionaryOptionIds: variant.dictionaryOptionIds??{},dictionaryOptionLabels: variant.dictionaryOptionLabels??{},attributes: parsePairs(variant.attributes),active: variant.active!==false,inventory: Object.fromEntries(cities.map((city) => [city.id,inventoryFor(city,variant.inventory?.find((item: any) => item.cityId===city.id))])),presentCities: new Set<string>((variant.inventory??[]).map((item: any) => item.cityId)) })),images: (row.images??[]).map((image: any) => ({ mediaId: image.mediaId,colorId: image.colorId??null,sortOrder: image.sortOrder??0 })) };
}
function publicationReason(row: any) {
  if(row.status!=="PUBLISHED")
    return "Не опубликован";
  if(!row.variants?.some((variant: any) => variant.active&&Object.keys(variant.inventory??{}).length>0))
    return "Нет активного варианта с наличием по городу";
  return "";
}
function importPrice(value: string|number|null) {
  if(value===null||value==="") return "—";
  const amount=Number(value);
  return Number.isFinite(amount)?new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(amount):String(value);
}
function attributesFor(type?: Payload["options"]["types"][number]) {
  const value=type?.variantAttributes; if(Array.isArray(value))
    return value.map((item) => typeof item==="string"? item:item&&typeof item==="object"&&"name" in item? String((item as {
      name: unknown;
    }).name):"").filter(Boolean); if(value&&typeof value==="object")
    return Object.keys(value as Record<string,unknown>); return [];
}
export default function AdminProductsBackend({ mode="standard" }: { mode?: "standard"|"tradeIn" }) {
  const tradeInMode=mode==="tradeIn";
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
  const [deleteTarget,setDeleteTarget]=useState<(Product&{ id: string })|null>(null);
  const [deleteBusy,setDeleteBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [dictionaryOptions,setDictionaryOptions]=useState<DictionaryEntry[]>([]);
  const [manualOrderMode,setManualOrderMode]=useState(false);
  const [orderedIds,setOrderedIds]=useState<string[]>([]);
  const [savedOrderIds,setSavedOrderIds]=useState<string[]>([]);
  const [orderPage,setOrderPage]=useState(1);
  const [orderBusy,setOrderBusy]=useState(false);
  const [draggedProductId,setDraggedProductId]=useState<string|null>(null);
  const [exportOpen,setExportOpen]=useState(false);
  const [exportOptions,setExportOptions]=useState<PriceExportOptions|null>(null);
  const [exportCityId,setExportCityId]=useState("");
  const [exportBrandId,setExportBrandId]=useState("");
  const [exportCategoryId,setExportCategoryId]=useState("");
  const [exportLoading,setExportLoading]=useState(false);
  const [exportBusy,setExportBusy]=useState(false);
  const [exportError,setExportError]=useState("");
  const [importOpen,setImportOpen]=useState(false);
  const [importFile,setImportFile]=useState<File|null>(null);
  const [importCityId,setImportCityId]=useState("");
  const [importPreview,setImportPreview]=useState<PriceImportPreview|null>(null);
  const [importShowAll,setImportShowAll]=useState(false);
  const [importChecking,setImportChecking]=useState(false);
  const [importApplying,setImportApplying]=useState(false);
  const [importError,setImportError]=useState("");
  const orderDirty=productOrderChanged(orderedIds,savedOrderIds);
  const load=async () => {
    setLoadError("");
    try {
      const [productsResponse,mediaResponse]=await Promise.all([fetch(`/api/admin/products?scope=${tradeInMode?"used":"new"}`,{ cache: "no-store" }),fetch("/api/admin/media",{ cache: "no-store" })]);
      const productsData=await productsResponse.json().catch(() => ({}));
      if(!productsResponse.ok)
        throw new Error(productsData.error||(productsResponse.status===401? "Сессия истекла. Войдите снова.":`Не удалось загрузить каталог (${productsResponse.status}).`));
      if(!Array.isArray(productsData.data)||!productsData.options)
        throw new Error("Сервер вернул некорректный ответ каталога.");
      setPayload(productsData);
      const loadedIds=productsData.data.map((row: any) => String(row.id));
      setOrderedIds(loadedIds);
      setSavedOrderIds(loadedIds);
      setOrderPage(1);
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
  const loadExportOptions=async () => {
    const response=await fetch("/api/admin/city-inventory/export/options",{ cache:"no-store" });
    const result=await response.json().catch(() => ({}));
    if(!response.ok||!result.data) throw new Error(response.status===403?"Нет прав на изменение цен для доступных городов.":"Не удалось загрузить список городов.");
    const options=result.data as PriceExportOptions;
    setExportOptions(options);
    return options;
  };
  const openExport=async () => {
    setExportOpen(true); setExportError(""); setExportLoading(true);
    try {
      const options=await loadExportOptions();
      setExportCityId((current) => options.cities.some((city) => city.id===current)?current:options.cities[0]?.id??"");
    } catch(error) { setExportError(error instanceof Error?error.message:"Не удалось загрузить фильтры экспорта."); }
    finally { setExportLoading(false); }
  };
  const openImport=async () => {
    setImportOpen(true); setImportFile(null); setImportPreview(null); setImportShowAll(false); setImportError(""); setImportCityId(""); setExportLoading(true);
    try {
      const options=await loadExportOptions();
      setImportCityId(options.cities[0]?.id??"");
    } catch(error) { setImportError(error instanceof Error?error.message:"Не удалось загрузить список городов."); }
    finally { setExportLoading(false); }
  };
  const downloadExport=async () => {
    if(!exportCityId||exportBusy) return;
    setExportBusy(true); setExportError("");
    try {
      const params=new URLSearchParams({ cityId:exportCityId });
      if(exportBrandId) params.set("brandId",exportBrandId);
      if(exportCategoryId) params.set("categoryId",exportCategoryId);
      const response=await fetch(`/api/admin/city-inventory/export?${params}`,{ cache:"no-store" });
      if(!response.ok) {
        const result=await response.json().catch(() => ({}));
        throw new Error(result.error==="EXPORT_CITY_FORBIDDEN"?"Нет прав на экспорт для выбранного города.":"Не удалось сформировать Excel-файл.");
      }
      const blob=await response.blob();
      const objectUrl=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=objectUrl;
      link.download=`icenter-price-${new Date().toISOString().slice(0,10)}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl),1000);
      setExportOpen(false);
    } catch(error) { setExportError(error instanceof Error?error.message:"Не удалось сформировать Excel-файл."); }
    finally { setExportBusy(false); }
  };
  const resetImport=() => { setImportOpen(false); setImportFile(null); setImportCityId(""); setImportPreview(null); setImportError(""); setImportChecking(false); setImportApplying(false); };
  const checkImport=async () => {
    if(!importFile||!importCityId||importChecking) return;
    setImportChecking(true); setImportPreview(null); setImportShowAll(false); setImportError("");
    try {
      const form=new FormData(); form.set("file",importFile); form.set("cityId",importCityId);
      const csrfValue=csrf();
      const response=await fetch("/api/admin/city-inventory/import/preview",{ method:"POST",headers:{"x-csrf-token":csrfValue},body:form });
      const result=await response.json().catch(() => ({}));
      if(!response.ok) throw new Error(result.error==="EXPORT_CITY_FORBIDDEN"?"Нет прав на изменение цен для выбранного города.":result.error==="IMPORT_FILE_TOO_LARGE"?"Файл превышает допустимый размер 8 МБ.":result.error==="IMPORT_TEMPLATE_OUTDATED"?"Этот файл создан в старом формате. Скачайте актуальный прайс-лист и перенесите в него цены.":result.error==="IMPORT_PRICE_INVALID"?"Цена должна быть целым числом рублей без копеек.":"Файл не прошёл проверку формата или подписи.");
      setImportPreview(result.data as PriceImportPreview);
    } catch(error) { setImportError(error instanceof Error?error.message:"Не удалось проверить файл."); }
    finally { setImportChecking(false); }
  };
  const applyImport=async () => {
    if(!importPreview?.token||importPreview.counts.errors||!importPreview.counts.changed||importApplying) return;
    if(!window.confirm(`Применить изменения к ${importPreview.counts.changed} вариантам?`)) return;
    setImportApplying(true); setImportError("");
    try {
      const response=await fetch("/api/admin/city-inventory/import/confirm",{ method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrf()},body:JSON.stringify({previewToken:importPreview.token}) });
      const result=await response.json().catch(() => ({}));
      if(!response.ok) throw new Error(result.error==="IMPORT_CONFLICT"?"Цены изменились после проверки. Загрузите файл и проверьте изменения заново.":result.error==="IMPORT_PREVIEW_EXPIRED"?"Предпросмотр устарел. Проверьте файл заново.":"Не удалось применить изменения.");
      setNotice(`Обновлено ${result.data.updated} вариантов.`);
      resetImport();
    } catch(error) { setImportError(error instanceof Error?error.message:"Не удалось применить изменения."); }
    finally { setImportApplying(false); }
  };
  useEffect(() => { void load(); },[tradeInMode]);
  useEffect(() => {
    fetch("/api/admin/dictionaries",{ cache: "no-store" }).then((response) => response.ok? response.json():null).then((data) => {
      if(Array.isArray(data?.data))
        setDictionaryOptions(data.data);
    }).catch(() => undefined);
  },[]);
  useEffect(() => {
    if(!editing&&!orderDirty)
      return; const beforeUnload=(event: BeforeUnloadEvent) => {
        if(!dirty&&!orderDirty)
          return; event.preventDefault(); event.returnValue="";
      }; window.addEventListener("beforeunload",beforeUnload); return () => window.removeEventListener("beforeunload",beforeUnload);
  },[editing,dirty,orderDirty]);
  const filtered=useMemo(() => (payload?.data??[]).filter((row) => `${row.name} ${row.slug} ${row.variants.map((variant: any) => variant.sku).join(" ")}`.toLowerCase().includes(query.toLowerCase())),[payload,query]);
  const orderedProducts=useMemo(() => {
    const byId=new Map((payload?.data??[]).map((row) => [String(row.id),row]));
    return orderedIds.map((id) => byId.get(id)).filter(Boolean) as any[];
  },[payload,orderedIds]);
  const orderPageCount=Math.max(1,Math.ceil(orderedProducts.length/PRODUCT_ORDER_PAGE_SIZE));
  const orderPageRows=orderedProducts.slice((orderPage-1)*PRODUCT_ORDER_PAGE_SIZE,orderPage*PRODUCT_ORDER_PAGE_SIZE);
  const visibleRows=manualOrderMode?orderPageRows:filtered;
  useEffect(() => { if(orderPage>orderPageCount) setOrderPage(orderPageCount); },[orderPage,orderPageCount]);
const activeType=payload?.options.types.find((item) => item.id===editing?.globalProductTypeId);
  const closeEditor=() => {
    if(dirty&&!window.confirm("Есть несохранённые изменения. Закрыть редактор без сохранения?"))
      return; setEditing(null); setDirty(false); setFormError("");
  };
  const beginDelete=(product: Product&{id:string}) => { setNotice(""); setDeleteTarget(product); };
  const removeProduct=async () => {
    if(!deleteTarget||deleteBusy) return;
    setDeleteBusy(true); setNotice("");
    try {
      const csrfValue=csrf();
      if(!csrfValue) throw new Error("Сессия или CSRF-токен недоступны. Войдите повторно.");
      const response=await fetch(`/api/admin/products?id=${encodeURIComponent(deleteTarget.id)}&scope=${tradeInMode?"used":"new"}`,{ method:"DELETE",headers:{"x-csrf-token":csrfValue} });
      const result=await response.json().catch(() => ({}));
      if(!response.ok) throw new Error(result.error||`Не удалось удалить товар (${response.status}).`);
      const name=deleteTarget.name;
      setPayload((current)=>current?{...current,data:current.data.filter((product)=>product.id!==deleteTarget.id)}:current);
      setOrderedIds((ids) => ids.filter((id) => id!==deleteTarget.id));
      setSavedOrderIds((ids) => ids.filter((id) => id!==deleteTarget.id));
      setDeleteTarget(null); setNotice(`Товар «${name}» удалён.`);
    } catch(error) {
      setNotice(error instanceof Error? error.message:"Не удалось удалить товар.");
    } finally { setDeleteBusy(false); }
  };
  const unpublishProduct=async (product: Product&{id:string}) => {
    if(deleteBusy||!window.confirm(`Снять товар «${product.name}» с публикации?`)) return;
    setDeleteBusy(true); setNotice("");
    try {
      const csrfValue=csrf();
      if(!csrfValue) throw new Error("Сессия или CSRF-токен недоступны. Войдите повторно.");
      const response=await fetch(`/api/admin/products?scope=${tradeInMode?"used":"new"}`,{method:"PATCH",headers:{"content-type":"application/json","x-csrf-token":csrfValue},body:JSON.stringify({id:product.id,action:"unpublish"})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error||"Не удалось снять товар с публикации.");
      setPayload((current)=>current?{...current,data:current.data.map((item)=>item.id===product.id?{...item,status:"HIDDEN"}:item)}:current);
      setNotice(`Товар «${product.name}» снят с публикации.`);
    } catch(error) { setNotice(error instanceof Error?error.message:"Не удалось снять товар с публикации."); }
    finally { setDeleteBusy(false); }
  };
  const toggleManualOrder=() => {
    if(manualOrderMode&&orderDirty&&!window.confirm("Отменить несохранённые изменения порядка?")) return;
    if(manualOrderMode&&orderDirty) setOrderedIds(savedOrderIds);
    setManualOrderMode((value) => !value);
    setQuery("");
    setOrderPage(1);
    setNotice("");
  };
  const moveOrderedProduct=(productId: string,targetIndex: number) => {
    const next=moveProductOrder(orderedIds,productId,targetIndex);
    setOrderedIds(next);
    const nextIndex=next.indexOf(productId);
    if(nextIndex>=0) setOrderPage(Math.floor(nextIndex/PRODUCT_ORDER_PAGE_SIZE)+1);
  };
  const saveManualOrder=async () => {
    if(!orderDirty||orderBusy) return;
    setOrderBusy(true); setNotice("");
    try {
      const csrfValue=csrf();
      if(!csrfValue) throw new Error("Сессия или CSRF-токен недоступны. Войдите повторно.");
      const response=await fetch("/api/admin/products/order",{ method:"PATCH",headers:{ "content-type":"application/json","x-csrf-token":csrfValue },body:JSON.stringify({ expectedIds:savedOrderIds,orderedIds }) });
      const result=await response.json().catch(() => ({}));
      if(!response.ok) {
        if(response.status===409&&Array.isArray(result.currentIds)) {
          const currentIds: string[]=(result.currentIds as unknown[]).map((id) => String(id));
          setOrderedIds(currentIds);
          setSavedOrderIds(currentIds);
          setPayload((current) => {
            if(!current) return current;
            const byId=new Map(current.data.map((item) => [String(item.id),item]));
            return { ...current,data:currentIds.map((id) => byId.get(id)).filter(Boolean) as typeof current.data };
          });
        }
        throw new Error(productOrderSaveErrorMessage(response.status,result));
      }
      setSavedOrderIds(orderedIds);
      setPayload((current) => current?{...current,data:orderedIds.map((id) => current.data.find((item) => String(item.id)===id)).filter(Boolean)}:current);
      setNotice("Ручной порядок товаров сохранён.");
    } catch(error) {
      setNotice(error instanceof Error?error.message:"Не удалось сохранить порядок товаров.");
    } finally { setOrderBusy(false); }
  };
  const startEdit=(row?: any) => {
    if(!payload)
      return; if(!row) {
        const product=emptyProduct();
        if(tradeInMode) product.specifications={ tradeIn:true,tradeInCondition:"",tradeInBatteryHealth:"",tradeInEquipment:"",tradeInDefects:"" };
        product.brandId=payload.options.brands[0]?.id??"";
        product.globalProductTypeId=payload.options.types[0]?.id??"";
        product.productTypeId="";
        product.categoryId=payload.options.categories[0]?.id??"";
        setEditing(product);
      }
    else {
      setEditing(productFromRow(row,payload.options.cities));
    }
    setTab("main"); setSelectedVariant(0); setDirty(false); setFormError("");
  };
  const update=(patch: Partial<Product>) => setEditing((current) => current? { ...current,...patch }:current);
  const patchVariant=(index: number,patch: Partial<Variant>) => setEditing((current) => current? { ...current,variants: current.variants.map((variant,itemIndex) => itemIndex===index? { ...variant,...patch }:variant) }:current);
  const patchInventory=(variantIndex: number,cityId: string,patch: Partial<Inventory>) => setEditing((current) => current? { ...current,variants: current.variants.map((variant,itemIndex) => itemIndex===variantIndex? { ...variant,inventory: { ...variant.inventory,[cityId]: { ...variant.inventory[cityId],cityId,...patch } } }:variant) }:current);
  const patchImage=(index: number,patch: Partial<ImageLink>) => setEditing((current) => current? { ...current,images: current.images.map((image,itemIndex) => itemIndex===index? { ...image,...patch }:image) }:current);
  const save=async () => {
    if(!editing||!payload)
      return;
    if(!editing.name.trim()||!editing.brandId||!editing.globalProductTypeId||!editing.categoryId||!editing.slug.trim()) {
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
      const body={ ...editing,images: editing.images.filter((image) => image.mediaId),releaseYear: editing.releaseYear? Number(editing.releaseYear):null,variants: editing.variants.map(({ presentCities,...variant }) => ({ ...variant,inventory: Object.values(variant.inventory).filter((record) => presentCities.has(record.cityId)||record.price!==null||record.availability!=="UNSPECIFIED"||record.allowPreorder||record.deliveryTime) })) };
      const response=await fetch(`/api/admin/products?scope=${tradeInMode?"used":"new"}`,{ method: editing.id? "PATCH":"POST",headers: { "content-type": "application/json","x-csrf-token": csrfValue },body: JSON.stringify(editing.id? { id: editing.id,data: body }:body) });
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
    const next = typeof patch.name === "string" && editing && patch.name !== editing.name
      ? { ...patch, slug: uniqueSlugPreview(patch.name, payload?.data ?? [], editing.slug) }
      : patch;
    update(next); setDirty(true); if(formError)
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
    <div className="workspace-head"><div><h1>{tradeInMode?"Б/у товары":"Товары"}</h1><p>{tradeInMode?"Отдельные экземпляры Trade-in":"Каталог новых товаров"} · изменения сохраняются после подтверждения</p></div><div className="admin-products-actions">{!tradeInMode&&<><button type="button" className="admin-secondary" disabled={manualOrderMode} onClick={() => void openImport()}><Upload size={16} />Импорт Excel</button><button type="button" className="admin-secondary" disabled={manualOrderMode} onClick={() => void openExport()}><Download size={16} />Экспорт Excel</button></>}<button type="button" className="admin-primary" disabled={manualOrderMode} onClick={() => startEdit()}><Plus size={16} />{tradeInMode?"Добавить б/у товар":"Добавить товар"}</button></div></div>
    {notice&&<p className={notice.startsWith("Товар «")||notice.startsWith("Ручной порядок")?"dictionary-message":notice.startsWith("Обновлено ")?"admin-import-success":"form-error"} role="status">{notice}</p>}
    <div className="workspace-toolbar admin-product-order-toolbar"><label className="admin-field-search"><Search size={17} /><input value={query} disabled={manualOrderMode} onChange={(event) => setQuery(event.target.value)} placeholder={manualOrderMode?"Поиск недоступен в режиме ручного порядка":tradeInMode?"Поиск б/у товаров по названию или SKU":"Поиск по названию, slug или SKU"} /></label>{!tradeInMode&&<><button type="button" className={`admin-secondary admin-product-order-toggle${manualOrderMode?" active":""}`} onClick={toggleManualOrder}><ListOrdered size={16} />{manualOrderMode?"Закрыть ручной порядок":"Ручной порядок"}</button>{manualOrderMode&&<button type="button" className="admin-primary" disabled={!orderDirty||orderBusy} onClick={() => void saveManualOrder()}><Save size={16} />{orderBusy?"Сохранение…":"Сохранить порядок"}</button>}</>}</div>
    {manualOrderMode&&<div className="admin-product-order-note" role="status"><span>Показан полный каталог. Перетаскивайте строки или используйте кнопки перемещения.</span>{orderDirty&&<strong>Есть несохранённые изменения</strong>}</div>}
    {loadError? <div className="panel admin-products-load-error" role="alert"><p>{loadError}</p><button className="admin-secondary" type="button" onClick={() => void load()}>Повторить загрузку</button></div>:!payload? <div className="panel">Загрузка каталога…</div>:visibleRows.length? <><div className="workspace-table panel admin-products-order-table"><table className="table"><thead><tr>{manualOrderMode&&<th className="admin-product-order-column">Порядок</th>}<th>Товар</th><th>Бренд</th><th>Категория</th><th>Варианты</th><th>Статус</th><th /></tr></thead><tbody>{visibleRows.map((row) => { const globalIndex=orderedIds.indexOf(String(row.id)); return <tr key={row.id} draggable={manualOrderMode} className={draggedProductId===row.id?"is-dragging":undefined} onDragStart={(event) => { if(!manualOrderMode) return; setDraggedProductId(String(row.id)); event.dataTransfer.effectAllowed="move"; event.dataTransfer.setData("text/plain",String(row.id)); }} onDragEnd={() => setDraggedProductId(null)} onDragOver={(event) => { if(manualOrderMode) { event.preventDefault(); event.dataTransfer.dropEffect="move"; } }} onDrop={(event) => { event.preventDefault(); const sourceId=draggedProductId||event.dataTransfer.getData("text/plain"); if(sourceId&&sourceId!==row.id) moveOrderedProduct(sourceId,globalIndex); setDraggedProductId(null); }}>
      {manualOrderMode&&<td className="admin-product-order-cell"><span className="admin-product-drag-handle" title="Перетащить товар"><GripVertical size={17} /><b>{globalIndex+1}</b></span><span className="admin-product-order-actions"><button type="button" className="icon-action" disabled={globalIndex<=0} title="В начало" aria-label={`Переместить ${row.name} в начало`} onClick={() => moveOrderedProduct(String(row.id),0)}><ChevronsUp size={15} /></button><button type="button" className="icon-action" disabled={globalIndex<=0} title="Выше" aria-label={`Переместить ${row.name} выше`} onClick={() => moveOrderedProduct(String(row.id),globalIndex-1)}><ArrowUp size={15} /></button><button type="button" className="icon-action" disabled={globalIndex>=orderedIds.length-1} title="Ниже" aria-label={`Переместить ${row.name} ниже`} onClick={() => moveOrderedProduct(String(row.id),globalIndex+1)}><ArrowDown size={15} /></button><button type="button" className="icon-action" disabled={globalIndex>=orderedIds.length-1} title="В конец" aria-label={`Переместить ${row.name} в конец`} onClick={() => moveOrderedProduct(String(row.id),orderedIds.length-1)}><ChevronsDown size={15} /></button></span></td>}
      <td><strong>{row.name}</strong><small>{row.slug}</small></td><td>{row.brandName}</td><td>{row.categoryName}</td><td>{row.variants.length}</td><td><span>{row.status}</span>{publicationReason(row)&&<small className="admin-publication-warning">{publicationReason(row)}</small>}</td><td><span className="row-actions"><button type="button" className="admin-secondary" disabled={manualOrderMode} onClick={() => startEdit(row)}>Изменить</button>{row.status==="PUBLISHED"&&<button type="button" className="icon-action" aria-label={`Снять с публикации ${row.name}`} title="Снять с публикации" disabled={manualOrderMode||deleteBusy} onClick={() => void unpublishProduct(row)}><EyeOff size={16}/></button>}<button type="button" className="icon-action danger" disabled={manualOrderMode} aria-label={`Удалить ${row.name}`} title="Удалить товар" onClick={() => beginDelete(row)}><Trash2 size={16} /></button></span></td></tr>; })}</tbody></table></div>{manualOrderMode&&<div className="admin-product-order-pagination"><button type="button" className="admin-secondary" disabled={orderPage<=1} onClick={() => setOrderPage((page) => Math.max(1,page-1))}><ChevronLeft size={16} />Назад</button><span>Страница {orderPage} из {orderPageCount} · {orderedProducts.length} товаров</span><button type="button" className="admin-secondary" disabled={orderPage>=orderPageCount} onClick={() => setOrderPage((page) => Math.min(orderPageCount,page+1))}>Далее<ChevronRight size={16} /></button></div>}</>:<div className="panel">Товаров не найдено.</div>}
    {exportOpen&&<div className="admin-modal-backdrop" onMouseDown={(event) => { if(event.target===event.currentTarget&&!exportBusy) setExportOpen(false); }}><section className="admin-modal admin-export-modal" role="dialog" aria-modal="true" aria-labelledby="price-export-title"><header><h2 id="price-export-title">Экспорт прайс-листа</h2><button type="button" className="icon-action" aria-label="Закрыть" disabled={exportBusy} onClick={() => setExportOpen(false)}><X size={18}/></button></header><div className="admin-modal-body">{exportLoading?<p className="admin-note">Загрузка доступных фильтров…</p>:exportOptions&&<><label className="admin-form-label">Город<select required value={exportCityId} onChange={(event) => setExportCityId(event.target.value)}><option value="">Выберите город</option>{exportOptions.cities.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="admin-form-label">Бренд<select value={exportBrandId} onChange={(event) => setExportBrandId(event.target.value)}><option value="">Все бренды</option>{exportOptions.brands.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="admin-form-label">Категория<select value={exportCategoryId} onChange={(event) => setExportCategoryId(event.target.value)}><option value="">Все категории</option>{exportOptions.categories.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}{exportError&&<p className="form-error" role="alert">{exportError}</p>}</div><footer><button type="button" className="admin-secondary" disabled={exportBusy} onClick={() => setExportOpen(false)}>Отмена</button><button type="button" className="admin-primary" disabled={exportLoading||exportBusy||!exportCityId} onClick={() => void downloadExport()}><Download size={16}/>{exportBusy?"Формирование…":"Скачать Excel"}</button></footer></section></div>}
    {importOpen&&<div className="admin-modal-backdrop admin-import-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!importApplying)resetImport();}}><section className="admin-modal admin-import-modal" role="dialog" aria-modal="true" aria-labelledby="price-import-title"><header><h2 id="price-import-title">Импорт прайс-листа</h2><button type="button" className="icon-action" aria-label="Закрыть" disabled={importApplying} onClick={resetImport}><X size={18}/></button></header><div className="admin-modal-body"><label className="admin-form-label">Город<select required value={importCityId} onChange={(event)=>{setImportCityId(event.target.value);setImportPreview(null);setImportError("");}}><option value="">Выберите город</option>{(exportOptions?.cities??[]).map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="admin-form-label">Файл Excel<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event)=>{setImportFile(event.target.files?.[0]??null);setImportPreview(null);setImportError("");}}/><small>Только файл, ранее экспортированный из iCenter. Максимум 8 МБ.</small></label>{importPreview&&(()=>{const visibleRows=importPreview.rows.filter((row)=>importShowAll||row.changed||row.errors.length>0||row.warnings.length>0);const warningCount=importPreview.rows.reduce((sum,row)=>sum+row.warnings.length,0);const fields=[{key:"price",label:"Цена",before:(row:typeof importPreview.rows[number])=>row.originalPrice,after:(row:typeof importPreview.rows[number])=>row.price,changed:(row:typeof importPreview.rows[number])=>Number(row.originalPrice)!==Number(row.price)},{key:"availability",label:"Доступность",before:(row:typeof importPreview.rows[number])=>row.originalAvailability||"—",after:(row:typeof importPreview.rows[number])=>row.availability||"—",changed:(row:typeof importPreview.rows[number])=>row.originalAvailability!==row.availability}];return <><div className="admin-import-summary"><div className="admin-import-counts"><span>Изменено <strong>{importPreview.counts.changed}</strong></span><span>Без изменений <strong>{importPreview.counts.unchanged}</strong></span><span>Ошибки <strong>{importPreview.counts.errors}</strong></span><span>Предупреждения <strong>{warningCount}</strong></span></div><div className="admin-import-view-toggle" role="group" aria-label="Отображение строк"><button type="button" className={!importShowAll?"active":""} aria-pressed={!importShowAll} onClick={()=>setImportShowAll(false)}>Изменения</button><button type="button" className={importShowAll?"active":""} aria-pressed={importShowAll} onClick={()=>setImportShowAll(true)}>Все строки</button></div></div><div className="admin-import-preview">{visibleRows.length?visibleRows.map((row)=><article className={`admin-import-row${row.errors.length?" has-error":""}`} key={row.rowNumber}><div className="admin-import-product"><strong>{row.productName}</strong><small>SKU: {row.sku}</small></div>{row.changed&&<div className="admin-import-changes">{fields.filter((field)=>field.changed(row)).map((field)=><div className="admin-import-change" key={field.key}><span>{field.label}</span><strong>{field.key==="availability"?String(field.before(row)):importPrice(field.before(row) as string|null)} <i aria-hidden="true">→</i> {field.key==="availability"?String(field.after(row)):importPrice(field.after(row) as number|null)}</strong></div>)}</div>}{row.errors.map((message,index)=><p className="admin-import-message is-error" key={`e-${index}`}>{message}</p>)}{row.warnings.map((message,index)=><p className="admin-import-message is-warning" key={`w-${index}`}>{message}</p>)}{!row.changed&&!row.errors.length&&!row.warnings.length&&<small className="admin-import-unchanged">Без изменений</small>}</article>):<p className="admin-import-empty">Нет изменённых строк и замечаний.</p>}</div></>;})()}{importError&&<p className="form-error" role="alert">{importError}</p>}</div><footer>{importPreview?<><button type="button" className="admin-secondary" disabled={importApplying} onClick={()=>{setImportPreview(null);setImportError("");}}>Назад</button><button type="button" className="admin-primary" disabled={!importPreview.token||importPreview.counts.errors>0||importPreview.counts.changed===0||importApplying} onClick={()=>void applyImport()}>{importApplying?"Применение…":`Применить ${importPreview.counts.changed} изменений`}</button></>:<><button type="button" className="admin-secondary" disabled={importChecking} onClick={resetImport}>Отмена</button><button type="button" className="admin-primary" disabled={!importCityId||!importFile||importChecking} onClick={()=>void checkImport()}>{importChecking?"Проверка…":"Проверить изменения"}</button></>}</footer></section></div>}
    {deleteTarget&&<div className="admin-modal-backdrop" onMouseDown={(event) => { if(event.target===event.currentTarget&&!deleteBusy) setDeleteTarget(null); }}><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="delete-product-title"><header><h2 id="delete-product-title">Удалить товар?</h2><button type="button" className="icon-action" disabled={deleteBusy} onClick={() => setDeleteTarget(null)} aria-label="Закрыть"><X size={18} /></button></header><div className="admin-modal-body"><p>Товар «<strong>{deleteTarget.name}</strong>» будет удалён вместе с вариантами, Inventory и связями каталога.</p><p className="form-error">Удаление необратимо. Связанные позиции будут удалены, сами заявки и контактные данные останутся. Медиафайлы в медиатеке не удаляются.</p></div><footer><button type="button" className="admin-secondary" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>Отмена</button><button type="button" className="admin-danger" disabled={deleteBusy} onClick={() => void removeProduct()}>{deleteBusy?"Удаление…":"Удалить товар"}</button></footer></section></div>}
    {editing&&payload&&<div className="admin-modal-backdrop admin-product-editor-backdrop" onMouseDown={(event) => {
      if(event.target===event.currentTarget)
        closeEditor();
    }}>
      <ProductEditor title={editing.id?(tradeInMode?"Редактирование б/у товара":"Редактирование товара"):(tradeInMode?"Новый б/у товар":"Новый товар")} editing={editing} payload={payload} media={media} activeTab={tab} setActiveTab={setTab} selectedVariant={selectedVariant} setSelectedVariant={setSelectedVariant} activeType={activeType} dirty={dirty} error={formError} busy={busy} setField={setField} setVariantField={setVariantField} setInventoryField={setInventoryField} setImageField={setImageField} addVariant={() => { update({ variants: [...editing.variants,emptyVariant()] }); setSelectedVariant(editing.variants.length); setDirty(true); }} removeVariant={(index) => {
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
      }} addImage={(colorId) => { update({ images: [...editing.images,{ mediaId: "",colorId,sortOrder: editing.images.filter((image) => image.colorId===colorId).length }] }); setDirty(true); }} removeImage={(index) => { update({ images: editing.images.filter((_,itemIndex) => itemIndex!==index) }); setDirty(true); }} upload={async (file,colorId) => {
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
  upload: (file: File,colorId: string|null) => Promise<void>;
  close: () => void;
  save: () => void;
}) {
  const { editing,payload,media,selectedVariant,setSelectedVariant }=props;
  const tradeInMode=isTradeInProduct(editing);
  const [registeredOptions,setRegisteredOptions]=useState<DictionaryEntry[]>([]);
  const [registeredDefinitions,setRegisteredDefinitions]=useState<Array<{code:string;name:string;scope:string;isActive:boolean;canAssign?:boolean;productTypeIds?:string[]}>>([]);
  const [expandedVariant,setExpandedVariant]=useState<number|null>(null);
  useEffect(() => {
    const controller=new AbortController();
    fetch("/api/admin/dictionaries",{ signal: controller.signal,cache: "no-store" }).then((response) => response.ok? response.json():null).then((result) => {
      if(!controller.signal.aborted&&Array.isArray(result?.data)) {
        setRegisteredOptions(result.data);
        setRegisteredDefinitions(Array.isArray(result?.definitions)?result.definitions:[]);
      }
    }).catch(() => undefined);
    return () => controller.abort();
  },[]);
  const updateVariantAttributes=(variantIndex: number,dictionaryOptionIds: Record<string,string|null>,attributes: Record<string,unknown>,changedCode: string,optionId: string|null) => {
    const field=({ memory: "storage",ram: "ram",sim: "simType",connectivity: "connectivity",size: "size",material: "material" } as Record<string,keyof Variant|undefined>)[changedCode];
    const option=optionId? registeredOptions.find((item) => item.dictionary===changedCode&&item.id===optionId):undefined;
    props.setVariantField(variantIndex,{ dictionaryOptionIds,attributes,...(field? { [field]: option?.label??"" }: {}) } as Partial<Variant>);
  };
  useEffect(() => { if(tradeInMode) { setSelectedVariant(0); setExpandedVariant(0); } },[tradeInMode,setSelectedVariant]);
  const selectedVariantRecord=expandedVariant===null?undefined:editing.variants[expandedVariant];
  const variant=selectedVariantRecord? { ...selectedVariantRecord,productTypeId: editing.globalProductTypeId||selectedVariantRecord.productTypeId||"" }:undefined;
  const withDictionaryLabels=(item: Variant): Variant => ({ ...item,dictionaryOptionLabels: Object.fromEntries(Object.entries(item.dictionaryOptionIds).map(([code,id]) => [code,registeredOptions.find((entry) => entry.id===id)?.label??null])) });
  const productType=classifyProductType(`${props.activeType?.globalTypeKey??""} ${props.activeType?.name??""}`);
  const labelFields: Record<ProductTypeCode,AdminVariantFieldCode[]>={ smartphone:["storage","simType"],tablet:["storage","simType"],laptop:["storage","ram","connectivity"],watch:["size","connectivity","material"],headphones:["connectivity"],vacuum:["material"],hairCare:["material"],console:["storage","connectivity"],other:["storage","ram","simType","connectivity","size","material"] };
  const variantsLabel=(item: Variant,index: number) => {
    const values: string[]=[];
    const seen=new Set<string>();
    const add=(value: unknown,code="") => {
      if(typeof value!=="string"||!value.trim()) return;
      let display=value.trim();
      if(code==="ram"&&!/\bram\b/i.test(display)) display=`${display} RAM`;
      const key=display.toLocaleLowerCase("ru-RU").replace(/\s+/g," ");
      if(seen.has(key)) return;
      seen.add(key); values.push(display);
    };
    add(payload.options.colors.find((color) => color.id===item.colorId)?.name,"color");
    const labeled=withDictionaryLabels(item);
    for(const field of labelFields[productType]) add(adminVariantFieldValue(labeled,field),field==="ram"?"ram":field);
    const standardCodes=new Set(["memory","ram","sim","connectivity","size","material"]);
    Object.entries(item.attributes).forEach(([code,value]) => { if(!standardCodes.has(code)) add(value,code); });
    return values.join(" · ")||`Вариант ${index+1}`;
  };
  const variantMemory=(item:Variant)=>item.storage||registeredOptions.find((option)=>option.id===item.dictionaryOptionIds.memory)?.label||"";
  const variantSim=(item:Variant)=>item.simType||registeredOptions.find((option)=>option.id===item.dictionaryOptionIds.sim)?.label||"";
  const simRank=(value:string)=>/^eSIM$/i.test(value.trim())?0:/sim\s*\+\s*esim|esim\s*\+\s*sim/i.test(value)?1:2;
  const sortedVariants=editing.variants.map((item,index) => ({ item,index })).sort((left,right) => compareMemoryValues(variantMemory(left.item),variantMemory(right.item))
    || (payload.options.colors.find((color)=>color.id===left.item.colorId)?.name??"").localeCompare(payload.options.colors.find((color)=>color.id===right.item.colorId)?.name??"","ru")
    || simRank(variantSim(left.item))-simRank(variantSim(right.item))
    || variantSim(left.item).localeCompare(variantSim(right.item),"ru")
    || left.index-right.index);
  const editorTabs=tradeInMode?tabItems.filter((item)=>item.id!=="related"):tabItems;
  return <section className="admin-modal admin-product-editor" role="dialog" aria-modal="true" aria-label={props.title}>
    <header className="admin-product-editor-head"><div><h2>{props.title}</h2><p>{props.dirty? "Есть несохранённые изменения":"Все данные загружены из каталога"}</p></div><button type="button" onClick={props.close} aria-label="Закрыть"><X size={19} /></button></header>
    <nav className="admin-product-editor-tabs" role="tablist" aria-label="Разделы товара">{editorTabs.map((item) => <button type="button" key={item.id} role="tab" aria-selected={props.activeTab===item.id} className={props.activeTab===item.id? "active":""} onClick={() => props.setActiveTab(item.id)}>{tradeInMode&&item.id==="variants"?"Цена и фотографии":item.label}{item.id==="variants"&&!tradeInMode? <small>{editing.variants.length}</small>:null}</button>)}</nav>
    <div className="admin-product-editor-body">

      {props.activeTab==="main"&&<div className="admin-product-editor-panel"><div className="admin-product-section-title"><div><h3>Основная информация</h3><p>Название, связь со справочниками и видимость товара</p></div></div><div className="admin-product-fields"><label className="wide admin-product-name-field">Название <sup>*</sup><input required autoFocus value={editing.name} onChange={(event) => props.setField({ name: event.target.value,slug: editing.id? editing.slug:uniqueSlugPreview(event.target.value,payload.data) })} /></label><label className="admin-product-slug-field">Slug <sup>*</sup><input required readOnly value={editing.slug} aria-readonly="true" /><small>Формируется автоматически; не меняется после создания</small></label><label className="admin-product-brand-field">Бренд <sup>*</sup><select required value={editing.brandId} onChange={(event) => { const brandId=event.target.value; props.setField({ brandId }); }}><option value="">Выберите бренд</option>{payload.options.brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="admin-product-type-field">Тип товара <sup>*</sup><select required value={editing.globalProductTypeId??""} onChange={(event) => props.setField({ globalProductTypeId: event.target.value })}><option value="">Выберите тип</option>{payload.options.types.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="admin-product-category-field">Категория <sup>*</sup><select required value={editing.categoryId} onChange={(event) => props.setField({ categoryId: event.target.value })}><option value="">Выберите категорию</option>{payload.options.categories.map((item) => <option key={item.id} value={item.id}>{item.parentId? "↳ ":""}{item.name}</option>)}</select></label><label className="admin-product-status-field">Статус<select value={editing.status} onChange={(event) => props.setField({ status: event.target.value })}><option value="DRAFT">Черновик</option><option value="PUBLISHED">Опубликован</option><option value="HIDDEN">Скрыт</option><option value="ARCHIVED">Архив</option></select></label><label className="wide admin-product-description-field">Описание<textarea rows={4} value={editing.description} onChange={(event) => props.setField({ description: event.target.value })} /></label></div>{!tradeInMode&&<div className="admin-product-settings-row"><label className="admin-check"><input type="checkbox" checked={editing.isNew} onChange={(event) => props.setField({ isNew: event.target.checked })} />Новинка</label></div>}</div>}
      {props.activeTab==="main"&&tradeInMode&&<TradeInProductFields product={editing} models={payload.options.models} setField={props.setField} />}
      {props.activeTab==="variants"&&<div className="admin-product-editor-panel admin-product-variants">
        <div className="admin-product-section-title"><div><h3>{tradeInMode?"Цена, доступность и фотографии экземпляра":`Варианты товара — ${editing.variants.length}`}</h3></div>{!tradeInMode&&<button type="button" className="admin-secondary" onClick={() => { const nextIndex=editing.variants.length; props.addVariant(); setSelectedVariant(nextIndex); setExpandedVariant(nextIndex); }}><Plus size={15}/>Добавить вариант</button>}</div>
        <div className="admin-variant-browser">
          <div className="admin-variant-list">{sortedVariants.map(({item,index}) => { const expanded=expandedVariant===index; return <div className={`admin-variant-list-item${expanded?" active":""}`} key={item.id??index}>
            <button type="button" aria-expanded={expanded} onClick={() => { setSelectedVariant(index); setExpandedVariant(expanded?null:index); }}><span><strong>{variantsLabel(item,index)}</strong><small>{item.sku??"Новый вариант"}</small></span><ChevronDown size={17} aria-hidden="true" /></button>
            <span className={`admin-variant-status${item.active?" is-active":""}`} title={item.active?"Активен":"Неактивен"} aria-label={item.active?"Активен":"Неактивен"}/>
            {!item.id&&<button type="button" className="remove" aria-label="Удалить новый вариант" onClick={() => { if(window.confirm("Удалить новый вариант?")) { props.removeVariant(index); setExpandedVariant(null); } }}><Trash2 size={15}/></button>}
            {expanded&&variant&&<div className="admin-variant-detail">
              <section className="admin-variant-block"><div className="admin-variant-block-head"><div><h4>Характеристики</h4></div></div><div className="admin-variant-core-grid"><label>SKU<input readOnly value={variant.sku??"Создаётся автоматически"}/></label><label className="admin-check"><input type="checkbox" checked={variant.active} onChange={(event)=>props.setVariantField(index,{active:event.target.checked})}/>Вариант активен</label></div><VariantAttributesEditor key={variant.id??index} variant={variant} variantKey={variant.id??index} productTypeKey={props.activeType?.globalTypeKey??""} options={registeredOptions} definitions={registeredDefinitions} colors={payload.options.colors} onColorChange={(colorId)=>props.setVariantField(index,{colorId})} onChange={(dictionaryOptionIds,attributes,changedCode,optionId)=>updateVariantAttributes(index,dictionaryOptionIds,attributes,changedCode,optionId)}/></section>
              <section className="admin-variant-block"><div className="admin-variant-block-head"><div><h4>Цены и доступность по городам</h4></div></div><div className="admin-city-table-wrap"><table className="admin-city-table"><thead><tr><th>Город</th><th>Цена</th><th>Старая цена</th><th>Доступность</th></tr></thead><tbody>{payload.options.cities.map((city)=>{const inventory=variant.inventory[city.id]??inventoryFor(city);const approved=approvedAvailability(inventory);const selectValue=approved??"__LEGACY__";return <tr key={city.id}><th>{city.name}</th><td><input aria-label={`Цена, ${city.name}`} type="number" min="0" step="1" value={inventory.price??""} onChange={(event)=>props.setInventoryField(index,city.id,{price:event.target.value===""?null:Number(event.target.value),...(event.target.value!==""&&inventory.availability==="UNSPECIFIED"?inventoryTupleForAvailability("IN_STOCK"):{})})}/></td><td className="admin-calculated-price"><input aria-label={`Старая цена, ${city.name}`} type="number" readOnly aria-readonly="true" value={calculateOldPrice(inventory.price)??""}/><small>+15%, вверх до 990</small></td><td><select aria-label={`Доступность, ${city.name}`} value={selectValue} onChange={(event)=>props.setInventoryField(index,city.id,inventoryTupleForAvailability(event.target.value as ApprovedAvailability))}>{!approved&&<option value="__LEGACY__" disabled>Прежнее значение: {inventoryAvailabilityLabel(inventory)}</option>}{APPROVED_AVAILABILITY_OPTIONS.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></td></tr>})}</tbody></table></div></section>
              <section className="admin-variant-block"><ProductGalleryPanel title="Фотографии" images={editing.images} scopeColorId={variant.colorId} colorName={payload.options.colors.find((entry)=>entry.id===variant.colorId)?.name??null} media={media} upload={props.upload} addImage={props.addImage} setImageField={props.setImageField} makeMainImage={props.makeMainImage} removeImage={props.removeImage}/></section>
              {!variant.id&&!tradeInMode&&<section className="admin-variant-block admin-variant-actions"><div><h4>Дополнительные действия</h4><p>Удаление касается только несохранённого варианта.</p></div><button type="button" className="admin-danger" onClick={() => { if(window.confirm("Удалить новый вариант?")) { props.removeVariant(index); setExpandedVariant(null); } }}><Trash2 size={15}/>Удалить вариант</button></section>}
            </div>}
          </div>; })}</div>
        </div>
      </div>}
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
  return <div className="admin-product-editor-panel related-products-editor"><div className="admin-product-section-title"><div><h3>Сопутствующие товары</h3><p>До 12 опубликованных товаров. Порядок выбранных товаров сохраняется на витрине.</p></div></div><label className="related-admin-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию или SKU" /></label><div className="related-admin-columns"><section className="related-admin-column"><h4>Доступные товары</h4><div className="related-admin-results">{available.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.slug}</small></span><button type="button" aria-label={`Добавить ${item.name}`} disabled={current.relatedProductIds.length>=12} onClick={() => onChange([...current.relatedProductIds,item.id])}><Plus size={16} /></button></div>)}{!available.length&&<p>Подходящих товаров не найдено.</p>}</div></section><section className="related-admin-column"><h4>Выбранные товары <span>{selected.length}/12</span></h4><div className="related-admin-selected">{selected.map((item,index) => <div key={item.id}><span>{index+1}. {item.name}</span><div><button type="button" aria-label={`Переместить ${item.name} выше`} disabled={index===0} onClick={() => move(index,-1)}><ChevronUp size={15} /></button><button type="button" aria-label={`Переместить ${item.name} ниже`} disabled={index===selected.length-1} onClick={() => move(index,1)}><ChevronDown size={15} /></button><button type="button" aria-label={`Удалить ${item.name}`} onClick={() => onChange(current.relatedProductIds.filter((id) => id!==item.id))}><Trash2 size={15} /></button></div></div>)}{!selected.length&&<p>Сопутствующие товары не выбраны.</p>}</div></section></div></div>;
}

function VariantAttributesEditor(props: {
  variant: Variant;
  variantKey: string|number;
  productTypeKey: string;
  options: DictionaryEntry[];
  definitions: Array<{code:string;name:string;scope:string;isActive:boolean;canAssign?:boolean;productTypeIds?:string[]}>;
  colors: Option[];
  onColorChange: (colorId: string|null) => void;
  onChange: (dictionaryOptionIds: Record<string,string|null>,attributes: Record<string,unknown>,changedCode: string,optionId: string|null) => void;
}) {
  const [drafts,setDrafts]=useState<Array<{ dictionary: string; optionId: string }>>([]);
  useEffect(() => { setDrafts([]); },[props.variantKey]);
  const definitions=props.definitions.filter((entry)=>entry.scope==="VARIANT");
  const typeLabel=(code:string)=>definitions.find((entry)=>entry.code===code)?.name??props.options.find((entry)=>entry.dictionary===code)?.definitionName??code;
  const fieldCodes:Record<string,{key:keyof Variant;value:string}>={memory:{key:"storage",value:props.variant.storage},ram:{key:"ram",value:props.variant.ram},sim:{key:"simType",value:props.variant.simType},connectivity:{key:"connectivity",value:props.variant.connectivity},size:{key:"size",value:props.variant.size},material:{key:"material",value:props.variant.material}};
  const codes=new Set([...Object.keys(props.variant.dictionaryOptionIds),...Object.keys(fieldCodes).filter((code)=>fieldCodes[code].value)]);
  const attributeOrder=["memory","sim","ram","size","connectivity","material"];
  const attributeRank=(code:string)=>{const index=attributeOrder.indexOf(code);return index<0?attributeOrder.length:index;};
  const saved=Array.from(codes).filter((code)=>props.variant.dictionaryOptionIds[code]||fieldCodes[code]?.value).sort((left,right)=>attributeRank(left)-attributeRank(right)||typeLabel(left).localeCompare(typeLabel(right),"ru")).map((code)=>({code,optionId:props.variant.dictionaryOptionIds[code]??"",legacyValue:fieldCodes[code]?.value??(typeof props.variant.attributes[code]==="string"?String(props.variant.attributes[code]):"")}));
  const attributeOnlyRows=Object.entries(props.variant.attributes).filter(([code,value])=>typeof value==="string"&&!codes.has(code)).sort(([left],[right])=>typeLabel(left).localeCompare(typeLabel(right),"ru"));
  const usedTypes=new Set([...saved.map((row)=>row.code),...drafts.map((draft)=>draft.dictionary).filter(Boolean)]);
  const valueOptions=(code: string,selectedId: string|null) => {
    const active=props.options.filter((option) => option.dictionary===code&&option.isActive);
    const selected=selectedId? props.options.find((option) => option.dictionary===code&&option.id===selectedId):undefined;
    return selected&&!active.some((option) => option.id===selected.id)? [selected,...active]:active;
  };
  const appliesToProductType=(entry: typeof definitions[number])=>entry.productTypeIds?.length?entry.productTypeIds.includes(props.variant.productTypeId??""):DICTIONARY_REGISTRY.some((item)=>item.code===entry.code)?isAttributeApplicable(classifyProductType(props.productTypeKey.split(":").pop()||""),entry.code as DictionaryCode):true;
  const assignableDefinitions=definitions.filter((entry)=>entry.isActive && entry.canAssign !== false && appliesToProductType(entry));
  const availableDefinitions=assignableDefinitions.filter((entry)=>props.options.some((option)=>option.dictionary===entry.code&&option.isActive)&&!usedTypes.has(entry.code));
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
    <div className="admin-product-section-title"><div><h4>Характеристики варианта</h4><p>Показываются параметры, применимые к типу товара.</p></div><button type="button" className="admin-secondary" onClick={() => setDrafts((rows) => [...rows,{ dictionary: "",optionId: "" }])}><Plus size={14} />Добавить характеристику</button></div>
    <label className="admin-variant-color-field">Цвет<select value={props.variant.colorId??""} onChange={(event) => props.onColorChange(event.target.value||null)}><option value="">Без цвета</option>{props.colors.map((color) => <option key={color.id} value={color.id}>{color.name}</option>)}</select></label>
    <div className="admin-variant-attribute-list">
      {saved.map(({code,optionId,legacyValue})=>{const normalized=legacyValue?props.options.find((option)=>option.dictionary===code&&option.isActive&&(option.label===legacyValue||(["memory","ram","sim"].includes(code)&&dictionaryValuesMatch(code as "memory"|"ram"|"sim",option.label,legacyValue)))):undefined;const selected=optionId||normalized?.id||"";const options=valueOptions(code,selected);return <div className="admin-variant-attribute-row is-saved" key={`saved-${code}`}><span>{typeLabel(code)}</span>{options.length?<select aria-label={`Значение характеристики ${typeLabel(code)}`} value={selected} onChange={(event)=>updateValue(code,event.target.value)}><option value="">{legacyValue?`${legacyValue} (текущее значение)`:"Не выбрано"}</option>{options.map((option)=><option key={option.id} value={option.id}>{option.label}{!option.isActive?" (неактивно)":""}</option>)}</select>:<input aria-label={`Сохранённое значение ${typeLabel(code)}`} readOnly value={legacyValue||props.options.find((option)=>option.id===optionId)?.label||""}/>}<button type="button" className="admin-icon-button" aria-label={`Удалить характеристику ${typeLabel(code)}`} onClick={()=>removeSaved(code)}><Trash2 size={15}/></button></div>;})}
      {drafts.map((draft,index) => <div className="admin-variant-attribute-row" key={`draft-${index}`}>
        <select aria-label="Тип характеристики" value={draft.dictionary} onChange={(event)=>setDrafts((rows)=>rows.map((row,rowIndex)=>rowIndex===index?{dictionary:event.target.value,optionId:""}:row))}><option value="">Характеристика</option>{assignableDefinitions.filter((entry)=>entry.isActive||entry.code===draft.dictionary).map((entry)=><option key={entry.code} value={entry.code} disabled={usedTypes.has(entry.code)&&entry.code!==draft.dictionary}>{entry.name}</option>)}</select>
        <select aria-label="Значение характеристики" value={draft.optionId} disabled={!draft.dictionary||!props.options.some((option)=>option.dictionary===draft.dictionary&&option.isActive)} onChange={(event)=>{const id=event.target.value;if(id)updateValue(draft.dictionary,id);setDrafts((rows)=>rows.filter((_,rowIndex)=>rowIndex!==index));}}><option value="">Значение</option>{valueOptions(draft.dictionary,draft.optionId).map((option)=><option key={option.id} value={option.id}>{option.label}</option>)}</select>
        <button type="button" className="admin-icon-button" aria-label="Удалить строку характеристики" onClick={() => setDrafts((rows) => rows.filter((_,rowIndex) => rowIndex!==index))}><Trash2 size={15} /></button>
      </div>)}
      {attributeOnlyRows.map(([code,value]) => <div className="admin-variant-attribute-row is-legacy" key={`legacy-${code}`}><span>{typeLabel(code)}</span><input aria-label={`Сохранённое значение ${typeLabel(code)}`} readOnly value={String(value)} /><button type="button" className="admin-icon-button" aria-label={`Удалить характеристику ${typeLabel(code)}`} onClick={() => { const attributes={ ...props.variant.attributes }; delete attributes[code]; props.onChange(props.variant.dictionaryOptionIds,attributes,code,null); }}><Trash2 size={15} /></button></div>)}
      {!saved.length&&!drafts.length&&!attributeOnlyRows.length&&<div className="admin-product-empty-images">Для варианта пока не добавлены характеристики.</div>}
      {availableDefinitions.length===0&&definitions.some((entry)=>entry.isActive)&&<small>Добавьте новые значения в справочнике характеристик.</small>}
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
  const exactImages=props.images.map((image,index) => ({ image,index })).filter(({ image }) => image.colorId===props.scopeColorId);
  const usingLegacyFallback=Boolean(props.scopeColorId)&&exactImages.length===0;
  const images=(usingLegacyFallback?props.images.map((image,index) => ({ image,index })).filter(({ image }) => image.colorId===null):exactImages).sort((a,b) => a.image.sortOrder-b.image.sortOrder);
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
    <div className="admin-product-section-title"><div><h4>{props.title}{props.colorName? ` · ${props.colorName}`:""}</h4><p>{usingLegacyFallback?"Показаны сохранённые общие фотографии. Новые фото будут привязаны к цвету варианта.":props.scopeColorId? "Галерея привязана к цвету: варианты этого цвета используют одни фотографии.":"Фотографии варианта без выбранного цвета."}</p></div><div className="admin-product-image-actions"><label className={`admin-secondary upload-control ${busy? "disabled":""}`}><ImagePlus size={15} />{busy? "Загрузка…":"Загрузить фото"}<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" disabled={busy} onChange={(event) => void addUpload(event)} /></label><button type="button" className="admin-secondary" onClick={() => props.addImage(props.scopeColorId)}><Plus size={15} />Из медиатеки</button></div></div>
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
function TradeInProductFields({ product,models,setField }: { product: Product; models: Payload["options"]["models"]; setField: (patch: Partial<Product>) => void }) {
  const updateSpecification=(key: string,value: unknown) => setField({ specifications: { ...product.specifications,[key]:value } });
  const availableModels=models.filter((model)=>model.brandId===product.brandId&&model.globalProductTypeId===product.globalProductTypeId);
  return <div className="admin-product-editor-panel admin-trade-in-panel"><div className="admin-product-section-title"><div><h3>Состояние экземпляра</h3><p>Данные конкретного устройства, принятого по Trade-in</p></div></div><div className="admin-product-fields admin-trade-in-fields"><label>Модель<select value={product.modelId??""} onChange={(event)=>setField({modelId:event.target.value||null})}><option value="">Без привязки к модели</option>{availableModels.map((model)=><option key={model.id} value={model.id}>{model.name}</option>)}</select></label><label>Состояние устройства<input value={tradeInSpecification(product,"tradeInCondition")} onChange={(event) => updateSpecification("tradeInCondition",event.target.value)} placeholder="Например, хорошее" /></label><label>Аккумулятор, %<input type="number" min="0" max="100" step="1" value={tradeInSpecification(product,"tradeInBatteryHealth")} onChange={(event) => updateSpecification("tradeInBatteryHealth",event.target.value===""?"":Number(event.target.value))} /></label><label>Комплектность<input value={tradeInSpecification(product,"tradeInEquipment")} onChange={(event) => updateSpecification("tradeInEquipment",event.target.value)} placeholder="Коробка, кабель, документы" /></label><label className="wide">Дефекты и особенности<textarea rows={3} value={tradeInSpecification(product,"tradeInDefects")} onChange={(event) => updateSpecification("tradeInDefects",event.target.value)} /></label></div></div>;
}
