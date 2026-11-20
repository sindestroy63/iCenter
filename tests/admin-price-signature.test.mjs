import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { canonicalPriceSnapshot, priceExportRowSignature } from "../lib/admin-price-signature.ts";

const key = "test-signing-key-at-least-16-bytes";
const exportId = "export-id";
const base = {
  productId: "product-1",
  variantId: "variant-1",
  cityId: "city-1",
  sku: "SKU-1",
  inventoryId: null,
  snapshotUpdatedAt: "2026-11-20T10:00:00.000Z",
  price: null,
  availability: "",
};

assert.deepEqual(canonicalPriceSnapshot(base, exportId).slice(-3), ["2026-11-20T10:00:00.000Z", null, null]);
assert.equal(priceExportRowSignature(base, exportId, key), priceExportRowSignature({ ...base, inventoryId: "", price: "", availability: null }, exportId, key));
assert.equal(priceExportRowSignature({ ...base, price: "120000" }, exportId, key), priceExportRowSignature({ ...base, price: 120000 }, exportId, key));

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Прайс-лист");
sheet.addRow([base.inventoryId ?? "", base.price ?? "", base.availability, priceExportRowSignature(base, exportId, key)]);
const buffer = await workbook.xlsx.writeBuffer();
const loaded = new ExcelJS.Workbook();
await loaded.xlsx.load(buffer);
const row = loaded.getWorksheet("Прайс-лист").getRow(1);
const roundTrip = { ...base, inventoryId: String(row.getCell(1).value ?? "") || null, price: String(row.getCell(2).value ?? "") || null, availability: String(row.getCell(3).value ?? "") || null };
assert.equal(row.getCell(4).value, priceExportRowSignature(roundTrip, exportId, key));

assert.notEqual(priceExportRowSignature(base, exportId, key), priceExportRowSignature({ ...base, variantId: "tampered" }, exportId, key));
assert.notEqual(priceExportRowSignature(base, exportId, key), priceExportRowSignature({ ...base, cityId: "other-city" }, exportId, key));
assert.notEqual(priceExportRowSignature(base, exportId, key), priceExportRowSignature({ ...base, sku: "SKU-TAMPERED" }, exportId, key));

process.stdout.write("Passed admin price signature round-trip checks.\n");
