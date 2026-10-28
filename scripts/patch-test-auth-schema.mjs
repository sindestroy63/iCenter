import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";

const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
process.env.NODE_ENV ??= "test";
loadEnvConfig(process.cwd(), false);
const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("TEST_DATABASE_URL_MISSING");
const target = new URL(raw);
if (target.protocol !== "postgresql:" || !["127.0.0.1", "localhost", "::1"].includes(target.hostname) || target.port !== "55432" || decodeURIComponent(target.pathname.slice(1)) !== "icenter_test" || decodeURIComponent(target.username) !== "icenter_test") throw new Error("TEST_DATABASE_IDENTITY_MISMATCH");

const db = new PrismaClient({ log: [] });
try {
  const [identity] = await db.$queryRaw`SELECT current_database() AS db,current_user AS usr,inet_server_port() AS port,version() AS version`;
  if (identity.db !== "icenter_test" || identity.usr !== "icenter_test" || Number(identity.port) !== 5432 || !String(identity.version).includes("PostgreSQL 16")) throw new Error("CONNECTED_DATABASE_IDENTITY_MISMATCH");
  const duplicateEmails = await db.$queryRaw`SELECT lower(email) AS email,count(*)::int AS count FROM users GROUP BY lower(email) HAVING count(*)>1`;
  if (duplicateEmails.length) throw new Error("CASE_INSENSITIVE_EMAIL_DUPLICATE_EXISTS");
  await db.$executeRawUnsafe('ALTER TABLE users ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT FALSE');
  await db.$executeRawUnsafe("CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx ON users (LOWER(email))");
  const columns = await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='mustChangePassword'`;
  const indexes = await db.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname='users_email_lower_uidx'`;
  if (!columns.length || !indexes.length) throw new Error("TEST_AUTH_SCHEMA_PATCH_VERIFICATION_FAILED");
  process.stdout.write(JSON.stringify({ database: identity.db, user: identity.usr, postgresMajor: 16, mustChangePassword: true, caseInsensitiveEmailUnique: true }) + "\n");
} finally {
  await db.$disconnect();
}
