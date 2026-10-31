import assert from "node:assert/strict";
import { getCatalogCharacteristics } from "../components/catalogClient.ts";

function product(overrides = {}) {
  return { id: "p", slug: "product", name: "Product", description: null, isNew: true, brand: { id: "b", name: "Brand", slug: "brand" }, type: { id: "t", name: "Type", slug: "smartphones" }, category: { id: "c", name: "Category", slug: "smartphones" }, city: { name: "Samara", slug: "samara" }, images: [], variants: [], ...overrides };
}
function variant(attributes) {
  return { id: "v", sku: "SKU", label: "Variant", attributes, color: null, price: "1", oldPrice: null, availability: "IN_STOCK" };
}

const iphone = variant({ storage: "256 GB", ram: "8 GB", simType: "Dual SIM" });
assert.deepEqual(getCatalogCharacteristics(product({ slug: "iphone-15", name: "iPhone 15", brand: { id: "apple", name: "Apple", slug: "apple" }, variants: [iphone] }), iphone), ["256 ГБ", "Dual SIM"]);

const samsung = variant({ storage: "256 GB", ram: "12 GB", simType: "Dual SIM", memory: "256 GB" });
assert.deepEqual(getCatalogCharacteristics(product({ slug: "galaxy-s24", name: "Galaxy S24", brand: { id: "samsung", name: "Samsung", slug: "samsung" }, variants: [samsung] }), samsung), ["12 ГБ ОЗУ", "256 ГБ", "Dual SIM"]);

const ipad = variant({ storage: "256 GB", ram: "8 GB", connectivity: "Wi-Fi" });
assert.deepEqual(getCatalogCharacteristics(product({ slug: "ipad-pro", name: "iPad Pro", brand: { id: "apple", name: "Apple", slug: "apple" }, category: { id: "tablets", name: "Tablets", slug: "tablets" }, variants: [ipad] }), ipad), ["256 ГБ", "Wi-Fi"]);

const macbook = variant({ storage: "512 GB", ram: "16 GB" });
assert.deepEqual(getCatalogCharacteristics(product({ slug: "macbook-air-m3", name: "MacBook Air", brand: { id: "apple", name: "Apple", slug: "apple" }, category: { id: "laptops", name: "Laptops", slug: "laptops" }, variants: [macbook] }), macbook), ["16 ГБ ОЗУ", "512 ГБ"]);

const incompleteSamsung = variant({ storage: "256 GB", ram: "", simType: "unknown" });
assert.deepEqual(getCatalogCharacteristics(product({ slug: "galaxy-a", name: "Galaxy A", brand: { id: "samsung", name: "Samsung", slug: "samsung" }, variants: [incompleteSamsung] }), incompleteSamsung), ["256 ГБ"]);

console.log("Passed catalog characteristic checks.");
