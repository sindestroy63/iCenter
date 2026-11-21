import "server-only";

import ExcelJS from "exceljs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { Prisma } from "@prisma/client";
import { adminDb, newId } from "@/lib/admin-db";
import { auditInventoryChanges, type InventoryAuditRow } from "@/lib/admin-audit";
import { getPriceExportOptions } from "@/lib/admin-price-export-data";
import { MAX_PRICE_EXPORT_ROWS } from "@/lib/admin-price-export";
import { PRICE_EXPORT_FORMAT_ID, PRICE_EXPORT_FORMAT_VERSION, priceExportRowSignature } from "@/lib/admin-price-signature";
import { evaluateCityAccess } from "@/lib/city-access-policy";
import { calculateOldPrice } from "@/lib/product-price";
import { APPROVED_AVAILABILITY, APPROVED_AVAILABILITY_OPTIONS, availabilityLabelFromSnapshot, availabilitySnapshot, inventoryTupleForAvailability, type ApprovedAvailability } from "@/lib/inventory-availability";

export const MAX_PRICE_IMPORT_BYTES = 8 * 1024 * 1024;
const PREVIEW_TTL_MS = 15 * 60 * 1000;
const PREVIEW_TOKEN_MAX_BYTES = 4 * 1024 * 1024;

type ImportSession = {
  userId: string;
  role: string;
  isActive: boolean;
  allCities: boolean;
  allCitiesCanManagePrices: boolean;
  allCitiesCanManageStock: boolean;
  sessionId: string;
  name: string | null;
};

type ImportRow = {
  rowNumber: number;
  productId: string;
  variantId: string;
  cityId: string;
  inventoryId: string | null;
  snapshotUpdatedAt: string;
  exportId: string;
  sku: string;
  productName: string;
  originalPrice: string | null;
  originalAvailability: string | null;
  signature: string;
  price: number | null;
  availability: string | null;
  changes: string[];
  errors: string[];
  warnings: string[];
};

type PreviewToken = {
  version: 1;
  userId: string;
  cityId: string;
  exportId: string;
  expiresAt: number;
  rows: ImportRow[];
};

type CurrentRow = {
  productId: string;
  variantId: string;
  productName: string;
  productStatus: string;
  sku: string;
  variantActive: boolean;
  inventoryId: string | null;
  price: string | null;
  oldPrice: string | null;
  availability: string | null;
  stock: number | null;
  allowPreorder: boolean | null;
  deliveryTime: string | null;
  inventoryActive: boolean | null;
  inventoryUpdatedAt: Date | null;
  sourceUpdatedAt: Date;
};

const expectedHeaders = [
  "Бренд", "Категория", "Модель / название товара", "Артикул SKU", "Память", "Цвет", "SIM", "RAM", "Connectivity", "Другие характеристики",
  "Актуальная цена", "Доступность", "_productId", "_variantId", "_cityId", "_inventoryId", "_snapshotUpdatedAt",
  "_originalPrice", "_originalAvailability", "_exportId", "_formatId", "_formatVersion", "_snapshotSignature",
];

const legacyHeaders = [
  "Бренд", "Категория", "Модель / название товара", "Артикул SKU", "Память", "Цвет", "SIM", "RAM", "Connectivity", "Другие характеристики",
  "Актуальная цена", "Старая цена", "Доступность", "_productId", "_variantId", "_cityId", "_inventoryId", "_snapshotUpdatedAt",
  "_originalPrice", "_originalOldPrice", "_originalAvailability", "_exportId", "_formatId", "_formatVersion", "_snapshotSignature",
];

const availabilityByLabel = Object.fromEntries(APPROVED_AVAILABILITY_OPTIONS.map(([value, label]) => [label, value])) as Record<string, ApprovedAvailability>;

function cellValue(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value)) throw new Error("IMPORT_FORMULA_NOT_ALLOWED");
  return value;
}

function stringValue(value: ExcelJS.CellValue | null | undefined) {
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function integerPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  let amount: number;
  if (typeof value === "number") amount = value;
  else if (typeof value === "string" && /^\d{1,8}$/.test(value.trim())) amount = Number(value.trim());
  else throw new Error("IMPORT_PRICE_INVALID");
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 99_999_999) throw new Error("IMPORT_PRICE_INVALID");
  return amount;
}

function snapshotPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(String(value).replace(",", "."));
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 99_999_999) throw new Error("IMPORT_PRICE_INVALID");
  return amount;
}

function canonicalDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function equalSignature(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function addError(row: ImportRow, message: string) {
  if (!row.errors.includes(message)) row.errors.push(message);
}

function parseWorkbook(buffer: Buffer, selectedCityId: string, signingKey: string) {
  if (buffer.length > MAX_PRICE_IMPORT_BYTES) throw new Error("IMPORT_FILE_TOO_LARGE");
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error("IMPORT_FILE_INVALID");
  const workbook = new ExcelJS.Workbook();
  const rows: ImportRow[] = [];
  return workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]).then((loaded) => {
    if (loaded.worksheets.length !== 2) throw new Error("IMPORT_FORMAT_INVALID");
    const sheet = loaded.getWorksheet("Прайс-лист");
    const instructions = loaded.getWorksheet("Инструкция");
    if (!sheet || !instructions || sheet.rowCount > MAX_PRICE_EXPORT_ROWS + 1) throw new Error("IMPORT_FORMAT_INVALID");
    const actualHeaders = Array.from({ length: sheet.columnCount }, (_, index) => stringValue(cellValue(sheet.getRow(1).getCell(index + 1))));
    if (actualHeaders.length === legacyHeaders.length && actualHeaders[10] === "Актуальная цена" && actualHeaders[11] === "Старая цена") throw new Error("IMPORT_TEMPLATE_OUTDATED");
    if (sheet.columnCount !== expectedHeaders.length) throw new Error("IMPORT_FORMAT_INVALID");
    const headers = expectedHeaders.map((_, index) => stringValue(cellValue(sheet.getRow(1).getCell(index + 1))));
    if (headers.some((header, index) => header !== expectedHeaders[index])) throw new Error("IMPORT_COLUMNS_INVALID");
    const exportId = stringValue(cellValue(instructions.getCell("B7")));
    const format = stringValue(cellValue(instructions.getCell("B8")));
    const declaredCount = Number(cellValue(instructions.getCell("B6")));
    if (format.startsWith(`${PRICE_EXPORT_FORMAT_ID} v`) && format !== `${PRICE_EXPORT_FORMAT_ID} v${PRICE_EXPORT_FORMAT_VERSION}`) throw new Error("IMPORT_TEMPLATE_OUTDATED");
    if (!exportId || format !== `${PRICE_EXPORT_FORMAT_ID} v${PRICE_EXPORT_FORMAT_VERSION}` || !Number.isInteger(declaredCount) || declaredCount < 0 || declaredCount > MAX_PRICE_EXPORT_ROWS) throw new Error("IMPORT_FORMAT_INVALID");

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const excelRow = sheet.getRow(rowNumber);
      const values = expectedHeaders.map((_, index) => cellValue(excelRow.getCell(index + 1)));
      if (values.every((value) => value === null || value === undefined || value === "")) continue;
      const getText = (column: number) => stringValue(values[column - 1]);
      const originalPrice = getText(18) || null;
      const originalAvailability = getText(19) || null;
      const row: ImportRow = {
        rowNumber,
        productId: getText(13),
        variantId: getText(14),
        cityId: getText(15),
        inventoryId: getText(16) || null,
        snapshotUpdatedAt: getText(17),
        exportId: getText(20),
        sku: getText(4),
        productName: getText(3),
        originalPrice,
        originalAvailability,
        signature: getText(23),
        price: null,
        availability: null,
        changes: [],
        errors: [],
        warnings: [],
      };
      rows.push(row);
      if (!row.productId || !row.variantId || !row.sku || !row.snapshotUpdatedAt || !row.signature || row.exportId !== exportId) addError(row, "Повреждены служебные данные строки.");
      if (getText(21) !== PRICE_EXPORT_FORMAT_ID || getText(22) !== PRICE_EXPORT_FORMAT_VERSION) addError(row, "Идентификатор или версия формата строки не совпадает.");
      if (row.cityId !== selectedCityId) addError(row, "Файл создан для другого города.");
      if (!Number.isFinite(new Date(row.snapshotUpdatedAt).getTime())) addError(row, "Некорректная дата snapshot.");
      if (["PREORDER", "OUT_OF_STOCK", "UNSPECIFIED"].includes(originalAvailability ?? "")) addError(row, "Файл содержит прежний неоднозначный формат доступности. Экспортируйте новый файл.");
      else if (originalAvailability && !(originalAvailability in APPROVED_AVAILABILITY) && !originalAvailability.startsWith("LEGACY_")) addError(row, "Некорректное исходное значение доступности.");
      try {
        const originalPriceValue = snapshotPrice(originalPrice);
        const calculated = priceExportRowSignature({
          productId: row.productId,
          variantId: row.variantId,
          cityId: row.cityId,
          sku: row.sku,
          inventoryId: row.inventoryId,
          snapshotUpdatedAt: row.snapshotUpdatedAt,
          price: originalPrice,
          availability: originalAvailability,
        }, exportId, signingKey);
        if (!equalSignature(row.signature, calculated)) addError(row, "Подпись исходных значений не совпадает. Скачайте новый экспорт и повторите импорт.");

        const priceCell = values[10];
        const priceValue = integerPrice(priceCell);
        row.price = priceValue;
        if (priceValue !== originalPriceValue) {
          if (priceValue === null) addError(row, "Актуальную цену нельзя очистить.");
          else row.changes.push("price");
        }
        if (priceValue !== null && priceCell !== null && priceCell !== undefined && priceCell !== "" && typeof priceCell !== "number" && typeof priceCell !== "string") addError(row, `Строка ${rowNumber}: цена должна быть числом в формате Excel, не формулой.`);

        const visibleAvailability = stringValue(values[11]);
        if (values[11] !== null && values[11] !== undefined && typeof values[11] !== "string") addError(row, "Доступность должна быть текстовым значением из списка.");
        const mappedAvailability = availabilityByLabel[visibleAvailability];
        if (visibleAvailability && !mappedAvailability && visibleAvailability !== availabilityLabelFromSnapshot(originalAvailability)) addError(row, "Выберите допустимую доступность из списка.");
        else if (!visibleAvailability) {
          if (originalAvailability && originalAvailability !== "UNSPECIFIED") addError(row, "Доступность нельзя очистить.");
          else row.availability = originalAvailability;
        } else {
          row.availability = mappedAvailability ?? originalAvailability;
          if (row.availability !== (originalAvailability ?? "")) row.changes.push("availability");
        }

        if (row.availability && row.availability !== "CHECK_AVAILABILITY" && !row.availability.startsWith("LEGACY_") && row.price === null) addError(row, "Для этой доступности требуется актуальная цена.");
      } catch (error) {
        addError(row, error instanceof Error && error.message === "IMPORT_PRICE_INVALID" ? `Строка ${rowNumber}: цена должна быть целым числом рублей от 0 до 99 999 999, без копеек.` : "Некорректное значение цены.");
      }
    }
    if (rows.length !== declaredCount || rows.length === 0 && declaredCount !== 0) throw new Error("IMPORT_ROW_COUNT_MISMATCH");
    if (rows.length > MAX_PRICE_EXPORT_ROWS) throw new Error("IMPORT_ROW_LIMIT_EXCEEDED");
    const variants = new Map<string, ImportRow[]>();
    const skus = new Map<string, ImportRow[]>();
    for (const row of rows) {
      variants.set(row.variantId, [...(variants.get(row.variantId) ?? []), row]);
      skus.set(row.sku, [...(skus.get(row.sku) ?? []), row]);
    }
    for (const duplicates of Array.from(variants.values())) if (duplicates.length > 1) duplicates.forEach((row) => addError(row, "В файле повторяется variantId."));
    for (const duplicates of Array.from(skus.values())) if (duplicates.length > 1) duplicates.forEach((row) => addError(row, "В файле повторяется SKU."));
    return rows;
  }).catch((error) => {
    if (error instanceof Error && error.message.startsWith("IMPORT_")) throw error;
    throw new Error("IMPORT_FILE_INVALID");
  });
}

async function queryCurrentRows(tx: Prisma.TransactionClient | ReturnType<typeof adminDb>, rows: ImportRow[], cityId: string, lock = false) {
  if (!rows.length) return [] as CurrentRow[];
  const ids = rows.map((row) => row.variantId);
  return tx.$queryRaw<CurrentRow[]>(Prisma.sql`
    SELECT p.id AS "productId",v.id AS "variantId",p.name AS "productName",p.status::text AS "productStatus",
      v.sku,v."isActive" AS "variantActive",i.id AS "inventoryId",i.price::text AS price,i."oldPrice"::text AS "oldPrice",
      i.availability::text AS availability,i.stock,i."allowPreorder",i."deliveryTime",i."isActive" AS "inventoryActive",
      i."updatedAt" AS "inventoryUpdatedAt",COALESCE(v."updatedAt",p."updatedAt") AS "sourceUpdatedAt"
    FROM product_variants v JOIN products p ON p.id=v."productId"
    LEFT JOIN inventory i ON i."variantId"=v.id AND i."cityId"=${cityId}
    WHERE v.id IN (${Prisma.join(ids)})
    ${lock ? Prisma.raw("FOR UPDATE OF p,v") : Prisma.empty}
  `);
}

function compareSnapshot(row: ImportRow, current: CurrentRow | undefined) {
  if (!current) return "Вариант или товар больше не существует.";
  if (current.productId !== row.productId || current.sku !== row.sku || current.productStatus !== "PUBLISHED" || !current.variantActive) return "Товар, SKU или активность варианта изменились после экспорта.";
  if (row.inventoryId) {
    if (current.inventoryId !== row.inventoryId || !current.inventoryActive) return "Запись Inventory отсутствует или была деактивирована.";
    if (canonicalDate(current.inventoryUpdatedAt!) !== canonicalDate(row.snapshotUpdatedAt)) return "Inventory изменён после экспорта.";
    if (snapshotPrice(current.price) !== snapshotPrice(row.originalPrice) || availabilitySnapshot(current) !== row.originalAvailability) return "Исходные значения Inventory изменились после экспорта.";
  } else {
    if (current.inventoryId) {
      if (!isEmptyInventory(current)) return current.inventoryActive ? "После экспорта для города появилась запись Inventory с актуальными данными; сначала проверьте её в выбранном городе." : "Для варианта есть скрытая неактивная запись Inventory; импорт не будет её активировать.";
    } else if (canonicalDate(current.sourceUpdatedAt) !== canonicalDate(row.snapshotUpdatedAt)) return "Товар или вариант изменён после экспорта.";
  }
  return "";
}

function isEmptyInventory(current: CurrentRow) {
  return current.inventoryActive === true
    && current.price === null
    && current.oldPrice === null
    && (current.availability === null || current.availability === "UNSPECIFIED")
    && current.stock === null
    && current.allowPreorder !== true
    && current.deliveryTime === null;
}

function compareIdentity(row: ImportRow, current: CurrentRow | undefined) {
  if (!current) return "Вариант или товар больше не существует.";
  if (current.productId !== row.productId || current.sku !== row.sku || current.productStatus !== "PUBLISHED" || !current.variantActive) return "Товар, SKU или активность варианта изменились после экспорта.";
  return "";
}

function checkCanManageCity(session: ImportSession, cityId: string) {
  return getPriceExportOptions(session).then((options) => {
    if (!options.cities.some((city) => city.id === cityId)) throw new Error("EXPORT_CITY_FORBIDDEN");
  });
}

function signPreview(payload: PreviewToken, signingKey: string) {
  const encoded = deflateRawSync(Buffer.from(JSON.stringify(payload))).toString("base64url");
  const signature = createHmac("sha256", signingKey).update(`icenter-price-import-v1.${encoded}`).digest("base64url");
  return `${encoded}.${signature}`;
}

function readPreview(token: string, signingKey: string, userId: string): PreviewToken {
  if (token.length > PREVIEW_TOKEN_MAX_BYTES) throw new Error("IMPORT_PREVIEW_INVALID");
  const separator = token.lastIndexOf(".");
  if (separator <= 0) throw new Error("IMPORT_PREVIEW_INVALID");
  const encoded = token.slice(0, separator);
  const supplied = token.slice(separator + 1);
  const expected = createHmac("sha256", signingKey).update(`icenter-price-import-v1.${encoded}`).digest("base64url");
  if (!equalSignature(supplied, expected)) throw new Error("IMPORT_PREVIEW_INVALID");
  let payload: PreviewToken;
  try {
    payload = JSON.parse(inflateRawSync(Buffer.from(encoded, "base64url"), { maxOutputLength: 16 * 1024 * 1024 }).toString("utf8")) as PreviewToken;
  } catch { throw new Error("IMPORT_PREVIEW_INVALID"); }
  if (payload.version !== 1 || payload.userId !== userId || payload.expiresAt < Date.now() || !Array.isArray(payload.rows) || payload.rows.length > MAX_PRICE_EXPORT_ROWS) throw new Error("IMPORT_PREVIEW_EXPIRED");
  return payload;
}

function verifySnapshotRows(payload: PreviewToken, signingKey: string) {
  const ids = new Set<string>();
  const skus = new Set<string>();
  for (const row of payload.rows) {
    if (row.cityId !== payload.cityId || row.exportId !== payload.exportId || ids.has(row.variantId) || skus.has(row.sku)) throw new Error("IMPORT_PREVIEW_INVALID");
    ids.add(row.variantId);
    skus.add(row.sku);
    const expected = priceExportRowSignature({
      productId: row.productId,
      variantId: row.variantId,
      cityId: row.cityId,
      sku: row.sku,
      inventoryId: row.inventoryId,
      snapshotUpdatedAt: row.snapshotUpdatedAt,
      price: row.originalPrice,
      availability: row.originalAvailability,
    }, payload.exportId, signingKey);
    if (!equalSignature(row.signature, expected) || !row.changes.length || row.errors.length) throw new Error("IMPORT_PREVIEW_INVALID");
  }
}

export async function previewPriceImport(session: ImportSession, buffer: Buffer, cityId: string, signingKey: string) {
  if (!signingKey || signingKey.length < 16) throw new Error("EXPORT_SIGNING_KEY_UNAVAILABLE");
  await checkCanManageCity(session, cityId);
  const rows = await parseWorkbook(buffer, cityId, signingKey);
  const currentRows = await queryCurrentRows(adminDb(), rows, cityId);
  const currentByVariant = new Map(currentRows.map((row) => [row.variantId, row]));
  for (const row of rows) {
    const current = currentByVariant.get(row.variantId);
    const identityError = compareIdentity(row, current);
    if (identityError) addError(row, identityError);
    if (row.changes.length) {
      const conflict = compareSnapshot(row, current);
      if (conflict) addError(row, conflict);
    }
    row.productName = current?.productName ?? row.productName;
  }
  const changedCount = rows.filter((row) => row.changes.length && !row.errors.length).length;
  const errorCount = rows.filter((row) => row.errors.length).length;
  const token = errorCount === 0 && changedCount > 0
    ? signPreview({ version: 1, userId: session.userId, cityId, exportId: rows[0]?.exportId ?? "", expiresAt: Date.now() + PREVIEW_TTL_MS, rows: rows.filter((row) => row.changes.length) }, signingKey)
    : null;
  return {
    token,
    counts: { total: rows.length, changed: changedCount, unchanged: rows.filter((row) => !row.changes.length && !row.errors.length).length, errors: errorCount },
    rows: rows.map((row) => ({ rowNumber: row.rowNumber, productName: row.productName, sku: row.sku, originalPrice: row.originalPrice, price: row.price, originalAvailability: availabilityLabelFromSnapshot(row.originalAvailability), availability: availabilityLabelFromSnapshot(row.availability), changed: row.changes.length > 0, errors: row.errors, warnings: row.warnings })),
  };
}

function auditRow(row: CurrentRow, cityId: string): InventoryAuditRow {
  return {
    id: row.inventoryId!, variantId: row.variantId, cityId, productId: row.productId,
    price: row.price, oldPrice: row.oldPrice, stock: row.stock, availability: row.availability ?? "UNSPECIFIED",
    allowPreorder: row.allowPreorder ?? false, deliveryTime: row.deliveryTime, isActive: row.inventoryActive ?? false,
  };
}

export async function confirmPriceImport(session: ImportSession, previewToken: string, signingKey: string) {
  if (!signingKey || signingKey.length < 16) throw new Error("EXPORT_SIGNING_KEY_UNAVAILABLE");
  const payload = readPreview(previewToken, signingKey, session.userId);
  verifySnapshotRows(payload, signingKey);
  await checkCanManageCity(session, payload.cityId);

  try {
    return await adminDb().$transaction(async (tx) => {
    const grants = await tx.$queryRaw<Array<{ id: string; isActive: boolean; grantCanManagePrices: boolean | null; grantCanManageStock: boolean | null }>>`
      SELECT c.id,c."isActive",g."canManagePrices" AS "grantCanManagePrices",g."canManageStock" AS "grantCanManageStock"
      FROM cities c LEFT JOIN user_city_access g ON g."cityId"=c.id AND g."userId"=${session.userId}
      WHERE c.id=${payload.cityId} LIMIT 1 FOR UPDATE OF c
    `;
    const grant = grants[0];
    if (!grant || !evaluateCityAccess({
      role: session.role,
      isActive: session.isActive && grant.isActive,
      allCities: session.allCities,
      allCitiesCanManagePrices: session.allCitiesCanManagePrices,
      allCitiesCanManageStock: session.allCitiesCanManageStock,
      hasCityGrant: grant.grantCanManagePrices !== null || grant.grantCanManageStock !== null,
      grantCanManagePrices: grant.grantCanManagePrices ?? false,
      grantCanManageStock: grant.grantCanManageStock ?? false,
    }).canManagePrices) throw new Error("EXPORT_CITY_FORBIDDEN");
    const currentRows = await queryCurrentRows(tx, payload.rows, payload.cityId, true);
    const currentByVariant = new Map(currentRows.map((row) => [row.variantId, row]));
    const conflictRows = payload.rows.filter((row) => compareSnapshot(row, currentByVariant.get(row.variantId)));
    if (conflictRows.length) throw new Error("IMPORT_CONFLICT");

    let updated = 0;
    for (const row of payload.rows) {
      const current = currentByVariant.get(row.variantId)!;
      const nextPrice = row.changes.includes("price") ? row.price : snapshotPrice(current.price);
      const calculatedOldPrice = calculateOldPrice(nextPrice);
      const availabilityChanged = row.changes.includes("availability");
      const nextAvailability = availabilityChanged
        ? inventoryTupleForAvailability(row.availability as ApprovedAvailability)
        : { availability: current.availability ?? "UNSPECIFIED", allowPreorder: current.allowPreorder ?? false, deliveryTime: current.deliveryTime };
      if (row.inventoryId || current.inventoryId) {
        const adoptingEmptyRow = !row.inventoryId && current.inventoryId !== null;
        const result = await tx.$queryRaw<CurrentRow[]>(Prisma.sql`
          UPDATE inventory SET
            price=CASE WHEN ${row.changes.includes("price")} THEN ${row.price}::numeric ELSE price END,
            "oldPrice"=CASE WHEN ${row.changes.includes("price")} THEN ${calculatedOldPrice}::numeric ELSE "oldPrice" END,
            availability=CASE WHEN ${availabilityChanged} THEN ${nextAvailability.availability}::"AvailabilityStatus" ELSE availability END,
            "allowPreorder"=CASE WHEN ${availabilityChanged} THEN ${nextAvailability.allowPreorder} ELSE "allowPreorder" END,
            "deliveryTime"=CASE WHEN ${availabilityChanged} THEN ${nextAvailability.deliveryTime} ELSE "deliveryTime" END,
            "updatedAt"=NOW()
          WHERE id=${row.inventoryId ?? current.inventoryId} AND "cityId"=${payload.cityId} AND "isActive"=TRUE
            AND "updatedAt"=${adoptingEmptyRow ? canonicalDate(current.inventoryUpdatedAt!) : row.snapshotUpdatedAt}::timestamptz
            AND (${!adoptingEmptyRow} OR (price IS NULL AND "oldPrice" IS NULL AND availability='UNSPECIFIED'::"AvailabilityStatus" AND stock IS NULL AND "allowPreorder"=FALSE AND "deliveryTime" IS NULL))
          RETURNING id AS "inventoryId", "variantId", "cityId", price::text AS price, "oldPrice"::text AS "oldPrice", stock,
            availability::text AS availability, "allowPreorder", "deliveryTime", "isActive" AS "inventoryActive"
        `);
        if (!result.length) throw new Error("IMPORT_CONFLICT");
        const after = { ...current, ...result[0], productId: current.productId } as CurrentRow;
        await auditInventoryChanges(tx, session, [auditRow(current, payload.cityId)], [auditRow(after, payload.cityId)]);
      } else {
        const inserted = await tx.$queryRaw<CurrentRow[]>(Prisma.sql`
          INSERT INTO inventory (id,"variantId","cityId",price,"oldPrice",availability,"allowPreorder","deliveryTime","isActive","updatedAt")
          VALUES (${newId()},${row.variantId},${payload.cityId},${row.price},${calculateOldPrice(row.price)},${nextAvailability.availability}::"AvailabilityStatus",${nextAvailability.allowPreorder},${nextAvailability.deliveryTime},TRUE,NOW())
          RETURNING id AS "inventoryId", "variantId", "cityId", price::text AS price, "oldPrice"::text AS "oldPrice", stock,
            availability::text AS availability, "allowPreorder", "deliveryTime", "isActive" AS "inventoryActive"
        `);
        if (!inserted.length) throw new Error("IMPORT_WRITE_FAILED");
        const after = { ...current, ...inserted[0], inventoryId: inserted[0].inventoryId, productId: current.productId } as CurrentRow;
        await auditInventoryChanges(tx, session, [], [auditRow(after, payload.cityId)]);
      }
      updated += 1;
    }
    return { updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002")) {
      throw new Error("IMPORT_CONFLICT");
    }
    throw error;
  }
}
