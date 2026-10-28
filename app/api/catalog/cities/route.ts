import { NextResponse } from "next/server";
import { apiError, readOnly } from "@/lib/catalog-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cities = await readOnly((tx) => tx.$queryRaw<Array<{ id: string; name: string; slug: string; address: string | null; phone: string | null; workingHours: string | null; timezone: string | null; socialLinks: unknown }>>`
      SELECT id, name, slug, address, phone, "workingHours", timezone, "socialLinks" AS "socialLinks"
      FROM cities
      WHERE "isActive" = TRUE
        AND slug IN ('samara', 'moscow', 'saint-petersburg', 'orenburg')
      ORDER BY "sortOrder", name
    `);
    return NextResponse.json({ data: cities });
  } catch (error) {
    return apiError(error);
  }
}
