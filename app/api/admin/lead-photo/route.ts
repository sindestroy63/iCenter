import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { requireRequestSession } from "@/lib/auth";
import { uploadFilePath, uploadRoot } from "@/lib/admin-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mimeByExtension: Record<string, string> = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif" };

export async function GET(request: Request) {
  try {
    await requireRequestSession();
    const requestedPath = new URL(request.url).searchParams.get("path") ?? "";
    if (!/^\/uploads\/\d{4}\/\d{2}\/lead-[a-f0-9]{32}\.(?:jpg|png|webp|avif)$/.test(requestedPath)) return new NextResponse(null, { status: 404 });
    const storagePath = requestedPath.slice(1);
    const file = uploadFilePath(storagePath);
    const [rootReal, fileReal, fileStat] = await Promise.all([realpath(uploadRoot()), realpath(file), stat(file)]);
    if (!fileReal.startsWith(rootReal + path.sep) || !fileStat.isFile()) return new NextResponse(null, { status: 404 });
    const mime = mimeByExtension[path.extname(fileReal).toLowerCase()];
    if (!mime) return new NextResponse(null, { status: 404 });
    const stream = Readable.toWeb(createReadStream(fileReal)) as ReadableStream;
    return new NextResponse(stream, { headers: { "content-type": mime, "content-length": String(fileStat.size), "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    return new NextResponse(null, { status: 404 });
  }
}
