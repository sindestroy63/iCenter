import { PrismaClient } from "@prisma/client";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL_MISSING");
const target = new URL(connectionString);
const databaseName = decodeURIComponent(target.pathname.slice(1));
const username = decodeURIComponent(target.username);
if (target.protocol !== "postgresql:" || !["127.0.0.1", "localhost", "::1"].includes(target.hostname) || target.port !== "55432" || databaseName !== "icenter_test" || username !== "icenter_test") {
  throw new Error("TEST_DATABASE_URL_IDENTITY_MISMATCH");
}
const db = new PrismaClient();
try {
  const identity = await db.$queryRawUnsafe("SELECT current_database() AS db,current_user AS usr,inet_server_addr()::text AS host,inet_server_port() AS port,version() AS version");
  const i = identity[0];
  if (i.db !== "icenter_test" || i.usr !== "icenter_test" || Number(i.port) !== 5432 || !String(i.version).includes("PostgreSQL 16")) throw new Error("TEST_DATABASE_IDENTITY_MISMATCH");
  const columns = await db.$queryRawUnsafe("SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('users','sessions','user_city_access','cities','employees') ORDER BY table_name,ordinal_position");
  const roles = await db.$queryRawUnsafe("SELECT role::text AS role,\"isActive\" AS active,count(*)::int AS count FROM users GROUP BY role,\"isActive\" ORDER BY role,\"isActive\"");
  const cities = await db.$queryRawUnsafe("SELECT id,slug,name FROM cities ORDER BY name");
  console.log(JSON.stringify({ identity: { db: i.db, user: i.usr, postgresMajor: 16 }, columns, roles, cities }));
} finally { await db.$disconnect(); }
