import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireGlobalAdminSession } from "@/lib/auth";
import { adminDb } from "@/lib/admin-db";

export const dynamic = "force-dynamic";

const PAGE_SIZE_MAX = 100;
const PAGE_MAX = 100000;
const SENSITIVE_KEYS = /password|token|secret|hash|pii|phone|email|address/i;

function safeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SENSITIVE_KEYS.test(key))
    .map(([key, item]) => [key, safeValue(item)]));
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "AUDIT_LOGS_FAILED";
  if (message === "UNAUTHORIZED") return NextResponse.json({ error: message }, { status: 401 });
  if (message === "FORBIDDEN") return NextResponse.json({ error: message }, { status: 403 });
  return NextResponse.json({ error: "AUDIT_LOGS_FAILED" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await requireGlobalAdminSession();
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId")?.trim() || null;
    const action = url.searchParams.get("action")?.trim() || null;
    const entityType = url.searchParams.get("entityType")?.trim() || null;
    const entityId = url.searchParams.get("entityId")?.trim() || null;
    const from = url.searchParams.get("from")?.trim() || null;
    const to = url.searchParams.get("to")?.trim() || null;
    const requestedPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
    const page = Number.isFinite(requestedPage) ? Math.min(PAGE_MAX, Math.max(1, requestedPage)) : 1;
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25));
    const conditions = [Prisma.sql`TRUE`];
    if (userId) conditions.push(Prisma.sql`a."userId" = ${userId}`);
    if (action) conditions.push(Prisma.sql`a.action = ${action}`);
    if (entityType) conditions.push(Prisma.sql`a."entityType" = ${entityType}`);
    if (entityId) conditions.push(Prisma.sql`a."entityId" = ${entityId}`);
    if (from) conditions.push(Prisma.sql`a."createdAt" >= ${from}::timestamp`);
    if (to) conditions.push(Prisma.sql`a."createdAt" < (${to}::date + INTERVAL '1 day')`);
    const where = Prisma.join(conditions, " AND ");
    const db = adminDb();
    const countRows = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM audit_logs a WHERE ${where}`;
    const total = Number(countRows[0]?.count ?? 0);
    const rows = await db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT a.id,a."createdAt",a."userId",a.action,a."entityType",a."entityId",a.changes,a.metadata,
        COALESCE(a.metadata->>'actorName', u.name) AS "actorName",
        COALESCE(a.metadata->>'actorRole', u.role::text) AS "actorRole",
        a.metadata->>'cityId' AS "cityId", c.name AS "cityName"
      FROM audit_logs a
      LEFT JOIN users u ON u.id=a."userId"
      LEFT JOIN cities c ON c.id=(a.metadata->>'cityId')
      WHERE ${where}
      ORDER BY a."createdAt" DESC, a.id DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;
    const data = rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      userId: row.userId,
      actorName: row.actorName ?? null,
      actorRole: row.actorRole ?? null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      cityId: row.cityId ?? null,
      cityName: row.cityName ?? null,
      changes: safeValue(row.changes),
    }));
    const employees = await db.$queryRaw<Array<{ id: string; name: string | null; role: string }>>`SELECT id,name,role::text AS role FROM users ORDER BY name NULLS LAST,id`;
    return NextResponse.json({ data, employees, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
  } catch (error) { return errorResponse(error); }
}
