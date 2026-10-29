import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../lib/admin-product-collection-route.ts", import.meta.url), "utf8");
const bestOffers = readFileSync(new URL("../app/api/admin/best-offers/route.ts", import.meta.url), "utf8");
const popularProducts = readFileSync(new URL("../app/api/admin/popular-products/route.ts", import.meta.url), "utf8");

assert.match(
  route,
  /pg_advisory_xact_lock\(hashtextextended\([\s\S]*?\)\)::text AS locked/,
  "the advisory lock result must be cast from PostgreSQL void before Prisma deserializes it",
);
assert.match(bestOffers, /collectionPost\(request, "best_offers"\)/);
assert.match(popularProducts, /collectionPost\(request, "popular_products"\)/);
assert.match(route, /DUPLICATE_PRODUCT/);
assert.match(route, /DUPLICATE_VARIANT/);
assert.match(route, /MIXED_COLLECTION_SCOPE/);

console.log("Passed product collection route regression checks");
