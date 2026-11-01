import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const card = await readFile("components/CatalogProductCard.tsx", "utf8");
assert.match(card, /<h3>\{product\.name\}<\/h3>/);
assert.doesNotMatch(card, /product\.model/);
assert.doesNotMatch(card, /product\.generation/);
assert.match(card, /failedImageSrc !== imageSrc/);
assert.match(card, /alt=""[\s\S]*onError=\{\(\) => setFailedImageSrc\(imageSrc\)\}/);
console.log("Passed product card label checks");
