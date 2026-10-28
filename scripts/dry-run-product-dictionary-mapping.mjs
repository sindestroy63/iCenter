import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  normalizeMemory,
  normalizeRam,
  normalizeSim,
  classifyProductType,
  validateCanonicalKey,
} from "../lib/product-dictionaries.ts";

nextEnv.loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  process.stderr.write("DRY_RUN_BLOCKED database_configuration_missing\n");
  process.exit(2);
}
const databaseName = decodeURIComponent(new URL(connectionString).pathname.slice(1));
if (databaseName !== "icenter_v2") {
  process.stderr.write("DRY_RUN_BLOCKED unexpected_database\n");
  process.exit(2);
}

const prisma = new PrismaClient({ log: [] });
const usage = new Map();
let currentRow = null;
const valueString = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value.trim() || null;
  if (["number", "boolean"].includes(typeof value)) return String(value);
  return JSON.stringify(value);
};

function slug(value) {
  const transliteration = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
  return value.toLocaleLowerCase("ru-RU").replace(/[а-яё]/g, (char) => transliteration[char] ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function matchRaw(dictionary, raw, entity = null) {
  if (dictionary === "productType" && entity) {
    return { key: entity.canonicalKey ?? null, status: entity.status ?? "AMBIGUOUS" };
  }
  if (dictionary === "memory") {
    const result = normalizeMemory(raw);
    return result ? { key: result.canonicalKey, status: "MATCHED" } : { key: null, status: "UNKNOWN" };
  }
  if (dictionary === "ram") {
    const result = normalizeRam(raw);
    return result ? { key: result.canonicalKey, status: "MATCHED" } : { key: null, status: "UNKNOWN" };
  }
  if (dictionary === "sim") {
    const result = normalizeSim(raw);
    return result ? { key: result.canonicalKey, status: "MATCHED" } : { key: slug(raw) ? `sim:${slug(raw)}` : null, status: slug(raw) ? "AMBIGUOUS" : "UNKNOWN" };
  }
  if (["brand", "productModel", "color"].includes(dictionary) && entity?.canonicalKey) {
    return { key: entity.canonicalKey, status: "MATCHED" };
  }
  if (dictionary === "connectivity") {
    const normalized = raw.toLocaleLowerCase("ru-RU").replace(/[\s_-]+/g, "");
    const known = new Map([
      ["wifi", "connectivity:wifi"], ["wi-fi", "connectivity:wifi"], ["bluetooth", "connectivity:bluetooth"],
      ["usb-c", "connectivity:usb-c"], ["usbc", "connectivity:usb-c"], ["lightning", "connectivity:lightning"],
      ["wificellular", "connectivity:wifi-cellular"],
    ]).get(normalized);
    if (known) return { key: known, status: "MATCHED" };
  }
  const candidate = slug(raw);
  return candidate && validateCanonicalKey(`${dictionary}:${candidate}`)
    ? { key: `${dictionary}:${candidate}`, status: "AMBIGUOUS" }
    : { key: null, status: "UNKNOWN" };
}

function add(dictionary, field, value, entityId, entity = null) {
  const raw = valueString(value);
  if (!raw) return;
  const matched = matchRaw(dictionary, raw, entity);
  const idKey = `${field}\u0000${raw}`;
  let item = usage.get(idKey);
  if (!item) {
    item = { field, raw, canonicalKey: matched.key, status: matched.status, usedBy: new Set(), examples: new Set() };
    usage.set(idKey, item);
  } else if (item.canonicalKey !== matched.key) {
    item.canonicalKey = null;
    item.status = "AMBIGUOUS";
  } else if (item.status !== matched.status) {
    item.status = item.status === "UNKNOWN" || matched.status === "UNKNOWN" ? "UNKNOWN" : "AMBIGUOUS";
  }
  item.usedBy.add(entityId);
  if (currentRow) item.examples.add(`${currentRow.productName} [${currentRow.productSlug}] / SKU ${currentRow.sku}`);
}

try {
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return tx.$queryRaw`
      SELECT p.id AS "productId", p.name AS "productName", p.slug AS "productSlug", p.model, p.generation, p.chip, p."displaySize", p."releaseYear", p.specifications,
             b.slug AS "brandSlug", b.name AS "brandName", pt.slug AS "typeSlug", pt.name AS "typeName", ccat.name AS "categoryName",
             v.id AS "variantId", v.sku, v.storage, v.ram, v."simType", v.connectivity, v.size, v.material, v.attributes,
             c.id AS "colorId", c.slug AS "colorSlug", c.name AS "colorName"
      FROM product_variants v
      JOIN products p ON p.id = v."productId"
      JOIN brands b ON b.id = p."brandId"
      JOIN product_types pt ON pt.id = p."productTypeId"
      LEFT JOIN colors c ON c.id = v."colorId"
      JOIN categories ccat ON ccat.id = p."categoryId"
      ORDER BY p.slug, v.sku
    `;
  }, { maxWait: 5000, timeout: 20000 });

  for (const row of rows) {
    currentRow = row;
    const productRef = `product:${row.productId}`;
    const variantRef = `variant:${row.variantId}`;
    add("brand", "brand", row.brandName, productRef, { canonicalKey: `brand:${row.brandSlug}` });
    const globalType = classifyProductType(row.categoryName);
    add("productType", "productType", row.typeName, productRef, {
      canonicalKey: globalType === "other" ? null : `product_type:${globalType}`,
      status: "AMBIGUOUS",
    });
    add("productModel", "productModel", row.model || row.productName, productRef, { canonicalKey: `product_model:${row.productSlug}` });
    add("memory", "variant.storage", row.storage, variantRef);
    add("ram", "variant.ram", row.ram, variantRef);
    add("sim", "variant.simType", row.simType, variantRef);
    add("connectivity", "variant.connectivity", row.connectivity, variantRef);
    if (row.colorId) add("color", "variant.color", row.colorName, variantRef, { canonicalKey: `color:${row.colorSlug}` });
    add("size", "variant.size", row.size, variantRef);
    add("material", "variant.material", row.material, variantRef);
    if (row.attributes && typeof row.attributes === "object") {
      for (const [key, value] of Object.entries(row.attributes)) {
        const dictionary = ({ storage: "memory", ram: "ram", simType: "sim", connectivity: "connectivity", size: "size", material: "material", chip: "chip" })[key] ?? slug(key).replace(/-/g, "_");
        add(dictionary, `variant.attributes.${key}`, value, variantRef);
      }
    }
    add("chip", "product.chip", row.chip, productRef);
    add("generation", "product.generation", row.generation, productRef);
    add("display_size", "product.displaySize", row.displaySize, productRef);
    add("release_year", "product.releaseYear", row.releaseYear, productRef);
    if (row.specifications && typeof row.specifications === "object") {
      for (const [key, value] of Object.entries(row.specifications)) {
        if (key === "text") continue;
        const dictionary = ({ chip: "chip", processor: "chip", condition: "condition", region: "region", bundle: "bundle", size: "size", material: "material" })[key.toLocaleLowerCase("ru-RU")] ?? `spec_${slug(key).replace(/-/g, "_")}`;
        add(dictionary, `product.specifications.${key}`, value, productRef);
      }
    }
  }

  const output = Array.from(usage.values()).sort((a, b) => a.field.localeCompare(b.field) || a.raw.localeCompare(b.raw, "ru"));
  const unresolved = output.filter((item) => item.status === "AMBIGUOUS" || item.status === "UNKNOWN");
  const cell = (value) => String(value ?? "—").replace(/[|\r\n]+/g, " ");
  process.stdout.write(`variant_rows=${rows.length} unique_field_values=${output.length} unresolved_values=${unresolved.length}\n`);
  if (process.argv.includes("--unresolved-only")) {
    process.stdout.write("| Поле | Исходное значение | canonicalKey (предложение) | Использований | Статус | Товар / SKU |\n|---|---|---|---:|---|---|\n");
    for (const item of unresolved) process.stdout.write(`| ${cell(item.field)} | ${cell(item.raw)} | ${cell(item.canonicalKey)} | ${item.usedBy.size} | ${item.status} | ${cell(Array.from(item.examples).join("; "))} |\n`);
  } else {
    process.stdout.write("| Поле | Исходное значение | canonicalKey (предложение) | Использований | Статус |\n|---|---|---|---:|---|\n");
    for (const item of output) process.stdout.write(`| ${cell(item.field)} | ${cell(item.raw)} | ${cell(item.canonicalKey)} | ${item.usedBy.size} | ${item.status} |\n`);
    process.stdout.write("\nUNRESOLVED\n| Поле | Исходное значение | canonicalKey (предложение) | Использований | Статус | Товар / SKU |\n|---|---|---|---:|---|---|\n");
    for (const item of unresolved) process.stdout.write(`| ${cell(item.field)} | ${cell(item.raw)} | ${cell(item.canonicalKey)} | ${item.usedBy.size} | ${item.status} | ${cell(Array.from(item.examples).join("; "))} |\n`);
  }
} catch (error) {
  const value = error && typeof error === "object" ? error : {};
  const code = typeof value.code === "string" && /^[A-Z0-9_]+$/.test(value.code) ? ` code=${value.code}` : "";
  const name = typeof value.name === "string" && /^[A-Za-z0-9_]+$/.test(value.name) ? value.name : "Error";
  process.stderr.write(`DRY_RUN_FAILED ${name}${code}; no database changes were attempted\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
