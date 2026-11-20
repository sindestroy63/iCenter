import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export%20default%20{}", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const target = path.resolve(process.cwd(), `${specifier.slice(2)}.ts`);
      return { url: pathToFileURL(target).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const [{ buildPriceExportWorkbook }, { getPriceExportData }, { previewPriceImport }, { adminDb }, { availabilityLabel }] = await Promise.all([
  import("../lib/admin-price-export.ts"),
  import("../lib/admin-price-export-data.ts"),
  import("../lib/admin-price-import.ts"),
  import("../lib/admin-db.ts"),
  import("../lib/inventory-availability.ts"),
]);

const signingKey = process.env.PRICE_EXPORT_SIGNING_KEY?.trim() || process.env.REQUEST_PII_KEY?.trim();
assert.ok(signingKey && signingKey.length >= 16, "local price export signing key is required");
const session = { userId: "local-readonly-preview", role: "OWNER", isActive: true, allCities: true, allCitiesCanManagePrices: true, allCitiesCanManageStock: true, sessionId: "local-readonly-preview", name: "Local read-only preview" };
const cities = await adminDb().$queryRaw`SELECT id,name FROM cities WHERE name='Самара' AND "isActive"=TRUE LIMIT 1`;
assert.ok(cities[0], "active Samara city must exist in the local database");
const data = await getPriceExportData(session, { cityId: cities[0].id });
const exported = await buildPriceExportWorkbook(data.rows, { cityName: data.city.name, brandName: null, categoryName: null }, signingKey);
const baseline = await previewPriceImport(session, Buffer.from(exported.buffer), data.city.id, signingKey);
assert.equal(baseline.counts.errors, 0, `fresh local export has errors: ${JSON.stringify(baseline.rows.filter((row) => row.errors.length).slice(0, 3))}`);
assert.equal(baseline.counts.changed, 0);

async function editedWorkbook(edit) {
  const workbook = await import("exceljs").then(({ default: ExcelJS }) => new ExcelJS.Workbook());
  await workbook.xlsx.load(exported.buffer);
  await edit(workbook.getWorksheet("Прайс-лист"));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const pricedIndex = data.rows.findIndex((row) => row.inventoryId && row.price !== null);
assert.ok(pricedIndex >= 0, "Samara export must include a priced inventory row");
const excelRow = pricedIndex + 2;
const pricePreview = await previewPriceImport(session, await editedWorkbook((sheet) => { sheet.getRow(excelRow).getCell(11).value = Number(data.rows[pricedIndex].price) + 1; }), data.city.id, signingKey);
assert.equal(pricePreview.counts.errors, 0);
assert.equal(pricePreview.counts.changed, 1);

const currentLabel = availabilityLabel(data.rows[pricedIndex]);
const nextLabel = ["В наличии", "Ожидается поступление 1-2 дня", "Под заказ 1-2 дня", "Под заказ 2-4 дня", "Наличие уточняйте"].find((label) => label !== currentLabel);
const statusPreview = await previewPriceImport(session, await editedWorkbook((sheet) => { sheet.getRow(excelRow).getCell(12).value = nextLabel; }), data.city.id, signingKey);
assert.equal(statusPreview.counts.errors, 0);
assert.equal(statusPreview.counts.changed, 1);

for (const [column, value] of [[4, "TAMPERED-SKU"], [14, "tampered-variant"], [15, "tampered-city"], [18, Number(data.rows[pricedIndex].price) + 12345], [19, "tampered-status"]]) {
  const result = await previewPriceImport(session, await editedWorkbook((sheet) => { sheet.getRow(excelRow).getCell(column).value = value; }), data.city.id, signingKey);
  assert.ok(result.counts.errors > 0, `protected column ${column} tampering must fail`);
}

const otherCityId = (await adminDb().$queryRaw`SELECT id FROM cities WHERE id<>${data.city.id} AND "isActive"=TRUE LIMIT 1`)[0]?.id;
if (otherCityId) {
  const otherCityPreview = await previewPriceImport(session, Buffer.from(exported.buffer), otherCityId, signingKey);
  assert.equal(otherCityPreview.counts.errors, baseline.counts.total);
}

process.stdout.write(`Local preview verified: ${JSON.stringify({ baseline: baseline.counts, price: pricePreview.counts, status: statusPreview.counts, protectedColumns: 5 })}\n`);
