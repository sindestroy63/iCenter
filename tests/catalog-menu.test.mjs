import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDefaultCatalogMenu, catalogMenuTree, filterMenuModels, isSafeInternalPath, menuModelMatchesScope, parseCatalogMenu } from "../lib/catalog-menu.ts";

const taxonomy = {
  brands: [{ id: "brand-apple", slug: "apple", name: "Apple" }, { id: "brand-samsung", slug: "samsung", name: "Samsung" }, { id: "brand-dyson", slug: "dyson", name: "Dyson" }, { id: "brand-playstation", slug: "playstation", name: "PlayStation" }],
  types: [{ id: "type-iphone", slug: "iphone", name: "iPhone", brandId: "brand-apple", brandSlug: "apple", globalProductTypeId: "gpt-phone" }, { id: "type-ipad", slug: "ipad", name: "iPad", brandId: "brand-apple", brandSlug: "apple", globalProductTypeId: "gpt-tablet" }, { id: "type-galaxy", slug: "galaxy", name: "Galaxy", brandId: "brand-samsung", brandSlug: "samsung", globalProductTypeId: "gpt-phone" }],
  models: [{ id: "model-iphone-18", name: "iPhone 18 Pro Max", brandId: "brand-apple", globalProductTypeId: "gpt-phone" }, { id: "model-galaxy-s26", name: "Galaxy S26 Ultra", brandId: "brand-samsung", globalProductTypeId: "gpt-phone" }, { id: "model-dyson-supersonic", name: "Supersonic", brandId: "brand-dyson", globalProductTypeId: "gpt-hair-care" }, { id: "model-ps5", name: "PlayStation 5", brandId: "brand-playstation", globalProductTypeId: "gpt-console" }],
  categories: [{ id: "cat-console", slug: "consoles", name: "Игровые консоли", parentId: null }, { id: "cat-accessories", slug: "accessories", name: "Аксессуары", parentId: null }],
};
const defaults = createDefaultCatalogMenu(taxonomy, { banners: [{ key: "apple", enabled: true, imageMediaId: "media-1", alt: "Apple", description: "Apple devices" }] });
assert.deepEqual(defaults.items.filter((item) => !item.parentId).map((item) => item.id), ["apple", "samsung", "dyson", "consoles", "accessories", "trade-in"]);
assert.equal(defaults.items.find((item) => item.id === "apple").banner.imageMediaId, "media-1");
assert.deepEqual(defaults.items.find((item) => item.id === "apple-iphone").action.rules, [{ field: "brand", value: "brand-apple" }, { field: "type", value: "type-iphone" }]);
assert.equal(defaults.items.find((item) => item.id === "apple-ipad").action.rules[1].value, "type-ipad");
assert.deepEqual(filterMenuModels(taxonomy.models, "brand-apple", "gpt-phone").map((model) => model.id), ["model-iphone-18"]);
assert.deepEqual(filterMenuModels(taxonomy.models, "brand-samsung", "gpt-phone").map((model) => model.id), ["model-galaxy-s26"]);
assert.equal(menuModelMatchesScope(taxonomy.models.find((model) => model.id === "model-dyson-supersonic"), "brand-dyson", "gpt-hair-care"), true);
assert.equal(menuModelMatchesScope(taxonomy.models.find((model) => model.id === "model-ps5"), "brand-playstation", "gpt-console"), true);
assert.equal(menuModelMatchesScope(taxonomy.models.find((model) => model.id === "model-ps5"), "brand-apple", "gpt-phone"), false);

const arbitrary = { version: 1, items: [...defaults.items, { id: "new-brand", parentId: null, title: "New Brand", description: "", visible: true, sortOrder: 6, action: { type: "url", href: "/about" }, banner: { enabled: false, imageMediaId: null, alt: "", description: "" } }, { id: "new-child", parentId: "new-brand", title: "Phones", description: "", visible: true, sortOrder: 0, action: { type: "filters", rules: [{ field: "brand", value: "brand-apple" }] } }] };
assert.equal(parseCatalogMenu(arbitrary).items.at(-1).parentId, "new-brand");
assert.equal(catalogMenuTree(parseCatalogMenu(arbitrary)).at(-1).children[0].id, "new-child");
const threeLevels = { version: 1, items: [...arbitrary.items, { id: "model-node", parentId: "new-child", title: "iPhone 18 Pro Max", description: "", visible: true, sortOrder: 0, action: { type: "filters", rules: [{ field: "model", value: "model-iphone-18" }] } }] };
const parsedThreeLevels = parseCatalogMenu(threeLevels);
assert.equal(catalogMenuTree(parsedThreeLevels).at(-1).children[0].children[0].id, "model-node");
assert.equal(parseCatalogMenu({ ...threeLevels, items: [...threeLevels.items, { ...threeLevels.items.at(-1), id: "too-deep", parentId: "model-node" }] }), null);
assert.equal(parseCatalogMenu({ ...arbitrary, items: [...arbitrary.items, { ...arbitrary.items.at(-1), id: "orphan", parentId: "missing" }] }), null);
assert.equal(parseCatalogMenu({ ...threeLevels, items: threeLevels.items.map((item) => item.id === "new-brand" ? { ...item, parentId: "model-node" } : item) }), null);
assert.equal(parseCatalogMenu({ version: 1, items: [{ id: "legacy-root", parentId: null, title: "Apple", description: "", visible: true, sortOrder: 0, action: { type: "filters", rules: [{ field: "brand", value: "brand-apple" }] }, banner: { enabled: false, imageMediaId: null, alt: "", description: "" }, }, { id: "legacy-child", parentId: "legacy-root", title: "iPhone", description: "", visible: true, sortOrder: 0, action: { type: "filters", rules: [{ field: "type", value: "type-iphone" }] } }] }).items.length, 2);
assert.equal(parseCatalogMenu({ version: 1, items: [{ id: "model-only", parentId: null, title: "Model", description: "", visible: true, sortOrder: 0, action: { type: "filters", rules: [{ field: "model", value: "model-iphone-18" }] }, banner: { enabled: false, imageMediaId: null, alt: "", description: "" } }] }).items[0].action.rules[0].field, "model");
assert.equal(parseCatalogMenu({ version: 1, items: [{ id: "group-node", parentId: null, title: "Group", description: "", visible: true, sortOrder: 0, action: { type: "group", groupId: "group-1" }, banner: { enabled: false, imageMediaId: null, alt: "", description: "" } }] }).items[0].action.type, "group");
assert.equal(parseCatalogMenu({ ...arbitrary, items: arbitrary.items.map((item) => item.id === "new-brand" ? { ...item, parentId: "new-child" } : item) }), null);
assert.equal(isSafeInternalPath("/catalog?x=1"), true);
assert.equal(isSafeInternalPath("//evil.example"), false);
assert.equal(isSafeInternalPath("/\\evil.example"), false);

const menuRoute = readFileSync(new URL("../app/api/catalog/products/route.ts", import.meta.url), "utf8");
assert.match(menuRoute, /menuItem: z\.string\(\)/);
assert.match(menuRoute, /modelId: z\.string\(\)/);
assert.match(menuRoute, /groupId: z\.string\(\)/);
assert.match(menuRoute, /groupRuleWhere/);
assert.match(menuRoute, /p0\."modelId"/);
assert.match(menuRoute, /AND \(\$\{menuCondition\}\)/);
assert.match(menuRoute, /menuCondition = conditions\.length \? Prisma\.join\(conditions, " AND "\)/);
const client = readFileSync(new URL("../components/CatalogView.tsx", import.meta.url), "utf8");
assert.match(client, /params\.set\("menuItem", effectiveMenuItem\)/);
assert.match(client, /params\.set\("modelId", selectedModelId\)/);
assert.match(client, /const reset = \(\)/);
const publicMenu = readFileSync(new URL("../components/CatalogMegaMenu.tsx", import.meta.url), "utf8");
assert.match(publicMenu, /\/api\/catalog\/menu\?city=/);
assert.match(publicMenu, /catalog-mega-card-image/);
assert.match(publicMenu, /mobile-catalog-card-image/);
assert.match(publicMenu, /catalog-mega-card-popover/);
assert.match(publicMenu, /mobile-catalog-card-panel/);
assert.match(publicMenu, /DesktopBranch/);
assert.match(publicMenu, /MobileBranch/);

const adminRoute = readFileSync(new URL("../app/api/admin/catalog-menu/route.ts", import.meta.url), "utf8");
assert.match(adminRoute, /product_models/);
assert.match(adminRoute, /MODEL_BRAND_MISMATCH/);
assert.match(adminRoute, /MODEL_TYPE_MISMATCH/);
assert.match(adminRoute, /INVALID_GROUP/);
const adminEditor = readFileSync(new URL("../components/AdminCatalogMenu.tsx", import.meta.url), "utf8");
assert.match(adminEditor, /option value="model"/);
assert.match(adminEditor, /function descendantsOf/);

console.log("Passed mega-menu structure, migration defaults, URL and server-scope checks");
