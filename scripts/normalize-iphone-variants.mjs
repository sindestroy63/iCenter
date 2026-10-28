import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import nextEnv from "@next/env";
import { Prisma, PrismaClient } from "@prisma/client";

nextEnv.loadEnvConfig(process.cwd());
const db = new PrismaClient();
const MODE = process.argv.includes("--apply") ? "apply" : process.argv.includes("--verify") ? "verify" : "dry-run";
if (process.argv.slice(2).some((arg) => !["--apply", "--verify"].includes(arg)) || process.argv.includes("--apply") && process.argv.includes("--verify")) {
  console.error("Usage: node scripts/normalize-iphone-variants.mjs [--apply|--verify]"); process.exit(2);
}
const targets = ["iphone-18-pro", "iphone-18-pro-max", "iphone-duo"];
const databaseUrl = process.env.DATABASE_URL ?? "";
const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" || parsed.port !== "5434" || parsed.pathname !== "/icenter_v2") throw new Error("REFUSED_NON_LOCAL_DATABASE");
const backupDir = path.join(process.cwd(), "backups");

function cleanAttributes(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(source).filter(([key]) => !["color", "memory", "sim", "connectivity", "material"].includes(key)));
}
function canonicalKey(row, attributes) {
  return crypto.createHash("sha256").update(JSON.stringify([row.colorId ?? null, row.storage ?? null, row.ram ?? null, row.simType ?? null, null, null, null, Object.fromEntries(Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b)))])).digest("hex");
}
function serializable(value) { return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? Number(item) : item)); }
async function loadSnapshot(client) {
  const products = await client.$queryRaw(Prisma.sql`SELECT * FROM products WHERE slug IN (${Prisma.join(targets)}) ORDER BY slug`);
  const ids = products.map((row) => row.id);
  const variants = ids.length ? await client.$queryRaw(Prisma.sql`SELECT * FROM product_variants WHERE "productId" IN (${Prisma.join(ids)}) ORDER BY "productId",id`) : [];
  const variantIds = variants.map((row) => row.id);
  const inventory = variantIds.length ? await client.$queryRaw(Prisma.sql`SELECT * FROM inventory WHERE "variantId" IN (${Prisma.join(variantIds)}) ORDER BY "variantId","cityId"`) : [];
  const dictionaryLinks = variantIds.length ? await client.$queryRaw(Prisma.sql`SELECT * FROM product_variant_attribute_values WHERE "variantId" IN (${Prisma.join(variantIds)}) ORDER BY "variantId","definitionId"`) : [];
  const orderItems = variantIds.length ? await client.$queryRaw(Prisma.sql`SELECT * FROM order_items WHERE "variantId" IN (${Prisma.join(variantIds)}) ORDER BY id`) : [];
  return { products: serializable(products), variants: serializable(variants), inventory: serializable(inventory), dictionaryLinks: serializable(dictionaryLinks), orderItems: serializable(orderItems) };
}
function plan(snapshot) {
  const products = snapshot.products.map((product) => ({ id: product.id, slug: product.slug, before: product.name, after: product.name.replace(/^Apple\s+/i, "") })).filter((row) => row.before !== row.after);
  const variants = snapshot.variants.filter((row) => String(row.sku ?? "").startsWith("APL-IP")).map((row) => {
    const attributes = cleanAttributes(row.attributes);
    const nextKey = canonicalKey(row, attributes);
    const changed = row.connectivity !== null || row.material !== null || row.size !== null || JSON.stringify(row.attributes ?? {}) !== JSON.stringify(attributes) || row.canonicalKey !== nextKey;
    return { id: row.id, productId: row.productId, sku: row.sku, changed, clearConnectivity: row.connectivity !== null, clearMaterial: row.material !== null, clearSize: row.size !== null, attributes, canonicalKey: nextKey };
  }).filter((row) => row.changed);
  return { products, variants, targetProducts: snapshot.products.length, targetVariants: snapshot.variants.length, officialVariants: variants.length, preservedLegacyVariants: snapshot.variants.filter((row) => !String(row.sku ?? "").startsWith("APL-IP")).map((row) => ({ id: row.id, sku: row.sku })), inventoryRows: snapshot.inventory.length, orderItems: snapshot.orderItems.length };
}
async function writeBackup(snapshot) {
  await fs.mkdir(backupDir, { recursive: true });
  const file = path.join(backupDir, `iphone-normalization-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.writeFile(file, JSON.stringify({ createdAt: new Date().toISOString(), database: { host: parsed.hostname, port: parsed.port, database: parsed.pathname.slice(1) }, ...snapshot }, null, 2));
  return file;
}
async function verify(client) {
  const snapshot = await loadSnapshot(client);
  if (snapshot.products.length !== 3) throw new Error(`VERIFY_TARGET_PRODUCTS_${snapshot.products.length}`);
  if (snapshot.products.some((row) => /^Apple\s+/i.test(row.name))) throw new Error("VERIFY_BRAND_PREFIX_REMAINS");
  const duplicateKeys = await client.$queryRaw(Prisma.sql`SELECT "productId","canonicalKey",count(*)::int AS count FROM product_variants WHERE "productId" IN (SELECT id FROM products WHERE slug IN (${Prisma.join(targets)})) GROUP BY "productId","canonicalKey" HAVING count(*) > 1`);
  if (duplicateKeys.length) throw new Error("VERIFY_DUPLICATE_CANONICAL_KEYS");
  const dirty = snapshot.variants.filter((row) => String(row.sku ?? "").startsWith("APL-IP") && (row.connectivity !== null || row.material !== null || row.size !== null || Object.keys(cleanAttributes(row.attributes)).length !== Object.keys(row.attributes ?? {}).length));
  if (dirty.length) throw new Error(`VERIFY_DUPLICATE_FIELDS_${dirty.length}`);
  const official = snapshot.variants.filter((row) => String(row.sku ?? "").startsWith("APL-IP"));
  if (official.length !== 40) throw new Error(`VERIFY_OFFICIAL_VARIANTS_${official.length}`);
  return { products: snapshot.products.map((row) => ({ id: row.id, slug: row.slug, name: row.name })), variants: snapshot.variants.length, officialVariants: official.length, inventoryRows: snapshot.inventory.length, orderItems: snapshot.orderItems.length, duplicateCanonicalKeys: 0 };
}
async function run() {
  if (MODE === "verify") {
    const result = await db.$transaction(async (tx) => { await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY"); return verify(tx); }, { maxWait: 5000, timeout: 30000 });
    console.log(JSON.stringify({ mode: MODE, result }, null, 2)); return;
  }
  const before = await loadSnapshot(db);
  const currentPlan = plan(before);
  if (MODE === "dry-run") {
    console.log(JSON.stringify({ mode: MODE, database: { host: parsed.hostname, port: parsed.port, name: parsed.pathname.slice(1) }, backupOnApply: "backups/iphone-normalization-<timestamp>.json", ...currentPlan }, null, 2)); return;
  }
  const backup = await writeBackup(before);
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('normalize-iphone-variants'))");
    for (const row of before.products) {
      const next = row.name.replace(/^Apple\s+/i, "");
      if (next !== row.name) await tx.$executeRaw`UPDATE products SET name=${next},"updatedAt"=NOW() WHERE id=${row.id} AND slug=${row.slug}`;
    }
    for (const row of before.variants.filter((item) => String(item.sku ?? "").startsWith("APL-IP"))) {
      const attributes = cleanAttributes(row.attributes);
      const nextKey = canonicalKey(row, attributes);
      if (row.connectivity !== null || row.material !== null || row.size !== null || JSON.stringify(row.attributes ?? {}) !== JSON.stringify(attributes) || row.canonicalKey !== nextKey) {
        await tx.$executeRaw`UPDATE product_variants SET connectivity=NULL,material=NULL,size=NULL,attributes=${JSON.stringify(attributes)}::jsonb,"canonicalKey"=${nextKey},"updatedAt"=NOW() WHERE id=${row.id} AND "productId"=${row.productId}`;
      }
    }
    const after = await loadSnapshot(tx);
    if (JSON.stringify(before.inventory) !== JSON.stringify(after.inventory) || JSON.stringify(before.orderItems) !== JSON.stringify(after.orderItems)) throw new Error("SAFETY_CHECK_REFERENCES_CHANGED");
    return verify(tx);
  }, { maxWait: 10000, timeout: 60000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  console.log(JSON.stringify({ mode: MODE, backup, result }, null, 2));
}
try { await run(); } catch (error) { console.error(`IPHONE_NORMALIZATION_FAILED ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; } finally { await db.$disconnect(); }
