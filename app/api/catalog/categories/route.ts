import { NextResponse } from "next/server";
import { apiError, imageUrl, readOnly } from "@/lib/catalog-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await readOnly((tx) => tx.$queryRaw<Array<{ id: string; name: string; slug: string; parentId: string | null; order: number; imagePath: string | null; imageMimeType: string | null }>>`
      SELECT c.id, c.name, c.slug, c."parentId", c."sortOrder" AS "order", m."storagePath" AS "imagePath", m."mimeType" AS "imageMimeType"
      FROM categories c
      LEFT JOIN media m ON m.id = c."imageMediaId"
      WHERE c."isActive" = TRUE
        AND (c."parentId" IS NULL OR EXISTS (
          SELECT 1 FROM categories parent
          WHERE parent.id = c."parentId" AND parent."isActive" = TRUE
        ))
      ORDER BY c."sortOrder", c.name
    `);
    const data = rows.map(({ imagePath, imageMimeType, ...category }) => ({ ...category, imageUrl: imageUrl(imagePath, imageMimeType) }));
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error);
  }
}
