import { NextResponse } from "next/server";
import { requireGlobalAdminMutation, requireGlobalAdminSession } from "@/lib/auth";
import { adminDb, newId, uploadFilePath, uploadRoot } from "@/lib/admin-db";
import { acceptedExtensions, bannerVideoMaxBytes, detectUploadMedia, IMAGE_UPLOAD_MAX_BYTES } from "@/lib/media-upload";
import { mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireGlobalAdminSession();
    const rows = await adminDb().$queryRaw<Array<{ id: string; filename: string; storagePath: string; mimeType: string; fileSize: number; alt: string | null; uploadedAt: Date; used: boolean }>>`
      SELECT m.id, m.filename, m."storagePath", m."mimeType", m."fileSize", m.alt, m."uploadedAt",
        (EXISTS(SELECT 1 FROM product_gallery_images pgi WHERE pgi."mediaId" = m.id)
          OR EXISTS(SELECT 1 FROM color_gallery_images cgi WHERE cgi."mediaId" = m.id)
          OR EXISTS(SELECT 1 FROM banners b WHERE b."imageMediaId" = m.id)
          OR EXISTS(SELECT 1 FROM brands b WHERE b."logoMediaId" = m.id)
          OR EXISTS(SELECT 1 FROM categories c WHERE c."imageMediaId" = m.id)
          OR EXISTS(SELECT 1 FROM services s WHERE s."imageMediaId" = m.id)
          OR EXISTS(SELECT 1 FROM users u WHERE u."avatarMediaId" = m.id)) AS used
      FROM media m ORDER BY m."uploadedAt" DESC
    `;
    return NextResponse.json({ data: rows.map((row) => ({ ...row, url: `/${row.storagePath}` })) });
  } catch (error) {
    const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 503;
    return NextResponse.json({ error: status === 401 ? "Требуется вход." : "Не удалось загрузить медиатеку." }, { status });
  }
}

export async function POST(request: Request) {
  let tempPath: string | undefined;
  let finalPath: string | undefined;
  try {
    const session = await requireGlobalAdminMutation(request);
    const absoluteMaxBytes = bannerVideoMaxBytes();
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > absoluteMaxBytes + 64 * 1024) return NextResponse.json({ error: "UPLOAD_TOO_LARGE" }, { status: 413 });
    const form = await request.formData();
    const file = form.get("file");
    const alt = form.get("alt");
    const purpose = form.get("purpose");
    if (purpose !== null && purpose !== "banner") return NextResponse.json({ error: "INVALID_UPLOAD_PURPOSE" }, { status: 400 });
    if (!(file instanceof File) || file.size < 1 || file.size > absoluteMaxBytes || (alt !== null && typeof alt !== "string")) return NextResponse.json({ error: "INVALID_UPLOAD" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const signature = detectUploadMedia(bytes);
    const extension = path.extname(file.name).toLowerCase();
    if (purpose === "banner" && signature?.mime === "image/avif") return NextResponse.json({ error: "BANNER_FORMAT_NOT_SUPPORTED" }, { status: 415 });
    if (signature?.kind === "video" && purpose !== "banner") return NextResponse.json({ error: "VIDEO_BANNER_ONLY" }, { status: 415 });
    const maxBytes = signature?.kind === "video" ? bannerVideoMaxBytes() : IMAGE_UPLOAD_MAX_BYTES;
    if (!signature || file.size > maxBytes || file.type !== signature.mime || !acceptedExtensions(signature).includes(extension)) return NextResponse.json({ error: "UNSUPPORTED_MEDIA" }, { status: 415 });
    const id = newId();
    const now = new Date();
    const storagePath = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.${signature.ext}`;
    finalPath = uploadFilePath(storagePath);
    await mkdir(uploadRoot(), { recursive: true });
    const rootReal = await realpath(uploadRoot());
    await mkdir(path.dirname(finalPath), { recursive: true });
    const directoryReal = await realpath(path.dirname(finalPath));
    if (!directoryReal.startsWith(rootReal + path.sep)) throw new Error("Upload path escapes root");
    tempPath = `${finalPath}.tmp`;
    await writeFile(tempPath, bytes, { flag: "wx", mode: 0o600 });
    await rename(tempPath, finalPath);
    const filename = path.basename(file.name).normalize("NFC").replace(new RegExp("[^\\p{L}\\p{N}._-]", "gu"), "_").slice(0, 180) || `${id}.${signature.ext}`;
    await adminDb().$executeRaw`
      INSERT INTO media (id, filename, "storagePath", "mimeType", "fileSize", alt, "uploadedByUserId")
      VALUES (${id}, ${filename}, ${storagePath}, ${signature.mime}, ${bytes.length}, ${typeof alt === "string" ? alt.slice(0, 500) : null}, ${session.userId})
    `;
    return NextResponse.json({ data: { id, filename, name: file.name, storagePath, url: `/${storagePath}`, alt: typeof alt === "string" ? alt : "", fileSize: bytes.length, mimeType: signature.mime, uploadedAt: now.toISOString(), used: false } }, { status: 201 });
  } catch (error) {
    if (tempPath) await rm(tempPath, { force: true }).catch(() => undefined);
    if (finalPath) await rm(finalPath, { force: true }).catch(() => undefined);
    const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : error instanceof Error && error.message === "CSRF_INVALID" ? 403 : 500;
    return NextResponse.json({ error: status === 401 ? "Требуется вход." : status === 403 ? "Проверка CSRF не пройдена." : "Не удалось сохранить файл." }, { status });
  }
}
