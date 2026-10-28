import "server-only";

import { Prisma, PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { decryptPii, encryptPii, requestHash } from "@/lib/request-pii";
import { notifyRequest } from "@/lib/telegram-requests";

declare global { var requestPrisma: PrismaClient | undefined; }

const citySlugs = ["samara", "moscow", "saint-petersburg", "orenburg"] as const;
const requestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(10).max(40).regex(/^[+()\d\s-]+$/),
  city: z.enum(citySlugs),
  contactMethod: z.enum(["phone", "telegram", "max"]),
  fulfillment: z.enum(["pickup", "delivery"]),
  address: z.string().trim().max(300).optional().default(""),
  comment: z.string().trim().max(2000).optional().default(""),
  consent: z.literal(true),
  items: z.array(z.object({ variantId: z.string().min(1).max(120), quantity: z.number().int().min(1).max(25) })).min(1).max(30),
}).superRefine((data, ctx) => {
  if (data.fulfillment === "delivery" && !data.address) ctx.addIssue({ code: "custom", path: ["address"], message: "required" });
  if (new Set(data.items.map((item) => item.variantId)).size !== data.items.length) ctx.addIssue({ code: "custom", path: ["items"], message: "duplicates" });
  const phoneDigits = data.phone.replace(/\D/g, "");
  if (phoneDigits.length !== 11 || !/^[78]/.test(phoneDigits)) ctx.addIssue({ code: "custom", path: ["phone"], message: "invalid" });
});

type Db = Prisma.TransactionClient;
type Pii = { name: string; phone: string; address: string; comment: string };
type RequestLine = { variantId: string; quantity: number; productName: string; sku: string; label: string; attributes: unknown; price: string | null; availability: string; allowPreorder: boolean };

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  globalThis.requestPrisma ??= new PrismaClient({ log: [] });
  return globalThis.requestPrisma;
}

export type RequestInput = z.infer<typeof requestSchema>;
export function parseRequestInput(value: unknown) { return requestSchema.safeParse(value); }

export async function createRequest(input: RequestInput, idempotencyKey: string) {
  if (!/^[\w-]{16,128}$/.test(idempotencyKey)) throw new RequestError("INVALID_IDEMPOTENCY_KEY", 400);
  const client = db();
  const canonical = { ...input, phone: input.phone.replace(/\D/g, ""), name: input.name.trim(), address: input.address.trim(), comment: input.comment.trim(), items: [...input.items].sort((a, b) => a.variantId.localeCompare(b.variantId)) };
  const hash = requestHash(canonical);
  try {
    const result = await client.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ locked: number }>>`
        WITH lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))
        )
        SELECT 1::int AS locked FROM lock
      `;
      const prior = await tx.$queryRaw<Array<{ orderNumber: string; requestHash: string }>>`
        SELECT "orderNumber", "requestHash" FROM order_attempts WHERE "idempotencyKey"=${idempotencyKey} LIMIT 1
      `;
      if (prior[0]) {
        if (prior[0].requestHash !== hash) throw new RequestError("IDEMPOTENCY_CONFLICT", 409);
        return { requestNumber: prior[0].orderNumber, replayed: true };
      }
      const cities = await tx.$queryRaw<Array<{ id: string; name: string }>>`
        SELECT id,name FROM cities WHERE slug=${input.city} AND "isActive"=TRUE LIMIT 1
      `;
      const city = cities[0];
      if (!city) throw new RequestError("CITY_UNAVAILABLE", 400);
      const ids = input.items.map((item) => item.variantId);
      const rows = await tx.$queryRaw<RequestLine[]>`
        SELECT v.id AS "variantId", p.name AS "productName", v.sku, v.label, v.attributes,
          i.price::text AS price, i.availability::text AS availability, i."allowPreorder"
        FROM product_variants v
        JOIN products p ON p.id=v."productId" AND p.status='PUBLISHED'::"ProductStatus"
        JOIN inventory i ON i."variantId"=v.id AND i."cityId"=${city.id} AND i."isActive"=TRUE
        WHERE v.id=ANY(${ids}::text[]) AND v."isActive"=TRUE
      `;
      if (rows.length !== ids.length) throw new RequestError("VARIANT_UNAVAILABLE", 409);
      if (rows.some((row) => row.availability !== "IN_STOCK" && row.availability !== "PREORDER" && !row.allowPreorder)) {
        throw new RequestError("STOCK_UNAVAILABLE", 409);
      }
      const lineById = new Map(rows.map((row) => [row.variantId, row]));
      const total = input.items.reduce((sum, item) => {
        const line = lineById.get(item.variantId)!;
        const price = line.price === null ? NaN : Number(line.price);
        if (!Number.isFinite(price) || price < 0) throw new RequestError("PRICE_UNAVAILABLE", 409);
        return sum + price * item.quantity;
      }, 0);
      const requestNumber = `IC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(4).toString("hex").toUpperCase()}`;
      const id = `c${randomBytes(12).toString("hex")}`;
      const pii: Pii = { name: input.name.trim(), phone: input.phone.trim(), address: input.address.trim(), comment: input.comment.trim() };
      const encrypted = encryptPii(pii);
      await tx.$executeRaw`
        INSERT INTO orders (id,"customerName","customerPhone","customerEmail",city,"cityId","deliveryType","deliveryAddress",comment,status,source,"totalAmount","encryptedPiiPayload","consentAt","consentVersion","contactMethod","createdAt","updatedAt")
        VALUES (${id},NULL,NULL,NULL,${city.name},${city.id},${input.fulfillment === "delivery" ? "DELIVERY" : "PICKUP"}::"DeliveryType",NULL,NULL,'NEW'::"OrderStatus",'WEB'::"OrderSource",${total},${encrypted},NOW(),'personal-data-v2',${input.contactMethod},NOW(),NOW())
      `;
      for (const item of input.items) {
        const line = lineById.get(item.variantId)!;
        await tx.$executeRaw`
          INSERT INTO order_items (id,"orderId","variantId",quantity,price,"productNameSnapshot","skuSnapshot","variantSnapshot")
          VALUES (${`c${randomBytes(12).toString("hex")}`},${id},${line.variantId},${item.quantity},${Number(line.price)},${line.productName},${line.sku},${JSON.stringify({ label: line.label, attributes: line.attributes })}::jsonb)
        `;
      }
      await tx.$executeRaw`
        INSERT INTO order_attempts (id,"orderId","orderNumber","cityId","itemCount","totalAmount","hasUnknownPrices",status,"idempotencyKey","requestHash","createdAt","communicationChannel")
        VALUES (${`c${randomBytes(12).toString("hex")}`},${id},${requestNumber},${city.id},${input.items.reduce((n, item) => n + item.quantity, 0)},${total},FALSE,'PENDING'::"OrderAttemptStatus",${idempotencyKey},${hash},NOW(),${input.contactMethod})
      `;
      return { requestNumber, replayed: false };
    }, { maxWait: 5000, timeout: 15000 });
    await notifyRequest(result.requestNumber);
    return result;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const prior = await client.$queryRaw<Array<{ orderNumber: string; requestHash: string }>>`SELECT "orderNumber","requestHash" FROM order_attempts WHERE "idempotencyKey"=${idempotencyKey} LIMIT 1`;
      if (prior[0]?.requestHash === hash) return { requestNumber: prior[0].orderNumber, replayed: true };
      if (prior[0]) throw new RequestError("IDEMPOTENCY_CONFLICT", 409);
    }
    throw error;
  }
}

export class RequestError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}

export type RequestViewer = { userId: string; role: string };
const requestStatuses = new Set(["NEW", "PROCESSING", "CONFIRMED", "SHIPPING", "COMPLETED", "CANCELLED"]);

export async function updateRequestStatus(viewer: RequestViewer, identifier: string, status: string) {
  if (!["OWNER", "ADMIN", "DEVELOPER", "CITY_MANAGER"].includes(viewer.role)) throw new RequestError("FORBIDDEN", 403);
  if (!requestStatuses.has(status)) throw new RequestError("INVALID_STATUS", 400);
  const client = db();
  const updated = await client.$queryRaw<Array<{ status: string }>>`
    UPDATE orders o SET status=${status}::"OrderStatus", "updatedAt"=NOW()
    WHERE (o.id=${identifier} OR EXISTS (SELECT 1 FROM order_attempts a WHERE a."orderId"=o.id AND a."orderNumber"=${identifier}))
      AND (${viewer.role !== "CITY_MANAGER"} OR EXISTS (
        SELECT 1 FROM user_city_access grant_city WHERE grant_city."cityId"=o."cityId" AND grant_city."userId"=${viewer.userId}
      ))
    RETURNING o.status::text AS status
  `;
  if (updated[0]) return updated[0].status;
  const found = await client.$queryRaw<Array<{ id: string }>>`
    SELECT o.id FROM orders o
    WHERE o.id=${identifier} OR EXISTS (SELECT 1 FROM order_attempts a WHERE a."orderId"=o.id AND a."orderNumber"=${identifier})
    LIMIT 1
  `;
  if (found.length) throw new RequestError("FORBIDDEN", 403);
  throw new RequestError("NOT_FOUND", 404);
}

export async function deleteRequest(viewer: RequestViewer, identifier: string) {
  if (viewer.role !== "OWNER") throw new RequestError("FORBIDDEN", 403);
  const client = db();
  await client.$transaction(async (tx) => {
    const found = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT o.id FROM orders o
      WHERE o.id=${identifier} OR EXISTS (
        SELECT 1 FROM order_attempts a WHERE a."orderId"=o.id AND a."orderNumber"=${identifier}
      )
      LIMIT 1 FOR UPDATE OF o
    `;
    const order = found[0];
    if (!order) throw new RequestError("NOT_FOUND", 404);
    await tx.$executeRaw`DELETE FROM order_attempts WHERE "orderId"=${order.id}`;
    await tx.$executeRaw`DELETE FROM order_items WHERE "orderId"=${order.id}`;
    await tx.$executeRaw`DELETE FROM orders WHERE id=${order.id}`;
  });
}

export async function listRequests(viewer: RequestViewer) {
  const client = db();
  if (!["OWNER", "ADMIN", "DEVELOPER", "CITY_MANAGER"].includes(viewer.role)) throw new RequestError("FORBIDDEN", 403);
  const rows = viewer.role === "CITY_MANAGER"
    ? await client.$queryRaw<any[]>`
        SELECT o.id,o."createdAt",c.name AS city,o."totalAmount",o."encryptedPiiPayload",o."customerName",o."customerPhone",o."contactMethod",o."deliveryType",o.comment AS "legacyComment",o.status::text AS "orderStatus",a."orderNumber",a."itemCount",
          COALESCE(json_agg(json_build_object('name',oi."productNameSnapshot",'sku',oi."skuSnapshot",'variant',oi."variantSnapshot",'quantity',oi.quantity,'price',oi.price)) FILTER (WHERE oi.id IS NOT NULL),'[]') AS items
        FROM orders o JOIN cities c ON c.id=o."cityId" JOIN user_city_access grant_city ON grant_city."cityId"=c.id AND grant_city."userId"=${viewer.userId}
        LEFT JOIN order_attempts a ON a."orderId"=o.id
        LEFT JOIN order_items oi ON oi."orderId"=o.id
        WHERE o."encryptedPiiPayload" IS NOT NULL
        GROUP BY o.id,c.name,a."orderNumber",a."itemCount",o.status
        ORDER BY o."createdAt" DESC LIMIT 200
      `
    : await client.$queryRaw<any[]>`
        SELECT o.id,o."createdAt",c.name AS city,o."totalAmount",o."encryptedPiiPayload",o."customerName",o."customerPhone",o."contactMethod",o."deliveryType",o.comment AS "legacyComment",o.status::text AS "orderStatus",a."orderNumber",a."itemCount",
          COALESCE(json_agg(json_build_object('name',oi."productNameSnapshot",'sku',oi."skuSnapshot",'variant',oi."variantSnapshot",'quantity',oi.quantity,'price',oi.price)) FILTER (WHERE oi.id IS NOT NULL),'[]') AS items
        FROM orders o JOIN cities c ON c.id=o."cityId" LEFT JOIN order_attempts a ON a."orderId"=o.id
        LEFT JOIN order_items oi ON oi."orderId"=o.id
        WHERE o."encryptedPiiPayload" IS NOT NULL
        GROUP BY o.id,c.name,a."orderNumber",a."itemCount",o.status
        ORDER BY o."createdAt" DESC LIMIT 200
      `;
  return rows.map((row) => {
    const pii = row.encryptedPiiPayload ? decryptPii<Pii>(row.encryptedPiiPayload) : { name: row.customerName ?? "", phone: row.customerPhone ?? "", address: "", comment: row.legacyComment ?? "" };
    return { id: row.orderNumber ?? row.id, createdAt: row.createdAt, city: row.city, name: pii.name, phone: pii.phone, address: pii.address, comment: pii.comment, contactMethod: row.contactMethod, fulfillment: row.deliveryType, total: Number(row.totalAmount), status: row.orderStatus, items: row.items };
  });
}

export async function getRequestDashboard(viewer: RequestViewer) {
  if (!["OWNER", "ADMIN", "DEVELOPER", "CITY_MANAGER"].includes(viewer.role)) throw new RequestError("FORBIDDEN", 403);
  const client = db();
  const cityManager = viewer.role === "CITY_MANAGER";
  const [aggregate, rows] = await Promise.all([
    client.$queryRaw<Array<{ total: number; newCount: number; inProgress: number; completed: number; amount: string }>>`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE o.status='NEW'::"OrderStatus")::int AS "newCount",
        COUNT(*) FILTER (WHERE o.status IN ('PROCESSING'::"OrderStatus",'CONFIRMED'::"OrderStatus",'SHIPPING'::"OrderStatus"))::int AS "inProgress",
        COUNT(*) FILTER (WHERE o.status='COMPLETED'::"OrderStatus")::int AS completed,
        COALESCE(SUM(o."totalAmount"),0)::text AS amount
      FROM orders o
      WHERE (${!cityManager} OR EXISTS (
        SELECT 1 FROM user_city_access grant_city WHERE grant_city."cityId"=o."cityId" AND grant_city."userId"=${viewer.userId}
      ))
    `,
    client.$queryRaw<any[]>`
      SELECT o.id,o."createdAt",o."totalAmount",o."encryptedPiiPayload",o."customerName",o.status::text AS status,
        latest."orderNumber"
      FROM orders o
      LEFT JOIN LATERAL (
        SELECT a."orderNumber" FROM order_attempts a WHERE a."orderId"=o.id ORDER BY a."createdAt" DESC LIMIT 1
      ) latest ON TRUE
      WHERE (${!cityManager} OR EXISTS (
        SELECT 1 FROM user_city_access grant_city WHERE grant_city."cityId"=o."cityId" AND grant_city."userId"=${viewer.userId}
      ))
      ORDER BY o."createdAt" DESC LIMIT 5
    `,
  ]);
  const totals = aggregate[0] ?? { total: 0, newCount: 0, inProgress: 0, completed: 0, amount: "0" };
  return {
    total: totals.total,
    newCount: totals.newCount,
    inProgress: totals.inProgress,
    completed: totals.completed,
    amount: Number(totals.amount),
    recent: rows.map((row) => {
      const pii = row.encryptedPiiPayload ? decryptPii<Pii>(row.encryptedPiiPayload) : null;
      return {
        id: row.orderNumber ?? row.id,
        createdAt: row.createdAt,
        name: pii?.name ?? row.customerName ?? "",
        total: Number(row.totalAmount),
        status: row.status,
      };
    }),
  };
}
