import { NextResponse } from "next/server";
import { requireGlobalAdminMutation } from "@/lib/auth";
import { adminDb, uploadFilePath } from "@/lib/admin-db";
import { rm } from "node:fs/promises";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireGlobalAdminMutation(request);
    const result = await adminDb().$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string; storagePath: string }>>`
        DELETE FROM media m WHERE m.id = ${params.id}
          AND NOT EXISTS (SELECT 1 FROM product_gallery_images p WHERE p."mediaId" = m.id)
          AND NOT EXISTS (SELECT 1 FROM color_gallery_images c WHERE c."mediaId" = m.id)
          AND NOT EXISTS (SELECT 1 FROM banners b WHERE b."imageMediaId" = m.id)
          AND NOT EXISTS (SELECT 1 FROM brands b WHERE b."logoMediaId" = m.id)
          AND NOT EXISTS (SELECT 1 FROM categories c WHERE c."imageMediaId" = m.id)
          AND NOT EXISTS (SELECT 1 FROM services s WHERE s."imageMediaId" = m.id)
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u."avatarMediaId" = m.id)
        RETURNING m.id, m."storagePath"
      `;
      if (rows[0]) return { removed: rows[0], exists: true };
      const exists = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM media WHERE id = ${params.id} LIMIT 1`;
      return { removed: null, exists: exists.length > 0 };
    });
    if (!result.removed) return NextResponse.json({ error: result.exists ? "MEDIA_IN_USE" : "MEDIA_NOT_FOUND" }, { status: 409 });
    await rm(uploadFilePath(result.removed.storagePath), { force: true });
    return NextResponse.json({ ok: true });
  } catch (error) { const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : error instanceof Error && error.message === "CSRF_INVALID" ? 403 : 500; return NextResponse.json({ error: status === 401 ? "Требуется вход." : status === 403 ? "Проверка CSRF не пройдена." : "Не удалось удалить файл." }, { status }); }
}
