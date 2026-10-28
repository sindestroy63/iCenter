import assert from "node:assert/strict";
import { getCatalogCharacteristics } from "../components/catalogClient.ts";

function product(overrides = {}) {
  return {
    id: "product",
    slug: "iphone-15-pro",
    name: "iPhone 15 Pro",
    chip: "A17 Pro",
    description: null,
    isNew: false,
    brand: { id: "apple", name: "Apple", slug: "apple" },
    type: { id: "phone", name: "Смартфон", slug: "iphone" },
    category: { id: "smartphones", name: "Смартфоны", slug: "smartphones" },
    city: { name: "Самара", slug: "samara" },
    images: [],
    variants: [],
    ...overrides,
  };
}

function variant(attributes, label = "Вариант") {
  return {
    id: "variant",
    sku: "SKU",
    label,
    attributes,
    color: { id: "black", name: "Black", nameRu: "Чёрный", slug: "black", hex: "#000000" },
    price: "100000",
    oldPrice: null,
    availability: "IN_STOCK",
  };
}

const iphoneVariant = variant({ storage: "256 ГБ", simType: "eSIM + физическая SIM" });
assert.deepEqual(getCatalogCharacteristics(product({ variants: [iphoneVariant] }), iphoneVariant), ["256 ГБ", "eSIM + физическая SIM"]);

const iphoneWithoutSim = variant({ storage: "128 ГБ" }, "Blue 128GB");
assert.deepEqual(getCatalogCharacteristics(product({ variants: [iphoneWithoutSim] }), iphoneWithoutSim), ["128 ГБ"]);

const samsungVariant = variant({ storage: "256 ГБ" });
assert.deepEqual(getCatalogCharacteristics(product({ slug: "galaxy-s24", name: "Samsung Galaxy S24", chip: "Snapdragon 8 Gen 3", brand: { id: "samsung", name: "Samsung", slug: "samsung" }, variants: [samsungVariant] }), samsungVariant), ["256 ГБ", "Snapdragon 8 Gen 3"]);

const ipadVariant = variant({ storage: "256 ГБ" });
assert.deepEqual(getCatalogCharacteristics(product({ slug: "ipad-pro", name: "iPad Pro", chip: "M4", category: { id: "tablets", name: "Планшеты", slug: "tablets" }, variants: [ipadVariant] }), ipadVariant), ["256 ГБ", "M4"]);

console.log("Passed catalog characteristic checks.");
