import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const state = await readFile("components/StoreState.tsx", "utf8");
const card = await readFile("components/CatalogProductCard.tsx", "utf8");
const product = await readFile("components/ProductView.tsx", "utf8");
const favorites = await readFile("components/FavoritesView.tsx", "utf8");

assert.match(state, /type StoreFavorite = \{ slug: string; variantId: string \| null \}/);
assert.match(state, /item\.variantId === favorite\.variantId/);
assert.match(state, /isFavorite: \(variantId\) => Boolean\(variantId && favorites\.some/);
assert.match(card, /isFavorite\(variant\?\.id\)/);
assert.match(card, /toggleFavorite\(\{ slug: product\.slug, variantId: variant\.id \}\)/);
assert.match(product, /isFavorite\(selectedVariant\?\.id\)/);
assert.match(favorites, /favorite\.variantId/);
assert.doesNotMatch(card, /isFavorite\(product\.slug\)/);
assert.doesNotMatch(product, /isFavorite\(slug\)/);
console.log("Passed variant-aware favorites checks");
