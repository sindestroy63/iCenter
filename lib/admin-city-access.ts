import "server-only";

import type { Prisma } from "@prisma/client";
import { evaluateCityAccess } from "@/lib/city-access-policy";

export async function getCityAccess(tx: Prisma.TransactionClient, userId: string, cityId: string) {
  const users = await tx.$queryRaw<any[]>`
    SELECT role::text AS role,"isActive",
      COALESCE((to_jsonb(users)->>'allCities')::boolean,FALSE) AS "allCities",
      COALESCE((to_jsonb(users)->>'allCitiesCanManagePrices')::boolean,FALSE) AS "allCitiesCanManagePrices",
      COALESCE((to_jsonb(users)->>'allCitiesCanManageStock')::boolean,FALSE) AS "allCitiesCanManageStock"
    FROM users WHERE id=${userId} FOR UPDATE
  `;
  const user = users[0];
  if (!user) return { allowed: false, canManagePrices: false, canManageStock: false };
  const cities = await tx.$queryRaw<any[]>`SELECT id FROM cities WHERE id=${cityId} AND "isActive"=TRUE LIMIT 1`;
  if (!cities.length) return { allowed: false, canManagePrices: false, canManageStock: false };
  const grants = await tx.$queryRaw<any[]>`SELECT "canManagePrices" AS "grantCanManagePrices","canManageStock" AS "grantCanManageStock" FROM user_city_access WHERE "userId"=${userId} AND "cityId"=${cityId} FOR UPDATE`;
  return evaluateCityAccess({
    ...user,
    hasCityGrant: grants.length > 0,
    grantCanManagePrices: grants[0]?.grantCanManagePrices,
    grantCanManageStock: grants[0]?.grantCanManageStock,
  });
}
