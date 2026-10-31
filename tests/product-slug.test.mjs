import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allocateProductSlug, parseSlugAliases, productSlugBase } from "../lib/product-slug.ts";

assert.equal(productSlugBase("iPhone 17 Pro Max"), "iphone-17-pro-max");
assert.equal(productSlugBase("Чехол для iPhone 17+"), "chehol-dlya-iphone-17");
assert.equal(productSlugBase("***"), "product");

const reserved = new Set();
const reserve = async (candidate) => { if (reserved.has(candidate)) return false; reserved.add(candidate); return true; };
const sameName = await Promise.all([allocateProductSlug("iPhone 17", reserve), allocateProductSlug("iPhone 17", reserve), allocateProductSlug("iPhone 17", reserve)]);
assert.deepEqual(new Set(sameName), new Set(["iphone-17", "iphone-17-2", "iphone-17-3"]));

const aliases = parseSlugAliases({ aliases: [{ slug: "old-iphone-name", productId: "product-1" }, { slug: "unsafe/slug", productId: "product-1" }] });
assert.deepEqual(aliases, [{ slug: "old-iphone-name", productId: "product-1" }]);

const route = readFileSync(new URL("../app/api/admin/products/route.ts", import.meta.url), "utf8");
assert.match(route, /pg_advisory_xact_lock\(hashtextextended\('icenter-product-slugs'/);
assert.match(route, /SELECT name,slug FROM products WHERE id=/);
assert.match(route, /const nameChanged = String\(current\[0\]\.name\) !== product\.name/);
assert.match(route, /nameChanged \? await uniqueSlug\(tx, product\.name, productId\) : current\[0\]\.slug/);
assert.match(route, /preserveSlugAlias\(tx, String\(current\[0\]\.slug\), productId\)/);
assert.match(route, /await uniqueSlug\(tx, product\.name\)/);

const productRoute = readFileSync(new URL("../app/api/catalog/products/[slug]/route.ts", import.meta.url), "utf8");
assert.match(productRoute, /parseSlugAliases/);
assert.match(productRoute, /WHERE p\.id = \$\{resolvedProductId\}/);
const productView = readFileSync(new URL("../components/ProductView.tsx", import.meta.url), "utf8");
assert.match(productView, /router\.replace\(`\/product\/\$\{encodeURIComponent\(body\.canonicalSlug\)\}/);

const importer = readFileSync(new URL("../scripts/import-apple-2026-models.mjs", import.meta.url), "utf8");
assert.match(importer, /\$\{product\.id\}, \$\{product\.name\}, \$\{product\.slug\}/);
assert.match(importer, /UPDATE products\s+SET name = \$\{product\.name\}/);
assert.doesNotMatch(importer, /SET name = \$\{product\.name\},\s+slug\s*=/);

console.log("Passed product slug generation, concurrency, rename and legacy URL checks");
