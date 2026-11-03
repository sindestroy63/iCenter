import "server-only";

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { decryptPii, encryptPii, requestHash } from "@/lib/request-pii";
import { dualConsentEvidence, PERSONAL_DATA_CONSENT_VERSION, type ConsentEvidence } from "@/lib/consent-evidence";
import { writeAuditLog } from "@/lib/admin-audit";

declare global { var tradeInPrisma: PrismaClient | undefined; }
const statuses = new Set(["NEW", "PROCESSING", "CONTACTED", "COMPLETED", "CANCELLED"]);
const cities = new Set(["samara", "moscow", "saint-petersburg", "orenburg"]);

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return globalThis.tradeInPrisma ??= new PrismaClient({ log: [] });
}

export type LeadRequestType = "trade_in" | "installment";
export type TradeInInput = {
  requestType: LeadRequestType; name: string; phone: string; brand: string; deviceType: string; device: string;
  configuration: string; color: string; batteryHealth: number | null; equipment: string[]; condition: string; comment: string; desiredDevice: string; photoUrls: string[];
  city: string; productId?: string; productSlug?: string; personalDataConsent: true; privacyConsent: true;
};

export async function createTradeInLead(input: TradeInInput, idempotencyKey: string) {
  if (!/^[\w-]{16,128}$/.test(idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
  if (!cities.has(input.city)) throw new Error("CITY_UNAVAILABLE");
  const client = db();
  const cityRows = await client.$queryRaw<Array<{ id: string }>>`SELECT id FROM cities WHERE slug=${input.city} AND "isActive"=TRUE LIMIT 1`;
  const city = cityRows[0];
  if (!city) throw new Error("CITY_UNAVAILABLE");
  let product: { id: string; name: string } | null = null;
  if (input.productId || input.productSlug) {
    const productRows = await client.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id,name FROM products
      WHERE status='PUBLISHED'::"ProductStatus"
        AND (${input.productId ?? null}::text IS NULL OR id=${input.productId ?? null})
        AND (${input.productSlug ?? null}::text IS NULL OR slug=${input.productSlug ?? null})
      LIMIT 1
    `;
    product = productRows[0] ?? null;
    if (!product) throw new Error("PRODUCT_UNAVAILABLE");
  }
  const pii = { requestType: input.requestType, origin: product ? "product" : "page", name: input.name.trim(), phone: input.phone.trim(), brand: input.brand.trim(), deviceType: input.deviceType.trim(), device: input.device.trim(), configuration: input.configuration.trim(), color: input.color.trim(), batteryHealth: input.batteryHealth, equipment: input.equipment, condition: input.condition.trim(), comment: input.comment.trim(), desiredDevice: input.desiredDevice.trim(), photoUrls: input.photoUrls, consentEvidence: dualConsentEvidence() };
  const canonical = { ...pii, city: input.city, productId: product?.id ?? null, personalDataConsent: true, privacyConsent: true };
  const hash = requestHash(canonical);
  const encrypted = encryptPii(pii);
  const requestNumber = `${input.requestType === "installment" ? "IN" : "TI"}-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const id = `c${randomBytes(12).toString("hex")}`;
  const inserted = await client.$queryRaw<Array<{ requestNumber: string }>>`
    INSERT INTO trade_in_requests (id,"requestNumber","idempotencyKey","requestHash","cityId","productId","productNameSnapshot","encryptedPiiPayload",source,status,"consentAt","consentVersion","createdAt","updatedAt")
    VALUES (${id},${requestNumber},${idempotencyKey},${hash},${city.id},${product?.id ?? null},${product?.name ?? (input.desiredDevice.trim() || null)},${encrypted},'trade_in','NEW',NOW(),${PERSONAL_DATA_CONSENT_VERSION},NOW(),NOW())
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "requestNumber"
  `;
  if (inserted[0]) return { requestNumber: inserted[0].requestNumber, replayed: false, productName: product?.name ?? input.desiredDevice.trim() };
  const prior = await client.$queryRaw<Array<{ requestNumber: string; requestHash: string }>>`SELECT "requestNumber","requestHash" FROM trade_in_requests WHERE "idempotencyKey"=${idempotencyKey} LIMIT 1`;
  if (!prior[0]) throw new Error("TRADE_IN_SAVE_FAILED");
  if (prior[0].requestHash !== hash) throw new Error("IDEMPOTENCY_CONFLICT");
  return { requestNumber: prior[0].requestNumber, replayed: true, productName: product?.name ?? input.desiredDevice.trim() };
}

export type TradeInViewer = { userId: string; role: string; sessionId?: string; name?: string | null };
function adminPhotoUrl(value: string, requestNumber: string) {
  return /^\/uploads\/\d{4}\/\d{2}\/lead-[a-f0-9]{32}\.(?:jpg|png|webp|avif)$/.test(value)
    ? `/api/admin/lead-photo?request=${encodeURIComponent(requestNumber)}&path=${encodeURIComponent(value)}` : "";
}
export async function listTradeInLeads(viewer: TradeInViewer) {
  if (!["OWNER", "ADMIN", "DEVELOPER", "CITY_MANAGER"].includes(viewer.role)) throw new Error("FORBIDDEN");
  const client = db();
  const rows = viewer.role === "CITY_MANAGER"
    ? await client.$queryRaw<any[]>`
        SELECT lead.id,lead."requestNumber",lead."createdAt",lead.status,lead."encryptedPiiPayload",lead."productNameSnapshot",city.name AS city
        FROM trade_in_requests lead JOIN cities city ON city.id=lead."cityId"
        WHERE EXISTS (SELECT 1 FROM users u WHERE u.id=${viewer.userId} AND u."isActive"=TRUE AND u.role::text='CITY_MANAGER' AND (COALESCE((to_jsonb(u)->>'allCities')::boolean,FALSE)=TRUE OR EXISTS (SELECT 1 FROM user_city_access grant_city WHERE grant_city."cityId"=city.id AND grant_city."userId"=${viewer.userId})))
        ORDER BY lead."createdAt" DESC LIMIT 200
      `
    : await client.$queryRaw<any[]>`
        SELECT lead.id,lead."requestNumber",lead."createdAt",lead.status,lead."encryptedPiiPayload",lead."productNameSnapshot",city.name AS city
        FROM trade_in_requests lead JOIN cities city ON city.id=lead."cityId"
        ORDER BY lead."createdAt" DESC LIMIT 200
      `;
  return rows.map((row) => ({ id: row.requestNumber, createdAt: row.createdAt, city: row.city, product: row.productNameSnapshot ?? "", status: row.status, _pii: row.encryptedPiiPayload })).map(({ _pii, ...row }) => {
    const pii = decryptPii<Partial<{ requestType: LeadRequestType; origin: "page" | "product"; name: string; phone: string; brand: string; deviceType: string; device: string; configuration: string; color: string; batteryHealth: number | null; equipment: string[]; condition: string; comment: string; desiredDevice: string; photoUrls: string[]; consentEvidence: ConsentEvidence }>>(_pii);
    return { ...row, requestType: pii.requestType ?? "trade_in", origin: pii.origin ?? (row.product ? "product" : "page"), name: pii.name ?? "", phone: pii.phone ?? "", brand: pii.brand ?? "", deviceType: pii.deviceType ?? "", device: pii.device ?? "", configuration: pii.configuration ?? "", color: pii.color ?? "", batteryHealth: pii.batteryHealth ?? null, equipment: Array.isArray(pii.equipment) ? pii.equipment : [], condition: pii.condition ?? "", comment: pii.comment ?? "", desiredDevice: pii.desiredDevice ?? row.product, photoUrls: Array.isArray(pii.photoUrls) ? pii.photoUrls.map((url) => adminPhotoUrl(url, row.id)).filter(Boolean) : [] };
  });
}

export async function canViewTradeInPhoto(viewer: TradeInViewer, requestNumber: string, photoPath: string) {
  if (!/^\/uploads\/\d{4}\/\d{2}\/lead-[a-f0-9]{32}\.(?:jpg|png|webp|avif)$/.test(photoPath)) return false;
  if (!["OWNER", "ADMIN", "DEVELOPER", "CITY_MANAGER"].includes(viewer.role)) return false;
  const rows = await db().$queryRaw<Array<{ cityId: string; encryptedPiiPayload: string }>>`
    SELECT "cityId","encryptedPiiPayload" FROM trade_in_requests
    WHERE "requestNumber"=${requestNumber} AND "encryptedPiiPayload" IS NOT NULL LIMIT 1
  `;
  const lead = rows[0];
  if (!lead) return false;
  const pii = decryptPii<Partial<{ photoUrls: string[] }>>(lead.encryptedPiiPayload);
  if (!Array.isArray(pii.photoUrls) || !pii.photoUrls.includes(photoPath)) return false;
  if (viewer.role !== "CITY_MANAGER") return true;
  const access = await db().$queryRaw<Array<{ allowed: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM users u JOIN cities c ON c.id=${lead.cityId} AND c."isActive"=TRUE
      WHERE u.id=${viewer.userId} AND u.role::text='CITY_MANAGER' AND u."isActive"=TRUE
        AND (COALESCE((to_jsonb(u)->>'allCities')::boolean,FALSE)=TRUE OR EXISTS (
          SELECT 1 FROM user_city_access grant_city WHERE grant_city."userId"=u.id AND grant_city."cityId"=c.id
        ))
    ) AS allowed
  `;
  return Boolean(access[0]?.allowed);
}

export async function updateTradeInStatus(viewer: TradeInViewer, requestNumber: string, status: string) {
  if (!["OWNER", "ADMIN", "DEVELOPER", "CITY_MANAGER"].includes(viewer.role)) throw new Error("FORBIDDEN");
  if (!statuses.has(status)) throw new Error("INVALID_STATUS");
  const client = db();
  return client.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: string; cityId: string }>>`
      SELECT id,status,"cityId" FROM trade_in_requests lead WHERE lead."requestNumber"=${requestNumber}
        AND (${viewer.role !== "CITY_MANAGER"} OR EXISTS (SELECT 1 FROM users u WHERE u.id=${viewer.userId} AND u."isActive"=TRUE AND u.role::text='CITY_MANAGER' AND (COALESCE((to_jsonb(u)->>'allCities')::boolean,FALSE)=TRUE OR EXISTS (SELECT 1 FROM user_city_access access WHERE access."cityId"=lead."cityId" AND access."userId"=${viewer.userId}))))
        LIMIT 1 FOR UPDATE`;
    if (!rows[0]) throw new Error("NOT_FOUND");
    await tx.$executeRaw`UPDATE trade_in_requests SET status=${status},"updatedAt"=NOW() WHERE id=${rows[0].id}`;
    if (viewer.sessionId) await writeAuditLog(tx, { ...viewer, sessionId: viewer.sessionId }, { action: "lead.status_updated", entityType: "trade_in_request", entityId: rows[0].id, changes: { status: { old: rows[0].status, new: status } }, metadata: { cityId: rows[0].cityId, requestType: "trade_in_or_installment" } });
    return status;
  });
}
