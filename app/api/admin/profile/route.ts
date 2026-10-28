import { NextResponse } from "next/server";
import { requireAdminMutation, requireAdminSession } from "@/lib/auth";
import { adminDb, newId, uploadFilePath, uploadRoot } from "@/lib/admin-db";
import { mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const imageTypes = [
  { mime: "image/jpeg", ext: "jpg", matches: (bytes: Buffer) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { mime: "image/png", ext: "png", matches: (bytes: Buffer) => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  { mime: "image/webp", ext: "webp", matches: (bytes: Buffer) => bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" },
];

function avatarUrl(storagePath: string | null) { return storagePath ? `/${storagePath}` : null; }

export async function GET() {
  try {
    const session = await requireAdminSession();
    const rows = await adminDb().$queryRaw<Array<{ email: string; name: string | null; firstName: string | null; lastName: string | null; avatarMediaId: string | null; avatarPath: string | null }>>`
      SELECT u.email,u.name,u."firstName",u."lastName",u."avatarMediaId",m."storagePath" AS "avatarPath"
      FROM users u LEFT JOIN media m ON m.id=u."avatarMediaId" AND m."mimeType" IN ('image/jpeg','image/png','image/webp') WHERE u.id=${session.userId} LIMIT 1
    `;
    if (!rows[0]) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    const cities = await adminDb().$queryRaw<Array<{ id: string; name: string }>>`
      SELECT c.id,c.name FROM user_city_access g JOIN cities c ON c.id=g."cityId" WHERE g."userId"=${session.userId} ORDER BY c.name
    `;
    const user = rows[0];
    return NextResponse.json({ data: { firstName: user.firstName, lastName: user.lastName, legacyName: user.name, email: user.email, role: session.role, cities, avatarMediaId: user.avatarMediaId, avatarUrl: avatarUrl(user.avatarPath) } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 503;
    return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : "PROFILE_UNAVAILABLE" }, { status });
  }
}

export async function PATCH(request: Request) {
  let tempPath: string | undefined;
  let finalPath: string | undefined;
  try {
    const session = await requireAdminMutation(request);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_AVATAR_BYTES + 64 * 1024) return NextResponse.json({ error: "AVATAR_TOO_LARGE" }, { status: 413 });
    const form = await request.formData();
    const allowedKeys = new Set(["firstName", "lastName", "avatar", "removeAvatar"]);
    let invalidField = false;
    form.forEach((_value, key) => {
      if (!allowedKeys.has(key)) invalidField = true;
    });
    if (invalidField) return NextResponse.json({ error: "INVALID_PROFILE_FIELDS" }, { status: 400 });

    const firstNamePresent = form.has("firstName");
    const lastNamePresent = form.has("lastName");
    const firstNameValue = form.get("firstName");
    const lastNameValue = form.get("lastName");
    if ((firstNamePresent && typeof firstNameValue !== "string") || (lastNamePresent && typeof lastNameValue !== "string")) {
      return NextResponse.json({ error: "INVALID_PROFILE_FIELDS" }, { status: 400 });
    }
    const firstName = typeof firstNameValue === "string" ? firstNameValue.trim() : undefined;
    const lastName = typeof lastNameValue === "string" ? lastNameValue.trim() : undefined;
    if ((firstName !== undefined && firstName.length > 100) || (lastName !== undefined && lastName.length > 100)) {
      return NextResponse.json({ error: "INVALID_PROFILE_FIELDS" }, { status: 400 });
    }

    const avatar = form.get("avatar");
    const removeAvatar = form.get("removeAvatar") === "true";
    if (removeAvatar && avatar instanceof File) return NextResponse.json({ error: "INVALID_PROFILE_FIELDS" }, { status: 400 });
    if (avatar !== null && (!(avatar instanceof File) || avatar.size < 1 || avatar.size > MAX_AVATAR_BYTES)) {
      return NextResponse.json({ error: avatar instanceof File && avatar.size > MAX_AVATAR_BYTES ? "AVATAR_TOO_LARGE" : "INVALID_AVATAR" }, { status: avatar instanceof File && avatar.size > MAX_AVATAR_BYTES ? 413 : 400 });
    }

    let newMedia: { id: string; storagePath: string; mime: string; bytes: Buffer; filename: string } | null = null;
    if (avatar instanceof File) {
      const bytes = Buffer.from(await avatar.arrayBuffer());
      const image = imageTypes.find((item) => item.mime === avatar.type && item.matches(bytes));
      const extension = path.extname(avatar.name).toLowerCase();
      if (!image || extension !== `.${image.ext}` && !(image.ext === "jpg" && extension === ".jpeg")) {
        return NextResponse.json({ error: "INVALID_AVATAR" }, { status: 415 });
      }
      const id = newId();
      const now = new Date();
      const storagePath = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.${image.ext}`;
      finalPath = uploadFilePath(storagePath);
      await mkdir(uploadRoot(), { recursive: true });
      const rootReal = await realpath(uploadRoot());
      await mkdir(path.dirname(finalPath), { recursive: true });
      const directoryReal = await realpath(path.dirname(finalPath));
      if (!directoryReal.startsWith(rootReal + path.sep)) throw new Error("Upload path escapes root");
      tempPath = `${finalPath}.tmp`;
      await writeFile(tempPath, bytes, { flag: "wx", mode: 0o600 });
      await rename(tempPath, finalPath);
      tempPath = undefined;
      newMedia = { id, storagePath, mime: image.mime, bytes, filename: `${id}.${image.ext}` };
    }

    const client = adminDb();
    const saved = await client.$transaction(async (tx) => {
      if (newMedia) {
        await tx.$executeRaw`
          INSERT INTO media (id,filename,"storagePath","mimeType","fileSize",alt,"uploadedByUserId")
          VALUES (${newMedia.id},${newMedia.filename},${newMedia.storagePath},${newMedia.mime},${newMedia.bytes.length},'Аватар сотрудника',${session.userId})
        `;
      }
      await tx.$executeRaw`
        UPDATE users SET
          "firstName"=CASE WHEN ${firstNamePresent} THEN ${firstName ?? null} ELSE "firstName" END,
          "lastName"=CASE WHEN ${lastNamePresent} THEN ${lastName ?? null} ELSE "lastName" END,
          "avatarMediaId"=CASE WHEN ${newMedia !== null} THEN ${newMedia?.id ?? null} WHEN ${removeAvatar} THEN NULL ELSE "avatarMediaId" END,
          "updatedAt"=NOW()
        WHERE id=${session.userId}
      `;
      const rows = await tx.$queryRaw<Array<{ firstName: string | null; lastName: string | null; avatarMediaId: string | null; avatarPath: string | null }>>`
        SELECT u."firstName",u."lastName",u."avatarMediaId",m."storagePath" AS "avatarPath"
        FROM users u LEFT JOIN media m ON m.id=u."avatarMediaId" AND m."mimeType" IN ('image/jpeg','image/png','image/webp') WHERE u.id=${session.userId} LIMIT 1
      `;
      if (!rows[0]) throw new Error("PROFILE_NOT_FOUND");
      return rows[0];
    });
    return NextResponse.json({ data: { ...saved, avatarUrl: avatarUrl(saved.avatarPath) } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (tempPath) await rm(tempPath, { force: true }).catch(() => undefined);
    if (finalPath) await rm(finalPath, { force: true }).catch(() => undefined);
    const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401
      : error instanceof Error && ["CSRF_INVALID", "FORBIDDEN"].includes(error.message) ? 403
      : error instanceof Error && error.message === "PROFILE_NOT_FOUND" ? 404 : 503;
    return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : status === 404 ? "PROFILE_NOT_FOUND" : "PROFILE_SAVE_FAILED" }, { status });
  }
}
