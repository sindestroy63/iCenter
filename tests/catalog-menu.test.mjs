import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDefaultCatalogMenu, catalogMenuTree, isSafeInternalPath, parseCatalogMenu } from "../lib/catalog-menu.ts";

const taxonomy = {
  brands: [{ id: "brand-apple", slug: "apple", name: "Apple" }, { id: "brand-samsung", slug: "samsung", name: "Samsung" }],
  types: [{ id: "type-iphone", slug: "iphone", name: "iPhone", brandId: "brand-apple", brandSlug: "apple" }, { id: "type-ipad", slug: "ipad", name: "iPad", brandId: "brand-apple", brandSlug: "apple" }, { id: "type-galaxy", slug: "galaxy", name: "Galaxy", brandId: "brand-samsung", brandSlug: "samsung" }],
  categories: [{ id: "cat-console", slug: "consoles", name: "Игровые консоли", parentId: null }, { id: "cat-accessories", slug: "accessories", name: "Аксессуары", parentId: null }],
};
const defaults = createDefaultCatalogMenu(taxonomy, { banners: [{ key: "apple", enabled: true, imageMediaId: "media-1", alt: "Apple", description: "Apple devices" }] });
assert.deepEqual(defaults.items.filter((item) => !item.parentId).map((item) => item.id), ["apple", "samsung", "dyson", "consoles", "accessories", "trade-in"]);
assert.equal(defaults.items.find((item) => item.id === "apple").banner.imageMediaId, "media-1");
assert.deepEqual(defaults.items.find((item) => item.id === "apple-iphone").action.rules, [{ field: "brand", value: "brand-apple" }, { field: "type", value: "type-iphone" }]);
assert.equal(defaults.items.find((item) => item.id === "apple-ipad").action.rules[1].value, "type-ipad");

const arbitrary = { version: 1, items: [...defaults.items, { id: "new-brand", parentId: null, title: "New Brand", description: "", visible: true, sortOrder: 6, action: { type: "url", href: "/about" }, banner: { enabled: false, imageMediaId: null, alt: "", description: "" } }, { id: "new-child", parentId: "new-brand", title: "Phones", description: "", visible: true, sortOrder: 0, action: { type: "filters", rules: [{ field: "brand", value: "brand-apple" }] } }] };
assert.equal(parseCatalogMenu(arbitrary).items.at(-1).parentId, "new-brand");
assert.equal(catalogMenuTree(parseCatalogMenu(arbitrary)).at(-1).children[0].id, "new-child");
assert.equal(parseCatalogMenu({ ...arbitrary, items: [...arbitrary.items, { ...arbitrary.items.at(-1), id: "cycle", parentId: "new-child" }] }), null);
assert.equal(isSafeInternalPath("/catalog?x=1"), true);
assert.equal(isSafeInternalPath("//evil.example"), false);
assert.equal(isSafeInternalPath("/\\evil.example"), false);

const menuRoute = readFileSync(new URL("../app/api/catalog/products/route.ts", import.meta.url), "utf8");
assert.match(menuRoute, /menuItem: z\.string\(\)/);
assert.match(menuRoute, /AND \(\$\{menuCondition\}\)/);
assert.match(menuRoute, /menuCondition = conditions\.length \? Prisma\.join\(conditions, " AND "\)/);
const client = readFileSync(new URL("../components/CatalogView.tsx", import.meta.url), "utf8");
assert.match(client, /params\.set\("menuItem", effectiveMenuItem\)/);
assert.match(client, /const reset = \(\)/);
const publicMenu = readFileSync(new URL("../components/CatalogMegaMenu.tsx", import.meta.url), "utf8");
assert.match(publicMenu, /\/api\/catalog\/menu\?city=/);
assert.match(publicMenu, /catalog-mega-card-image/);
assert.match(publicMenu, /mobile-catalog-card-image/);
assert.match(publicMenu, /catalog-mega-card-popover/);
assert.match(publicMenu, /mobile-catalog-card-panel/);

console.log("Passed mega-menu structure, migration defaults, URL and server-scope checks");
