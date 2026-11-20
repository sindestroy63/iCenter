import { createHmac } from "node:crypto";

export const PRICE_EXPORT_FORMAT_ID = "icenter-price-list";
export const PRICE_EXPORT_FORMAT_VERSION = "3";

type SignedPriceRow = {
  productId: string;
  variantId: string;
  cityId: string;
  sku: string;
  inventoryId: string | null;
  snapshotUpdatedAt: Date | string;
  price: string | number | null;
  availability: string | null;
};

function snapshotTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? "").trim() : date.toISOString();
}

export function canonicalPriceSnapshot(row: SignedPriceRow, exportId: string) {
  const rawPrice = row.price;
  const parsedPrice = rawPrice === null || rawPrice === undefined || rawPrice === "" ? null : Number(rawPrice);
  return [
    PRICE_EXPORT_FORMAT_ID,
    PRICE_EXPORT_FORMAT_VERSION,
    exportId,
    row.productId,
    row.variantId,
    row.cityId,
    row.sku,
    row.inventoryId || null,
    snapshotTime(row.snapshotUpdatedAt),
    parsedPrice === null ? null : Number.isSafeInteger(parsedPrice) ? parsedPrice : rawPrice,
    row.availability || null,
  ];
}

export function priceExportRowSignature(row: SignedPriceRow, exportId: string, signingKey: string) {
  return createHmac("sha256", signingKey).update(JSON.stringify(canonicalPriceSnapshot(row, exportId))).digest("base64url");
}
