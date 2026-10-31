import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const notice = readFileSync(new URL("../components/ProductPriceNotice.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../components/ProductView.tsx", import.meta.url), "utf8");
const card = readFileSync(new URL("../components/CatalogProductCard.tsx", import.meta.url), "utf8");
const footer = readFileSync(new URL("../components/StoreShell.tsx", import.meta.url), "utf8");

assert.match(notice, /Цена указана за наличный расчёт со скидкой для выбранного города и варианта\./);
assert.match(notice, /Товар имеет недостаток в виде невозможности предустановки RuStore\./);
assert.match(notice, /value === "apple" \|\| value === "iphone" \|\| value === "samsung"/);
assert.match(detail, /<ProductPriceNotice brand=\{product\.brand\}/);
assert.doesNotMatch(card, /ProductPriceNotice/);
assert.doesNotMatch(card, /Цена указана за наличный расчёт/);
assert.doesNotMatch(card, /невозможности предустановки RuStore/);
assert.match(card, /product\.isUsed.*product-used-chip/s);
assert.match(detail, /product-used-badge/);
assert.match(footer, /Информация на сайте не является публичной офертой\./);

console.log("Passed product legal notice regression checks");
