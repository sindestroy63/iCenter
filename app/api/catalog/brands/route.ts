import { NextResponse } from "next/server";
import { apiError, imageUrl, readOnly } from "@/lib/catalog-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await readOnly((tx) => tx.$queryRaw<Array<{ id: string; name: string; slug: string; description: string | null; logoPath: string | null; logoMimeType: string | null; order: number }>>`
      SELECT b.id, b.name, b.slug, b.description, m."storagePath" AS "logoPath", m."mimeType" AS "logoMimeType", b."sortOrder" AS "order"
      FROM brands b
      LEFT JOIN media m ON m.id = b."logoMediaId"
      WHERE b."isActive" = TRUE
      ORDER BY b."sortOrder", b.name
    `);
    const data = rows.map(({ logoPath, logoMimeType, ...brand }) => ({ ...brand, logoUrl: imageUrl(logoPath, logoMimeType) }));
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error);
  }
}
