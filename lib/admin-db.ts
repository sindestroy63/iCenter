import "server-only";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import path from "node:path";

declare global { var adminPrisma: PrismaClient | undefined; }

export function adminDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  globalThis.adminPrisma ??= new PrismaClient({ log: [] });
  return globalThis.adminPrisma;
}

export function newId() { return `c${randomBytes(16).toString("hex").slice(0, 24)}`; }

export function uploadRoot() {
  const configured = process.env.UPLOAD_DIR;
  if (configured && !path.isAbsolute(configured)) throw new Error("UPLOAD_DIR must be absolute");
  return path.resolve(configured ?? path.join(process.cwd(), "uploads"));
}

export function uploadFilePath(storagePath: string) {
  if (!/^uploads\/[0-9]{4}\/[0-9]{2}\/[a-f0-9-]+\.(?:jpg|png|webp|avif)$/.test(storagePath)) throw new Error("Invalid storage path");
  const root = uploadRoot();
  const file = path.resolve(root, storagePath.slice("uploads/".length));
  if (!file.startsWith(root + path.sep)) throw new Error("Invalid storage path");
  return file;
}
