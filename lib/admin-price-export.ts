import ExcelJS from "exceljs";
import { createHmac, randomUUID } from "node:crypto";
import { APPROVED_AVAILABILITY_OPTIONS, availabilityLabel, availabilitySnapshot } from "@/lib/inventory-availability";

export const PRICE_EXPORT_FORMAT_ID = "icenter-price-list";
export const PRICE_EXPORT_FORMAT_VERSION = "2";
export const MAX_PRICE_EXPORT_ROWS = 10_000;

export type PriceExportRow = {
  productId: string;
  variantId: string;
  cityId: string;
  inventoryId: string | null;
  snapshotUpdatedAt: Date | string;
  brandName: string;
  categoryName: string;
  productName: string;
  productTypeKey: string;
  productTypeName: string;
  sku: string;
  storage: string | null;
  colorName: string | null;
  simType: string | null;
  ram: string | null;
  connectivity: string | null;
  size: string | null;
  material: string | null;
  label: string | null;
  attributes: unknown;
  resolvedAttributes?: unknown;
  price: string | null;
  availability: string | null;
  allowPreorder: boolean | null;
  deliveryTime: string | null;
};

export type PriceExportMetadata = {
  cityName: string;
  brandName: string | null;
  categoryName: string | null;
  generatedAt?: Date;
  exportId?: string;
};

const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });
function text(value: unknown) {
  return String(value ?? "").trim();
}

function comparable(value: unknown) {
  return text(value).normalize("NFKC").toLocaleLowerCase("ru-RU");
}

export function excelSafeText(value: unknown) {
  const cleaned = text(value).replaceAll("\u0000", "");
  return /^[=+\-@\t\r]/.test(cleaned) ? `'${cleaned}` : cleaned;
}

export function storageMegabytes(value: unknown) {
  const normalized = comparable(value).replaceAll(",", ".").replace(/\s+/g, "");
  const match = normalized.match(/(\d+(?:\.\d+)?)(tb|тб|gb|гб|mb|мб)/i);
  if (!match) return Number.POSITIVE_INFINITY;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return Number.POSITIVE_INFINITY;
  if (/^(tb|тб)$/i.test(match[2])) return amount * 1024 * 1024;
  if (/^(gb|гб)$/i.test(match[2])) return amount * 1024;
  return amount;
}

export function formatStorage(value: unknown) {
  const megabytes = storageMegabytes(value);
  if (!Number.isFinite(megabytes)) return excelSafeText(value);
  const gigabytes = megabytes / 1024;
  if (gigabytes >= 1024 && gigabytes % 1024 === 0) return `${gigabytes / 1024} ТБ`;
  return `${Number.isInteger(gigabytes) ? gigabytes : gigabytes.toFixed(1)} ГБ`;
}

function numericValue(value: unknown) {
  const match = comparable(value).replaceAll(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
}

function simRank(value: unknown) {
  const normalized = comparable(value).replace(/\s+/g, " ");
  if (normalized === "esim") return 0;
  if (normalized.includes("esim") && /(физ|nano|sim\s*\+)/.test(normalized)) return 1;
  if (normalized.includes("esim")) return 1;
  if (normalized) return 2;
  return 3;
}

function productKind(row: PriceExportRow) {
  const source = comparable(`${row.productTypeKey} ${row.productTypeName} ${row.categoryName}`);
  if (source.includes("smartphone") || source.includes("смартфон")) return "smartphone";
  if (source.includes("laptop") || source.includes("notebook") || source.includes("ноутбук")) return "laptop";
  if (source.includes("tablet") || source.includes("планшет")) return "tablet";
  if (source.includes("watch") || source.includes("час")) return "watch";
  if (source.includes("headphone") || source.includes("наушник")) return "headphones";
  return "other";
}

function compareText(left: unknown, right: unknown) {
  return collator.compare(text(left), text(right));
}

function compareNumber(left: number, right: number) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareVariantFields(left: PriceExportRow, right: PriceExportRow) {
  const kind = productKind(left);
  const comparisons: number[] = [];
  const storage = () => compareNumber(storageMegabytes(left.storage), storageMegabytes(right.storage));
  const ram = () => compareNumber(storageMegabytes(left.ram), storageMegabytes(right.ram));
  const color = () => compareText(left.colorName, right.colorName);
  const sim = () => compareNumber(simRank(left.simType), simRank(right.simType)) || compareText(left.simType, right.simType);
  const connectivity = () => compareText(left.connectivity, right.connectivity);
  const size = () => compareNumber(numericValue(left.size), numericValue(right.size)) || compareText(left.size, right.size);
  const material = () => compareText(left.material, right.material);

  if (kind === "smartphone") comparisons.push(storage(), color(), sim(), ram(), connectivity(), size(), material());
  else if (kind === "laptop") comparisons.push(storage(), ram(), color(), connectivity(), size(), material(), sim());
  else if (kind === "tablet") comparisons.push(storage(), color(), connectivity(), ram(), size(), material(), sim());
  else if (kind === "watch") comparisons.push(size(), material(), color(), storage(), ram(), connectivity(), sim());
  else if (kind === "headphones") comparisons.push(color(), compareText(left.label, right.label), storage(), ram(), connectivity(), size(), material(), sim());
  else comparisons.push(storage(), ram(), color(), sim(), connectivity(), size(), material());
  return comparisons.find((value) => value !== 0) ?? 0;
}

export function sortPriceExportRows(rows: PriceExportRow[]) {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) =>
      compareText(left.row.brandName, right.row.brandName)
      || compareText(left.row.categoryName, right.row.categoryName)
      || compareText(left.row.productName, right.row.productName)
      || compareVariantFields(left.row, right.row)
      || compareText(left.row.sku, right.row.sku)
      || compareText(left.row.variantId, right.row.variantId)
      || left.index - right.index)
    .map(({ row }) => row);
}

function attributeValues(value: unknown) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string" || typeof item === "number") return [text(item)];
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      return [record.label, record.value, record.name].map(text).filter(Boolean);
    });
  }
  if (typeof value !== "object") return [text(value)].filter(Boolean);
  const ignored = new Set(["storage", "memory", "ram", "sim", "simtype", "connectivity", "size", "material", "color", "colorname"]);
  return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !ignored.has(comparable(key)))
    .flatMap(([, item]) => Array.isArray(item) ? item.map(text) : [text(item)])
    .filter(Boolean);
}

type ResolvedAttribute = { code: string; name: string; value: string };

function resolvedAttributeValues(value: unknown) {
  if (!Array.isArray(value)) return [] as ResolvedAttribute[];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const code = text(record.code);
    const name = text(record.name);
    const resolvedValue = text(record.value);
    return code && name && resolvedValue ? [{ code, name, value: resolvedValue }] : [];
  });
}

function technicalIdentifier(value: string) {
  return /^c[a-z0-9]{20,}$/i.test(value) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value);
}

export function otherCharacteristics(row: PriceExportRow) {
  const excludedCodes = new Set(["storage", "memory", "color", "colorname", "sim", "simtype", "ram", "connectivity"]);
  const resolved = resolvedAttributeValues(row.resolvedAttributes)
    .filter((entry) => !excludedCodes.has(comparable(entry.code)))
    .map((entry) => `${entry.name}: ${entry.value}`);
  const resolvedCodes = new Set(resolvedAttributeValues(row.resolvedAttributes).map((entry) => comparable(entry.code)));
  const known = [row.storage, row.colorName, row.simType, row.ram, row.connectivity, row.size, row.material]
    .map(comparable)
    .filter(Boolean);
  const parts = text(row.label).split(/\s*[•,;]\s*/).map(text).filter((part) => part && !technicalIdentifier(part));
  const labelParts = parts.filter((part) => {
    const normalized = comparable(part);
    const memory = storageMegabytes(part);
    return !known.some((value) => value === normalized)
      && !(Number.isFinite(memory) && known.some((value) => storageMegabytes(value) === memory));
  });
  const legacyValues = row.attributes && typeof row.attributes === "object" && !Array.isArray(row.attributes)
    ? Object.entries(row.attributes as Record<string, unknown>)
      .filter(([code]) => !excludedCodes.has(comparable(code)) && !resolvedCodes.has(comparable(code)))
      .flatMap(([code, value]) => {
        const values = Array.isArray(value) ? value.map(text) : [text(value)];
        const name = code.replace(/([a-zа-яё0-9])([A-ZА-ЯЁ])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
        const label = name ? name.charAt(0).toLocaleUpperCase("ru-RU") + name.slice(1) : "";
        return values.filter((item) => item && !technicalIdentifier(item)).map((item) => `${label}: ${item}`);
      })
    : attributeValues(row.attributes).filter((value) => !technicalIdentifier(value));
  const fallback = [row.size ? `Размер: ${text(row.size)}` : "", row.material ? `Материал: ${text(row.material)}` : ""];
  const values = [...resolved, ...fallback, ...labelParts, ...legacyValues];
  return excelSafeText(Array.from(new Set(values.map(text).filter(Boolean))).join("; "));
}

function decimal(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("EXPORT_NON_INTEGER_PRICE");
  return parsed;
}

function snapshotTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? text(value) : date.toISOString();
}

export function priceExportRowSignature(row: Pick<PriceExportRow, "productId" | "variantId" | "cityId" | "inventoryId" | "snapshotUpdatedAt" | "price" | "availability">, exportId: string, signingKey: string) {
  const payload = JSON.stringify([
    PRICE_EXPORT_FORMAT_ID,
    PRICE_EXPORT_FORMAT_VERSION,
    exportId,
    row.productId,
    row.variantId,
    row.cityId,
    row.inventoryId,
    snapshotTime(row.snapshotUpdatedAt),
    row.price,
    row.availability,
  ]);
  return createHmac("sha256", signingKey).update(payload).digest("base64url");
}

export async function buildPriceExportWorkbook(rows: PriceExportRow[], metadata: PriceExportMetadata, signingKey: string) {
  if (!signingKey || signingKey.length < 16) throw new Error("EXPORT_SIGNING_KEY_UNAVAILABLE");
  if (rows.length > MAX_PRICE_EXPORT_ROWS) throw new Error("EXPORT_ROW_LIMIT_EXCEEDED");

  const generatedAt = metadata.generatedAt ?? new Date();
  const exportId = metadata.exportId ?? randomUUID();
  const sortedRows = sortPriceExportRows(rows);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "iCenter";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.calcProperties.fullCalcOnLoad = false;

  const sheet = workbook.addWorksheet("Прайс-лист", {
    views: [{ state: "frozen", ySplit: 1, activeCell: "A2", showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = [
    { header: "Бренд", key: "brand", width: 18 },
    { header: "Категория", key: "category", width: 20 },
    { header: "Модель / название товара", key: "product", width: 31 },
    { header: "Артикул SKU", key: "sku", width: 23 },
    { header: "Память", key: "storage", width: 13 },
    { header: "Цвет", key: "color", width: 22 },
    { header: "SIM", key: "sim", width: 24 },
    { header: "RAM", key: "ram", width: 12 },
    { header: "Connectivity", key: "connectivity", width: 17 },
    { header: "Другие характеристики", key: "other", width: 32 },
    { header: "Актуальная цена", key: "price", width: 18 },
    { header: "Доступность", key: "availability", width: 18 },
    { header: "_productId", key: "productId", width: 28, hidden: true },
    { header: "_variantId", key: "variantId", width: 28, hidden: true },
    { header: "_cityId", key: "cityId", width: 28, hidden: true },
    { header: "_inventoryId", key: "inventoryId", width: 28, hidden: true },
    { header: "_snapshotUpdatedAt", key: "snapshotUpdatedAt", width: 26, hidden: true },
    { header: "_originalPrice", key: "originalPrice", width: 18, hidden: true },
    { header: "_originalAvailability", key: "originalAvailability", width: 22, hidden: true },
    { header: "_exportId", key: "exportId", width: 38, hidden: true },
    { header: "_formatId", key: "formatId", width: 24, hidden: true },
    { header: "_formatVersion", key: "formatVersion", width: 18, hidden: true },
    { header: "_snapshotSignature", key: "snapshotSignature", width: 48, hidden: true },
  ];

  const header = sheet.getRow(1);
  header.height = 30;
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF263746" } };
  header.eachCell((cell) => {
    cell.border = { bottom: { style: "medium", color: { argb: "FF17212B" } } };
    cell.protection = { locked: true };
  });

  let previousProductId = "";
  let groupIndex = -1;
  for (const source of sortedRows) {
    const originalAvailability = source.inventoryId ? availabilitySnapshot(source) : "";
    const startsModel = source.productId !== previousProductId;
    if (startsModel) groupIndex += 1;
    previousProductId = source.productId;
    const row = sheet.addRow({
      brand: excelSafeText(source.brandName),
      category: excelSafeText(source.categoryName),
      product: excelSafeText(source.productName),
      sku: excelSafeText(source.sku),
      storage: formatStorage(source.storage),
      color: excelSafeText(source.colorName),
      sim: excelSafeText(source.simType),
      ram: formatStorage(source.ram),
      connectivity: excelSafeText(source.connectivity),
      other: otherCharacteristics(source),
      price: decimal(source.price),
      availability: source.inventoryId ? availabilityLabel(source) : "",
      productId: source.productId,
      variantId: source.variantId,
      cityId: source.cityId,
      inventoryId: source.inventoryId ?? "",
      snapshotUpdatedAt: snapshotTime(source.snapshotUpdatedAt),
      originalPrice: source.price ?? "",
      originalAvailability,
      exportId,
      formatId: PRICE_EXPORT_FORMAT_ID,
      formatVersion: PRICE_EXPORT_FORMAT_VERSION,
      snapshotSignature: priceExportRowSignature({ ...source, availability: originalAvailability }, exportId, signingKey),
    });
    row.height = 24;
    row.alignment = { vertical: "middle", wrapText: true };
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cell.protection = { locked: true };
      if (startsModel) cell.border = { top: { style: "medium", color: { argb: "FF9DA8B4" } } };
      if (groupIndex % 2 === 1 && columnNumber <= 10) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FB" } };
      }
    });
    for (const key of ["price", "availability"]) {
      const cell = row.getCell(key);
      cell.protection = { locked: false };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4CC" } };
    }
    row.getCell("price").numFmt = '#,##0 "₽"';
    row.getCell("availability").dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${APPROVED_AVAILABILITY_OPTIONS.map(([, label]) => label).join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Некорректная доступность",
      error: "Выберите значение из списка.",
    };
  }

  sheet.getColumn("sku").numFmt = "@";
  for (const key of ["productId", "variantId", "cityId", "inventoryId", "snapshotUpdatedAt", "exportId", "formatId", "formatVersion", "snapshotSignature"]) {
    sheet.getColumn(key).numFmt = "@";
  }
  sheet.autoFilter = { from: "A1", to: "L1" };
  await sheet.protect("icenter-price-list", {
    selectLockedCells: false,
    selectUnlockedCells: true,
    autoFilter: true,
    sort: true,
  });

  const instruction = workbook.addWorksheet("Инструкция", { views: [{ showGridLines: false }] });
  instruction.columns = [{ width: 28 }, { width: 72 }];
  instruction.mergeCells("A1:B1");
  instruction.getCell("A1").value = "iCenter — экспорт цен и доступности";
  instruction.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  instruction.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF263746" } };
  instruction.getCell("A1").alignment = { vertical: "middle" };
  instruction.getRow(1).height = 34;
  const details: Array<[string, string | number]> = [
    ["Город", metadata.cityName],
    ["Бренд", metadata.brandName ?? "Все бренды"],
    ["Категория", metadata.categoryName ?? "Все категории"],
    ["Дата экспорта", generatedAt.toLocaleString("ru-RU")],
    ["Количество вариантов", sortedRows.length],
    ["Идентификатор экспорта", exportId],
    ["Формат", `${PRICE_EXPORT_FORMAT_ID} v${PRICE_EXPORT_FORMAT_VERSION}`],
  ];
  for (const [label, value] of details) instruction.addRow([label, excelSafeText(value)]);
  instruction.addRow([]);
  instruction.addRow(["Редактируемые поля", "Актуальная цена и доступность выделены мягким жёлтым цветом."]);
  instruction.addRow(["Цена", "Указывайте целое количество рублей без копеек. Старая цена рассчитывается автоматически."]);
  instruction.addRow(["Доступность", `Допустимы только: ${APPROVED_AVAILABILITY_OPTIONS.map(([, label]) => `«${label}»`).join(", ")}.`]);
  instruction.addRow(["Служебные поля", "Скрыты и защищены от случайного редактирования. Подпись snapshot будет проверяться сервером на этапе импорта."]);
  instruction.addRow(["Важно", "Не переименовывайте листы и колонки. Защита Excel предотвращает случайные изменения, но не является механизмом доверия."]);
  instruction.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.height = 24;
      row.getCell(1).font = { bold: true, color: { argb: "FF3F4856" } };
      row.alignment = { vertical: "middle", wrapText: true };
      row.eachCell((cell) => { cell.protection = { locked: true }; });
    }
  });
  await instruction.protect("icenter-price-list", { selectLockedCells: true, selectUnlockedCells: false });

  const buffer = await workbook.xlsx.writeBuffer({ useStyles: true, useSharedStrings: true });
  return { buffer, exportId, rowCount: sortedRows.length };
}
