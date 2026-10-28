import { NextResponse } from "next/server";
import { adminDb, uploadFilePath, uploadRoot } from "@/lib/admin-db";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { path: string[] } }) {
  const storagePath = `uploads/${params.path.join("/")}`;
  try {
    const rows = await adminDb().$queryRaw<Array<{ storagePath: string; mimeType: string }>>`SELECT "storagePath", "mimeType" FROM media WHERE "storagePath" = ${storagePath} LIMIT 1`;
    const row = rows[0];
    if (!row || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(row.mimeType)) return new NextResponse(null, { status: 404 });
    const file = uploadFilePath(row.storagePath);
    const [rootReal, fileReal, bytes] = await Promise.all([realpath(uploadRoot()), realpath(file), readFile(file)]);
    if (!fileReal.startsWith(rootReal + path.sep)) return new NextResponse(null, { status: 404 });
    return new NextResponse(bytes, { headers: { "content-type": row.mimeType, "content-length": String(bytes.length), "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" } });
  } catch { return new NextResponse(null, { status: 404 }); }
}
