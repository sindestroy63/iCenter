import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ log: [] });
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null }, { status: 401, headers: { "cache-control": "no-store" } });
  const cities = session.role === "CITY_MANAGER"
    ? await prisma.$queryRaw<Array<{ slug: string; name: string }>>`
        SELECT c.slug,c.name FROM user_city_access g JOIN cities c ON c.id=g."cityId" WHERE g."userId"=${session.userId} AND c."isActive"=TRUE ORDER BY c.name
      `
    : await prisma.$queryRaw<Array<{ slug: string; name: string }>>`
        SELECT slug,name FROM cities WHERE "isActive"=TRUE ORDER BY "sortOrder",name
      `;
  const avatar = session.avatarMediaId ? await prisma.$queryRaw<Array<{ storagePath: string }>>`
    SELECT "storagePath" FROM media WHERE id=${session.avatarMediaId} AND "mimeType" IN ('image/jpeg','image/png','image/webp') LIMIT 1
  ` : [];
  return NextResponse.json({ user: { id: session.userId, email: session.email, name: session.name, firstName: session.firstName, lastName: session.lastName, avatarMediaId: session.avatarMediaId, avatarUrl: avatar[0] ? `/${avatar[0].storagePath}` : null, role: session.role, mustChangePassword: session.mustChangePassword, cities } }, { headers: { "cache-control": "no-store" } });
}
