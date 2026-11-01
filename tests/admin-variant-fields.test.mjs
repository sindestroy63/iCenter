import assert from "node:assert/strict";
import {
  adminVariantFieldCodes,
  adminVariantFieldValue,
  adminVariantType,
  getAdditionalVariantAvailability,
} from "../lib/admin-variant-fields.ts";

const options = [
  { dictionary: "region", isActive: true },
  { dictionary: "bundle", isActive: false },
  { dictionary: "memory", isActive: true },
];
const additionalDefinitions = [
  { code: "region", scope: "VARIANT", source: "attribute_options" },
  { code: "bundle", scope: "VARIANT", source: "attribute_options" },
  { code: "memory", scope: "VARIANT", source: "attribute_options" },
  { code: "ram", scope: "VARIANT", source: "attribute_options" },
  { code: "sim", scope: "VARIANT", source: "attribute_options" },
  { code: "connectivity", scope: "VARIANT", source: "attribute_options" },
  { code: "size", scope: "VARIANT", source: "attribute_options" },
  { code: "material", scope: "VARIANT", source: "attribute_options" },
];
assert.deepEqual(
  getAdditionalVariantAvailability(additionalDefinitions, options, []).availableDefinitions.map((item) => item.code),
  ["region"],
);
assert.deepEqual(
  getAdditionalVariantAvailability(additionalDefinitions, options, ["region"]).availableDefinitions,
  [],
);
assert.equal(getAdditionalVariantAvailability(additionalDefinitions, options, ["region"]).allAvailableUsed, true);
assert.equal(getAdditionalVariantAvailability(additionalDefinitions, [{ dictionary: "bundle", isActive: false }], []).hasActiveValues, false);
const dynamicDefinitions = [
  { code: "warranty", label: "Гарантия", scope: "VARIANT", source: "attribute_options", isActive: true, productTypeIds: ["phone"] },
  { code: "bundle", label: "Комплектация", scope: "VARIANT", source: "attribute_options", isActive: true, productTypeIds: ["console"] },
  { code: "ram", label: "RAM", scope: "VARIANT", source: "attribute_options", isActive: true, productTypeIds: ["phone"] },
];
assert.deepEqual(
  getAdditionalVariantAvailability(dynamicDefinitions, [{ dictionary: "warranty", isActive: true }, { dictionary: "ram", isActive: true }], [], "phone").availableDefinitions.map((item) => item.code),
  ["warranty"],
);
assert.deepEqual(
  getAdditionalVariantAvailability(dynamicDefinitions, [{ dictionary: "bundle", isActive: true }], [], "phone").availableDefinitions,
  [],
);

assert.deepEqual(
  adminVariantFieldCodes({ brandName: "Apple", productName: "iPhone 18 Pro Max", typeKey: "smartphone" }),
  ["storage", "simType"],
);
assert.deepEqual(
  adminVariantFieldCodes({ brandName: "Samsung", productName: "Galaxy S25", typeKey: "smartphone" }),
  ["storage", "ram", "simType"],
);
assert.deepEqual(
  adminVariantFieldCodes({ brandName: "Apple", productName: "iPad Pro", typeKey: "tablet" }),
  ["storage", "connectivity"],
);
assert.deepEqual(
  adminVariantFieldCodes({ brandName: "Apple", productName: "MacBook Pro", typeKey: "laptop" }),
  ["storage", "ram"],
);

const legacyVariant = {
  storage: "",
  ram: "12 ГБ",
  simType: "",
  attributes: { memory: "1 ТБ", sim: "eSIM" },
};
assert.equal(adminVariantFieldValue(legacyVariant, "storage"), "1 ТБ");
assert.equal(adminVariantFieldValue(legacyVariant, "simType"), "eSIM");
assert.equal(adminVariantFieldValue(legacyVariant, "ram"), "12 ГБ");
assert.equal(adminVariantFieldValue({ dictionaryOptionLabels: { memory: "512 ГБ" } }, "storage"), "512 ГБ");
assert.equal(adminVariantType({ typeKey: "catalog:smartphone", productName: "iPhone" }), "smartphone");

console.log("Passed admin variant field checks.");
