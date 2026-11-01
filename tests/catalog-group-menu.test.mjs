import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/catalog/products/route.ts", import.meta.url), "utf8");

assert.match(route, /item\?\.action\?\.type === "group"/);
assert.match(route, /if \(!rules && item\?\.action\?\.type !== "group"\) menuCondition = Prisma\.sql`FALSE`/);
assert.match(route, /AND \(\$\{menuCondition\}\)\s+AND \(\$\{groupCondition\}\)/);
assert.match(route, /SELECT id FROM catalog_groups WHERE id=\$\{filters\.groupId\} AND isactive=TRUE/);
assert.match(route, /const item = menu\.items\.find\(\(entry\) => entry\.id === filters\.menuItem && entry\.visible\)/);
assert.match(route, /item\?\.action\?\.type === "filters"/);
assert.match(route, /item\?\.action\?\.type === "category"/);

const base = process.env.ICENTER_GROUPS_BASE_URL;
if (base) {
  const groupId = process.env.ICENTER_GROUP_ID;
  const menuItem = process.env.ICENTER_GROUP_MENU_ITEM;
  const city = process.env.ICENTER_GROUP_CITY ?? "samara";
  assert.ok(groupId && menuItem, "ICENTER_GROUP_ID and ICENTER_GROUP_MENU_ITEM are required for live checks");
  const fetchProducts = async (query) => {
    const response = await fetch(`${base}/api/catalog/products?city=${encodeURIComponent(city)}&limit=100&offset=0&${query}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    return (body.data ?? []).map((item) => item.id).sort();
  };
  const direct = await fetchProducts(`groupId=${encodeURIComponent(groupId)}`);
  const throughMenu = await fetchProducts(`menuItem=${encodeURIComponent(menuItem)}`);
  assert.deepEqual(throughMenu, direct, "groupId and menuItem results must match");
  assert.ok(direct.length > 0, "configured group must return products");
  assert.equal((await fetchProducts("groupId=missing-group-id")).length, 0);
  assert.equal((await fetchProducts("menuItem=missing-menu-item")).length, 0);
  process.stdout.write(`Passed live group/menu comparison (${direct.length} products).\n`);
} else {
  process.stdout.write("Passed group/menu condition regression checks (live checks skipped; set ICENTER_GROUPS_BASE_URL to enable).\n");
}
