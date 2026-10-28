import "server-only";

import { Prisma, PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const citySlugs = ["samara", "moscow", "saint-petersburg", "orenburg"] as const;
const citySchema = z.enum(citySlugs);
const slugSchema = z.string().trim().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);

declare global {
  // eslint-disable-next-line no-var
  var catalogPrisma: PrismaClient | undefined;
}

type Db = Prisma.TransactionClient;
type CityRow = { id: string; name: string; slug: string };

function prisma() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  globalThis.catalogPrisma ??= new PrismaClient({ log: [] });
  return globalThis.catalogPrisma;
}

export async function readOnly<T>(work: (tx: Db) => Promise<T>): Promise<T> {
  return prisma().$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return work(tx);
  }, { maxWait: 5000, timeout: 15000 });
}

function safeErrorCode(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(value) ? value : undefined;
}

export function logApiError(error: unknown, route: string) {
  const value = error && typeof error === "object" ? error as {
    name?: unknown;
    code?: unknown;
    meta?: { code?: unknown; driverAdapterError?: { cause?: { code?: unknown } } };
    cause?: { code?: unknown };
  } : {};
  const details = {
    route,
    name: safeErrorCode(value.name) ?? "UnknownError",
    errorCode: safeErrorCode(value.code),
    prismaOrPostgresCode: safeErrorCode(value.meta?.code)
      ?? safeErrorCode(value.meta?.driverAdapterError?.cause?.code)
      ?? safeErrorCode(value.cause?.code),
  };
  console.error("[catalog-api:error]", JSON.stringify(details));
}

export function apiError(error: unknown, route = "catalog.unknown") {
  logApiError(error, route);
  const missingConfig = error instanceof Error && error.message === "DATABASE_URL is not configured";
  return NextResponse.json({ error: missingConfig ? "Catalog database is not configured" : "Catalog data is temporarily unavailable" }, { status: 503 });
}

export function validateCity(value: string | null) {
  const parsed = citySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function validateSlug(value: string) {
  return slugSchema.safeParse(value).success;
}

export async function findCity(tx: Db, slug: (typeof citySlugs)[number]) {
  const rows = await tx.$queryRaw<CityRow[]>`
    SELECT id, name, slug
    FROM cities
    WHERE slug = ${slug} AND "isActive" = TRUE
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export function imageUrl(storagePath: string | null, mimeType?: string | null) {
  if (!storagePath || (mimeType && !mimeType.startsWith("image/"))) return null;
  if (/^https:\/\//i.test(storagePath)) return storagePath;
  if (storagePath.includes("..") || storagePath.includes("\\") || /^[a-zA-Z]:/.test(storagePath)) return null;
  const path = storagePath.replace(/^\/+/, "");
  if (!/^(assets|uploads|media)\/[a-zA-Z0-9._/-]+$/.test(path)) return null;
  return `/${path}`;
}

export type PublicAvailability = "IN_STOCK" | "PREORDER" | "OUT_OF_STOCK" | "UNSPECIFIED";

export function publicAvailability(value: string, allowPreorder: boolean): PublicAvailability {
  if (value === "IN_STOCK") return "IN_STOCK";
  if (value === "PREORDER") return "PREORDER";
  if (value === "OUT_OF_STOCK") return "OUT_OF_STOCK";
  if (allowPreorder) return "PREORDER";
  return "UNSPECIFIED";
}

export function readRequestUrl(request: Request) {
  return new URL(request.url);
}

export function cityValidationError() {
  return NextResponse.json({ error: "city must be one of: samara, moscow, saint-petersburg, orenburg" }, { status: 400 });
}

export function invalidInputError() {
  return NextResponse.json({ error: "Invalid catalog query parameters" }, { status: 400 });
}
