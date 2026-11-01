import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const view = await readFile("components/ProductView.tsx", "utf8");
const styles = await readFile("app/storefront.css", "utf8");
const tradeInRoute = await readFile("app/(storefront)/trade-in/page.tsx", "utf8");
const installmentRoute = await readFile("app/(storefront)/installment/page.tsx", "utf8");
const warrantyRoute = await readFile("app/(storefront)/warranty/page.tsx", "utf8");

for (const [href, title, icon] of [
  ["/trade-in", "Trade-in", "Repeat2"],
  ["/installment", "Рассрочка", "BadgeRussianRuble"],
  ["/warranty", "Гарантия", "ShieldCheck"],
]) {
  assert.match(view, new RegExp(`href=\\"${href.replace("/", "\\/")}\\"`));
  assert.match(view, new RegExp(`aria-label=\\"${title}\\"`));
  assert.match(view, new RegExp(`<span>${title}<\\/span>`));
  assert.match(view, new RegExp(`<${icon}\\b`));
}

assert.match(view, /className="product-gallery-promos"/);
assert.match(view, /className="product-gallery-promo"/);
assert.equal((view.match(/className="product-gallery-promo"/g) ?? []).length, 3);
assert.match(view, /<div className="product-main-image">[\s\S]*?<nav className="product-gallery-promos"/);
assert.match(styles, /\.product-page \.product-gallery\{[^}]*grid-template-columns:88px minmax\(0,1fr\);/);
assert.match(styles, /\.product-page \.product-gallery-promos\{position:absolute;top:14px;right:14px;z-index:3/);
assert.doesNotMatch(view, /<small>/);
assert.doesNotMatch(view, /<ArrowRight aria-hidden="true" \/>/);
assert.match(tradeInRoute, /TradeInPage/);
assert.match(installmentRoute, /InstallmentPage/);
assert.match(warrantyRoute, /StoreInfoPage/);

console.log("Passed product gallery promo checks");
