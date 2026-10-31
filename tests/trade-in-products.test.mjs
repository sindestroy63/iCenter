import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tradeInProductDetails } from "../lib/trade-in-product.ts";

assert.deepEqual(tradeInProductDetails({ tradeIn: true, tradeInCondition: "Хорошее", tradeInBatteryHealth: 87, tradeInDefects: "Царапина", tradeInEquipment: "Коробка" }), { isUsed: true, condition: "Хорошее", batteryHealth: 87, defects: "Царапина", equipment: "Коробка" });
assert.equal(tradeInProductDetails({ tradeIn: false }).isUsed, false);
assert.equal(tradeInProductDetails({ tradeIn: true, tradeInBatteryHealth: 101 }).batteryHealth, null);
assert.equal(tradeInProductDetails({ tradeIn: true, tradeInBatteryHealth: "" }).batteryHealth, null);

const catalogRoute = readFileSync(new URL("../app/api/catalog/products/route.ts", import.meta.url), "utf8");
const adminProducts = readFileSync(new URL("../components/AdminProductsBackend.tsx", import.meta.url), "utf8");
assert.match(catalogRoute, /specifications @> '\{"tradeIn":true\}'::jsonb/);
assert.match(catalogRoute, /used_inventory\.availability::text='IN_STOCK'/);
assert.match(adminProducts, /Б\/у товар Trade-in/);
assert.match(adminProducts, /tradeInBatteryHealth/);
assert.match(adminProducts, /tradeInDefects/);

console.log("Passed Trade-in product catalog regression checks");
