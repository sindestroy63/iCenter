import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { cartPriceSummary, serverPriceForCity } from "../lib/cart-pricing.ts";

const checks = [];
function test(name, fn) { fn(); checks.push(name); }

test("stale demo price is discarded when cart is restored", async () => {
  const state = await readFile(new URL("../components/StoreState.tsx", import.meta.url), "utf8");
  assert.match(state, /price: null, priceCity: undefined/);
  assert.match(state, /variantId, slug, quantity/);
});
test("unknown price has no fabricated total", () => {
  assert.deepEqual(cartPriceSummary([{ price: null, quantity: 2 }]), { knownCount: 0, subtotal: 0, totalLabel: "unknown" });
});
test("known price computes quantity total", () => {
  assert.equal(cartPriceSummary([{ price: 180000, quantity: 2 }]).subtotal, 360000);
});
test("mixed cart exposes only known subtotal", () => {
  assert.deepEqual(cartPriceSummary([{ price: 100, quantity: 2 }, { price: null, quantity: 1 }]), { knownCount: 1, subtotal: 200, totalLabel: "partial" });
});
test("city switch invalidates price until new catalog price arrives", () => {
  const line = { city: "samara", priceCity: "samara", price: 100 };
  assert.equal(serverPriceForCity(line, "moscow", true), null);
  assert.equal(serverPriceForCity({ ...line, city: "moscow", priceCity: "moscow", price: 250 }, "moscow", true), 250);
  assert.equal(serverPriceForCity(line, "samara", false), null);
});
test("checkout requests the selected city catalog again", () => {
  const source = readFileSync(new URL("../components/StoreState.tsx", import.meta.url), "utf8");
  assert.match(source, /fetch\(`\/api\/catalog\/products\/\$\{encodeURIComponent\(item\.slug\)\}\?city=/);
  const checkout = readFileSync(new URL("../components/CheckoutFlow.tsx", import.meta.url), "utf8");
  assert.match(checkout, /item\.availability === "IN_STOCK" \|\| item\.availability === "PREORDER"/);
});
test("server rejects unavailable inventory before creating an order", () => {
  const source = readFileSync(new URL("../lib/request-service.ts", import.meta.url), "utf8");
  assert.match(source, /row\.availability !== "IN_STOCK" && row\.availability !== "PREORDER"/);
  assert.match(source, /new RequestError\("STOCK_UNAVAILABLE", 409\)/);
});
test("footer renders configured contacts and never timezone", async () => {
  const footer = await readFile(new URL("../components/StoreShell.tsx", import.meta.url), "utf8");
  assert.match(footer, /selectedCityInfo\?\.address/);
  assert.match(footer, /selectedCityInfo\?\.phone/);
  assert.doesNotMatch(footer, /selectedCityInfo\?\.timezone/);
});

console.log(`Passed ${checks.length} cart/contact regression checks`);
