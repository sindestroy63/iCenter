import "server-only";

import { createHash } from "node:crypto";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { uploadFilePath } from "@/lib/admin-db";
import { acceptedExtensions, detectUploadMedia, IMAGE_UPLOAD_MAX_BYTES } from "@/lib/media-upload";

export const LEAD_PHOTO_LIMIT = 5;

async function removeFiles(files: string[]) {
  await Promise.all(files.map((file) => unlink(file).catch(() => undefined)));
}

export async function saveLeadPhotos(files: File[], idempotencyKey: string) {
  if (files.length > LEAD_PHOTO_LIMIT) throw new Error("INVALID_UPLOAD");
  const urls: string[] = [];
  const createdFiles: string[] = [];
  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      if (file.size < 1 || file.size > IMAGE_UPLOAD_MAX_BYTES) throw new Error("INVALID_UPLOAD");
      const bytes = Buffer.from(await file.arrayBuffer());
      const media = detectUploadMedia(bytes);
      const extension = path.extname(file.name).toLowerCase();
      if (!media || media.kind !== "image" || file.type !== media.mime || !acceptedExtensions(media).includes(extension)) throw new Error("INVALID_UPLOAD");
      const digest = createHash("sha256").update(idempotencyKey).update(String(index)).update(bytes).digest("hex").slice(0, 32);
      const now = new Date();
      const storagePath = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/lead-${digest}.${media.ext}`;
      const target = uploadFilePath(storagePath);
      await mkdir(path.dirname(target), { recursive: true });
      try { await access(target); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        try { await writeFile(target, bytes, { flag: "wx", mode: 0o600 }); createdFiles.push(target); }
        catch (writeError) { if ((writeError as NodeJS.ErrnoException).code !== "EEXIST") throw writeError; }
      }
      urls.push(`/${storagePath}`);
    }
    return { urls, createdFiles };
  } catch (error) {
    await removeFiles(createdFiles);
    throw error;
  }
}

export async function removeCreatedLeadPhotos(files: string[]) { await removeFiles(files); }

export async function removeLeadPhotoUrls(urls: readonly string[]) {
  const paths = urls.filter((url) => /^\/uploads\/\d{4}\/\d{2}\/lead-[a-f0-9]{32}\.(?:jpg|png|webp|avif)$/.test(url));
  const results = await Promise.all(paths.map(async (url) => {
    try { await unlink(uploadFilePath(url.slice(1))); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
  }));
  return { removed: results.filter(Boolean).length, failed: results.filter((removed) => !removed).length };
}
