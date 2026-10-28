import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
process.env.NODE_ENV ??= "test";
loadEnvConfig(process.cwd(), false);

const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("TEST_DATABASE_URL_MISSING");
const target = new URL(raw);
if (target.protocol !== "postgresql:" || !["127.0.0.1", "localhost", "::1"].includes(target.hostname) || target.port !== "55432" || decodeURIComponent(target.pathname.slice(1)) !== "icenter_test" || decodeURIComponent(target.username) !== "icenter_test") {
  throw new Error("TEST_DATABASE_IDENTITY_MISMATCH");
}

const base = path.resolve(".tmp", "test-admin-credentials");
const credentialPath = path.join(base, "credentials.json");
const stagedCredentialPath = `${credentialPath}.${process.pid}.tmp`;
await mkdir(base, { recursive: true });
const account = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
const restrictAcl = (filePath, directory = false) => {
  const scope = directory ? "(OI)(CI)F" : "F";
  execFileSync("icacls", [filePath, "/inheritance:r", "/grant:r", `${account}:${scope}`, `SYSTEM:${scope}`], { stdio: "ignore" });
};
restrictAcl(base, true);

const db = new PrismaClient({ log: [] });
const credentials = new Map();
try {
  try {
    const saved = JSON.parse(await readFile(credentialPath, "utf8"));
    for (const item of saved.accounts ?? []) credentials.set(item.email, item);
  } catch { /* First provisioning run. */ }

  const [identity] = await db.$queryRaw`SELECT current_database() AS db,current_user AS usr,inet_server_port() AS port,version() AS version`;
  if (identity.db !== "icenter_test" || identity.usr !== "icenter_test" || Number(identity.port) !== 5432 || !String(identity.version).includes("PostgreSQL 16")) throw new Error("CONNECTED_DATABASE_IDENTITY_MISMATCH");
  const columns = await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='mustChangePassword'`;
  if (!columns.length) throw new Error("AUTH_SCHEMA_PATCH_REQUIRED");
  const cities = await db.$queryRaw`SELECT id,slug FROM cities WHERE "isActive"=TRUE AND slug=ANY(ARRAY['samara','moscow','saint-petersburg','orenburg'])`;
  const cityBySlug = new Map(cities.map((city) => [city.slug, city.id]));
  const citySlugs = ["samara", "moscow", "saint-petersburg", "orenburg"];
  if (citySlugs.some((slug) => !cityBySlug.has(slug))) throw new Error("REQUIRED_TEST_CITY_MISSING");

  const users = await db.$queryRaw`SELECT id,email,role::text AS role,"isActive" AS active FROM users ORDER BY email`;
  const byEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  const required = [
    ["owner@icenter.com", "OWNER"],
    ["admin@icenter.ru", "ADMIN"],
    ["dev@test.com", "DEVELOPER"],
    ["manager@test.com", "CITY_MANAGER"],
  ];
  for (const [email, role] of required) {
    const user = byEmail.get(email);
    if (!user || user.role !== role || !user.active) throw new Error(`EXPECTED_TEST_USER_MISSING:${email}`);
  }

  const managerSpecs = [
    ["manager@test.com", "Test manager - Samara", "samara"],
    ["manager-moscow@test.icenter.invalid", "Test manager - Moscow", "moscow"],
    ["manager-spb@test.icenter.invalid", "Test manager - Saint Petersburg", "saint-petersburg"],
    ["manager-orenburg@test.icenter.invalid", "Test manager - Orenburg", "orenburg"],
  ];
  const globalSpecs = [
    ["admin@icenter.ru", "ADMIN"],
    ["dev@test.com", "DEVELOPER"],
  ];
  const globalPlan = [];
  for (const [email, role] of globalSpecs) {
    const user = byEmail.get(email);
    const priorCredential = credentials.get(email);
    const password = priorCredential?.password ?? randomBytes(24).toString("base64url");
    const provisioningState = priorCredential?.provisioningState ?? "pending";
    globalPlan.push({ id: user.id, email, role, password, hash: await argon2.hash(password, { type: argon2.argon2id }), resetPassword: provisioningState !== "complete" });
    credentials.set(email, { email, password, role, provisioningState, note: "Isolated test account. Temporary password is required to change at first login." });
  }
  const plan = [];
  for (const [email, name, city] of managerSpecs) {
    const existing = byEmail.get(email);
    if (existing && existing.role !== "CITY_MANAGER") throw new Error(`TEST_EMAIL_ROLE_CONFLICT:${email}`);
    const priorCredential = credentials.get(email);
    const password = priorCredential?.password ?? randomBytes(24).toString("base64url");
    const id = existing?.id ?? `c${randomBytes(12).toString("hex")}`;
    const provisioningState = priorCredential?.provisioningState ?? "pending";
    plan.push({ id, email, name, city, password, hash: await argon2.hash(password, { type: argon2.argon2id }), isNew: !existing, resetPassword: !existing || provisioningState !== "complete" });
    credentials.set(email, { email, password, city, provisioningState, note: "Test-only service address; not a real employee email. Temporary password is required to change at first login." });
  }

  const credentialDocument = `${JSON.stringify({ generatedAt: new Date().toISOString(), accounts: [...credentials.values()] }, null, 2)}\n`;
  await writeFile(stagedCredentialPath, credentialDocument, { flag: "w", mode: 0o600 });
  restrictAcl(stagedCredentialPath);
  await rename(stagedCredentialPath, credentialPath);

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('icenter-test-account-provisioning',0))`;
    const duplicateEmails = await tx.$queryRaw`SELECT lower(email) AS email,count(*)::int AS count FROM users GROUP BY lower(email) HAVING count(*)>1`;
    if (duplicateEmails.length) throw new Error("CASE_INSENSITIVE_EMAIL_DUPLICATE_EXISTS");
    const [owner] = await tx.$queryRaw`SELECT id FROM users WHERE lower(email)='owner@icenter.com' AND role='OWNER'::"UserRole" AND "isActive"=TRUE FOR UPDATE`;
    if (!owner) throw new Error("ACTIVE_OWNER_REQUIRED");

    for (const user of globalPlan) {
      if (user.resetPassword) {
        await tx.$executeRaw`UPDATE users SET "passwordHash"=${user.hash},"mustChangePassword"=TRUE,"isActive"=TRUE,"updatedAt"=NOW() WHERE id=${user.id} AND role=${user.role}::"UserRole"`;
        await tx.$executeRaw`UPDATE sessions SET "revokedAt"=NOW() WHERE "userId"=${user.id} AND "revokedAt" IS NULL`;
      }
      await tx.$executeRaw`DELETE FROM user_city_access WHERE "userId"=${user.id}`;
    }

    for (const user of plan) {
      if (user.isNew) {
        await tx.$executeRaw`INSERT INTO users (id,email,"passwordHash",role,name,"isActive","mustChangePassword","createdAt","updatedAt") VALUES (${user.id},${user.email},${user.hash},'CITY_MANAGER'::"UserRole",${user.name},TRUE,TRUE,NOW(),NOW())`;
      } else if (user.resetPassword) {
        await tx.$executeRaw`UPDATE users SET "passwordHash"=${user.hash},name=${user.name},"isActive"=TRUE,"mustChangePassword"=TRUE,"updatedAt"=NOW() WHERE id=${user.id} AND role='CITY_MANAGER'::"UserRole"`;
      } else {
        await tx.$executeRaw`UPDATE users SET name=${user.name},"isActive"=TRUE,"updatedAt"=NOW() WHERE id=${user.id} AND role='CITY_MANAGER'::"UserRole"`;
      }
      await tx.$executeRaw`DELETE FROM user_city_access WHERE "userId"=${user.id}`;
      await tx.$executeRaw`INSERT INTO user_city_access (id,"userId","cityId","canManagePrices","canManageStock","createdAt") VALUES (${`c${randomBytes(12).toString("hex")}`},${user.id},${cityBySlug.get(user.city)},TRUE,TRUE,NOW())`;
      await tx.$executeRaw`UPDATE sessions SET "revokedAt"=NOW() WHERE "userId"=${user.id} AND "revokedAt" IS NULL`;
    }

    const targetIds = [owner.id, ...required.slice(1, 3).map(([email]) => byEmail.get(email).id), ...plan.map(({ id }) => id)];
    const extras = await tx.$queryRaw`SELECT id FROM users WHERE "isActive"=TRUE AND NOT (id=ANY(${targetIds}::text[])) FOR UPDATE`;
    for (const row of extras) {
      await tx.$executeRaw`UPDATE users SET "isActive"=FALSE,"updatedAt"=NOW() WHERE id=${row.id}`;
      await tx.$executeRaw`UPDATE sessions SET "revokedAt"=NOW() WHERE "userId"=${row.id} AND "revokedAt" IS NULL`;
    }
  });

  for (const [email, credential] of credentials) {
    if (globalSpecs.some(([globalEmail]) => globalEmail === email) || managerSpecs.some(([managerEmail]) => managerEmail === email)) credentials.set(email, { ...credential, provisioningState: "complete" });
  }
  for (const [email, credential] of credentials) {
    if (managerSpecs.some(([managerEmail]) => managerEmail === email)) credentials.set(email, { ...credential, provisioningState: "complete" });
  }
  await writeFile(stagedCredentialPath, `${JSON.stringify({ accounts: [...credentials.values()] }, null, 2)}\n`, { flag: "w", mode: 0o600 });
  restrictAcl(stagedCredentialPath);
  await rename(stagedCredentialPath, credentialPath);

  const result = await db.$queryRaw`SELECT u.email,u.role::text AS role,u."isActive" AS active,COALESCE(array_agg(c.slug ORDER BY c.slug) FILTER (WHERE c.id IS NOT NULL),'{}') AS cities FROM users u LEFT JOIN user_city_access g ON g."userId"=u.id LEFT JOIN cities c ON c.id=g."cityId" GROUP BY u.id ORDER BY u.role,u.email`;
  const active = result.filter((row) => row.active);
  if (active.length !== 7 || active.filter((row) => row.role === "CITY_MANAGER").length !== 4 || active.filter((row) => row.role === "OWNER").length !== 1 || active.filter((row) => row.role === "ADMIN").length !== 1 || active.filter((row) => row.role === "DEVELOPER").length !== 1) throw new Error("TARGET_ACCOUNT_STRUCTURE_NOT_REACHED");
  const expectedCityByEmail = new Map(plan.map(({ email, city }) => [email, city]));
  for (const row of active) {
    if (row.role === "CITY_MANAGER" && (row.cities.length !== 1 || row.cities[0] !== expectedCityByEmail.get(row.email))) throw new Error("CITY_MANAGER_GRANT_MISMATCH");
    if (row.role !== "CITY_MANAGER" && row.cities.length) throw new Error("GLOBAL_ROLE_HAS_CITY_GRANT");
  }
  process.stdout.write(`${JSON.stringify({ database: identity.db, activeUsers: active.map(({ email, role, cities }) => ({ email, role, cities })), generatedCredentialFile: credentialPath })}\n`);
} finally {
  await db.$disconnect();
}
