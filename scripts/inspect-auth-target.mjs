import { PrismaClient } from "@prisma/client";

const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("TEST_DATABASE_URL_MISSING");
const url = new URL(raw);
if (url.protocol !== "postgresql:" || !["127.0.0.1", "localhost", "::1"].includes(url.hostname) || url.port !== "55432" || decodeURIComponent(url.pathname.slice(1)) !== "icenter_test" || decodeURIComponent(url.username) !== "icenter_test") throw new Error("TEST_DATABASE_URL_IDENTITY_MISMATCH");

const db = new PrismaClient({ log: [] });
try {
  const [identity] = await db.$queryRawUnsafe(`SELECT current_database() AS db,current_user AS usr,inet_server_port() AS port,version() AS version`);
  if (identity.db !== "icenter_test" || identity.usr !== "icenter_test" || Number(identity.port) !== 5432 || !String(identity.version).includes("PostgreSQL 16")) throw new Error("TEST_DATABASE_IDENTITY_MISMATCH");
  const users = await db.$queryRawUnsafe(`SELECT u.id,u.email,u.name,u.role::text AS role,u."isActive" AS active,COALESCE(json_agg(c.slug ORDER BY c.slug) FILTER (WHERE c.id IS NOT NULL),'[]'::json) AS cities FROM users u LEFT JOIN user_city_access g ON g."userId"=u.id LEFT JOIN cities c ON c.id=g."cityId" GROUP BY u.id ORDER BY u.role,u.email`);
  const duplicates = await db.$queryRawUnsafe(`SELECT LOWER(email) AS email,count(*)::int AS count FROM users GROUP BY LOWER(email) HAVING count(*)>1`);
  console.log(JSON.stringify({ identity: { database: identity.db, user: identity.usr, postgresMajor: 16 }, users, caseInsensitiveEmailDuplicates: duplicates }));
} finally { await db.$disconnect(); }
