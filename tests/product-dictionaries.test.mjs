import assert from "node:assert/strict";
import {
  DICTIONARY_REGISTRY,
  PUBLIC_FILTER_ORDER,
  classifyProductType,
  getPublicFilterDefinitions,
  isAttributeApplicable,
  compareMemoryValues,
  dictionaryValuesMatch,
  memoryCapacityGb,
  normalizeMemory,
  normalizeRam,
  normalizeSim,
  prepareExistingValueAlias,
  sortDictionaryOptions,
  validateCanonicalKey,
  validateOptionInput,
} from "../lib/product-dictionaries.ts";

const checks = [];
function test(name, fn) {
  fn();
  checks.push(name);
}

test("the registry describes all 15 dictionaries without seeding options", () => {
  assert.equal(DICTIONARY_REGISTRY.length, 15);
  assert.ok(DICTIONARY_REGISTRY.every((entry) => !("options" in entry)));
});

test("public filters stay fixed in the approved order", () => {
  assert.deepEqual(PUBLIC_FILTER_ORDER, ["brand", "productType", "color", "memory", "ram", "sim", "connectivity"]);
  assert.deepEqual(getPublicFilterDefinitions().map(({ code }) => code), [...PUBLIC_FILTER_ORDER]);
  assert.ok(getPublicFilterDefinitions().every((entry) => entry.filterOrder !== null));
});

test("memory normalizes unit variants to one stable key", () => {
  for (const value of ["256", "256GB", "256 GB", "256 ГБ"]) {
    assert.equal(normalizeMemory(value)?.canonicalKey, "memory:256gb");
  }
  assert.equal(normalizeMemory("1TB")?.canonicalKey, "memory:1024gb");
  assert.equal(normalizeMemory("1024 ГБ")?.label, "1 ТБ");
  assert.equal(normalizeMemory("0 GB"), null);
  assert.equal(normalizeMemory("not storage"), null);
  assert.equal(dictionaryValuesMatch("memory", "256GB", "256 ГБ"), true);
  assert.equal(dictionaryValuesMatch("memory", "1TB", "1 ТБ"), true);
  assert.equal(dictionaryValuesMatch("sim", "eSIM + физическая SIM", "SIM + eSIM"), true);
});

test("RAM normalizes unit variants and rejects TB", () => {
  for (const value of ["8", "8GB", "8 GB", "8 ГБ"]) {
    assert.equal(normalizeRam(value)?.canonicalKey, "ram:8gb");
  }
  assert.equal(normalizeRam("1TB"), null);
});

test("SIM spelling aliases resolve to a canonical value", () => {
  assert.equal(normalizeSim("SIM")?.canonicalKey, "sim:sim");
  assert.equal(normalizeSim("eSIM")?.canonicalKey, "sim:esim");
  assert.equal(normalizeSim("eSIM + физическая SIM")?.canonicalKey, "sim:esim-physical-sim");
  assert.equal(normalizeSim("SIM + eSIM")?.canonicalKey, "sim:esim-physical-sim");
  assert.equal(normalizeSim("Physical SIM")?.canonicalKey, "sim:physical-sim");
  assert.equal(normalizeSim("Dual Physical SIM")?.canonicalKey, "sim:dual-physical-sim");
  assert.equal(normalizeSim("Dual eSIM")?.canonicalKey, "sim:dual-esim");
  assert.notEqual(normalizeSim("Dual Physical SIM")?.canonicalKey, normalizeSim("Dual eSIM")?.canonicalKey);
  assert.equal(prepareExistingValueAlias("sim", "eSIM + физическая SIM")?.canonicalKey, "sim:esim-physical-sim");
});

test("numeric memory and RAM sort by quantity, not label text", () => {
  const options = [512, 64, 1024, 128].map((size) => ({
    id: String(size), dictionary: "memory", canonicalKey: `memory:${size}gb`, label: `${size} ГБ`, aliases: [], sortOrder: 0, isActive: true,
  }));
  assert.deepEqual(sortDictionaryOptions("memory", options).map((option) => option.id), ["64", "128", "512", "1024"]);
});

test("memory comparator converts TB to GB in every interface", () => {
  const values = ["2 ТБ", "512 ГБ", "1 ТБ", "256 ГБ"];
  assert.deepEqual(values.sort(compareMemoryValues), ["256 ГБ", "512 ГБ", "1 ТБ", "2 ТБ"]);
  assert.equal(memoryCapacityGb("1 TB"), 1024);
  assert.equal(memoryCapacityGb("2 ТБ"), 2048);
});

test("prepared aliases map existing text and do not create records", () => {
  assert.deepEqual(prepareExistingValueAlias("memory", "256"), { canonicalKey: "memory:256gb", alias: "256" });
  assert.deepEqual(prepareExistingValueAlias("ram", "8GB"), { canonicalKey: "ram:8gb", alias: "8GB" });
  assert.equal(prepareExistingValueAlias("memory", "unknown"), null);
});

test("canonical keys are constrained and duplicate aliases are rejected", () => {
  assert.equal(validateCanonicalKey("memory:256gb"), true);
  assert.equal(validateCanonicalKey("memory:256 GB"), false);
  const issues = validateOptionInput({ dictionary: "memory", canonicalKey: "memory:256gb", label: "256 ГБ", aliases: ["256"] }, [
    { dictionary: "memory", key: "memory:256gb", optionId: "existing-option" },
    { dictionary: "memory", key: "memory:256", optionId: "existing-alias" },
  ]);
  assert.ok(issues.some((issue) => issue.code === "DUPLICATE_KEY"));
  assert.ok(issues.some((issue) => issue.code === "DUPLICATE_ALIAS"));
  assert.equal(validateCanonicalKey("product_type:smartphone"), true);
  assert.equal(validateCanonicalKey("product_model:iphone-18-pro"), true);
  assert.deepEqual(validateOptionInput({ dictionary: "memory", canonicalKey: "bad key", label: "" }).map((issue) => issue.code), ["INVALID_CANONICAL_KEY", "EMPTY_LABEL"]);
});

test("type applicability uses the configured product family", () => {
  assert.equal(classifyProductType("Смартфон"), "smartphone");
  assert.equal(classifyProductType("Пылесос"), "vacuum");
  assert.equal(isAttributeApplicable("smartphone", "sim"), true);
  assert.equal(isAttributeApplicable("headphones", "ram"), false);
  assert.equal(isAttributeApplicable("watch", "size"), true);
});

process.stdout.write(`Passed ${checks.length} product dictionary checks.\n`);
