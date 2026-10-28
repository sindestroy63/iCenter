import { NextResponse } from "next/server";
import { adminDb, uploadFilePath, uploadRoot } from "@/lib/admin-db";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "video/mp4", "video/webm"]);

function streamFile(file: string, start?: number, end?: number) {
  return Readable.toWeb(createReadStream(file, start === undefined ? undefined : { start, end })) as ReadableStream;
}

export async function GET(request: Request, { params }: { params: { path: string[] } }) {
  const storagePath = `uploads/${params.path.join("/")}`;
  try {
    const rows = await adminDb().$queryRaw<Array<{ storagePath: string; mimeType: string }>>`SELECT "storagePath", "mimeType" FROM media WHERE "storagePath" = ${storagePath} LIMIT 1`;
    const row = rows[0];
    if (!row || !allowedMimeTypes.has(row.mimeType)) return new NextResponse(null, { status: 404 });
    const file = uploadFilePath(row.storagePath);
    const [rootReal, fileReal, fileStat] = await Promise.all([realpath(uploadRoot()), realpath(file), stat(file)]);
    if (!fileReal.startsWith(rootReal + path.sep)) return new NextResponse(null, { status: 404 });
    const baseHeaders = { "content-type": row.mimeType, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "accept-ranges": "bytes" };
    const range = request.headers.get("range");
    if (range && row.mimeType.startsWith("video/")) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) return new NextResponse(null, { status: 416, headers: { ...baseHeaders, "content-range": `bytes */${fileStat.size}` } });
      const suffixLength = match[1] ? null : Number(match[2]);
      const start = match[1] ? Number(match[1]) : Math.max(0, fileStat.size - (suffixLength || 0));
      const end = match[1] && match[2] ? Math.min(Number(match[2]), fileStat.size - 1) : fileStat.size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= fileStat.size) return new NextResponse(null, { status: 416, headers: { ...baseHeaders, "content-range": `bytes */${fileStat.size}` } });
      return new NextResponse(streamFile(fileReal, start, end), { status: 206, headers: { ...baseHeaders, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${fileStat.size}` } });
    }
    return new NextResponse(streamFile(fileReal), { headers: { ...baseHeaders, "content-length": String(fileStat.size) } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
