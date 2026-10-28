import "server-only";

import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { sameOrigin } from "@/lib/same-origin";

export { sameOrigin };

declare global { var authPrisma: PrismaClient | undefined; }

const SESSION_TTL_SECONDS = 60 * 60 * 8;
const SESSION_COOKIE = "icenter_session";
const CSRF_COOKIE = "icenter_csrf";
// All administrative roles may authenticate; route-level checks decide what
// each role can read or mutate.
const allowedRoles = new Set(["OWNER", "ADMIN", "DEVELOPER", "CITY_MANAGER"]);

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  globalThis.authPrisma ??= new PrismaClient({ log: [] });
  return globalThis.authPrisma;
}

function token(bytes = 32) { return randomBytes(bytes).toString("base64url"); }
function recordId() { return `c${randomBytes(16).toString("hex").slice(0, 24)}`; }

export function authCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

export function csrfCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return { httpOnly: false, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

export async function authenticate(email: string, password: string, request: Request) {
  const normalized = email.trim().toLowerCase();
  const client = db();
  const rows = await client.$queryRaw<Array<{ id: string; email: string; passwordHash: string; role: string; name: string | null; firstName: string | null; lastName: string | null; avatarMediaId: string | null; isActive: boolean; mustChangePassword: boolean }>>`
    SELECT id, email, "passwordHash", role::text AS role, name,
      to_jsonb(users)->>'firstName' AS "firstName", to_jsonb(users)->>'lastName' AS "lastName", to_jsonb(users)->>'avatarMediaId' AS "avatarMediaId", "isActive",
      COALESCE((to_jsonb(users)->>'mustChangePassword')::boolean, FALSE) AS "mustChangePassword"
    FROM users WHERE lower(email) = ${normalized} LIMIT 1
  `;
  const user = rows[0];
  if (!user || !user.isActive || !allowedRoles.has(user.role)) return null;
  const valid = await argon2.verify(user.passwordHash, password).catch(() => false);
  if (!valid) return null;
  const sessionToken = token(48);
  const csrfToken = token(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const h = await headers();
  const forwardedIp = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ipAddress = isIP(forwardedIp) ? forwardedIp : null;
  await client.$executeRaw`
    INSERT INTO sessions (id, "userId", token, "ipAddress", "userAgent", "csrfToken", "expiresAt", "createdAt", "lastActivityAt", "tokenFamily")
    VALUES (${recordId()}, ${user.id}, ${sessionToken}, ${ipAddress}::inet, ${h.get("user-agent") ?? request.headers.get("user-agent") ?? null}, ${csrfToken}, ${expiresAt}, NOW(), NOW(), ${recordId()})
  `;
  return { user: { id: user.id, email: user.email, name: user.name, firstName: user.firstName, lastName: user.lastName, avatarMediaId: user.avatarMediaId, role: user.role, mustChangePassword: user.mustChangePassword }, sessionToken, csrfToken, expiresAt };
}

export async function getSession() {
  const tokenValue = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!tokenValue) return null;
  const client = db();
  const rows = await client.$queryRaw<Array<{ sessionId: string; csrfToken: string; userId: string; email: string; name: string | null; firstName: string | null; lastName: string | null; avatarMediaId: string | null; role: string; isActive: boolean; mustChangePassword: boolean }>>`
    SELECT s.id AS "sessionId", s."csrfToken", u.id AS "userId", u.email, u.name,
      to_jsonb(u)->>'firstName' AS "firstName", to_jsonb(u)->>'lastName' AS "lastName", to_jsonb(u)->>'avatarMediaId' AS "avatarMediaId", u.role::text AS role, u."isActive",
      COALESCE((to_jsonb(u)->>'mustChangePassword')::boolean, FALSE) AS "mustChangePassword"
    FROM sessions s JOIN users u ON u.id = s."userId"
    WHERE s.token = ${tokenValue} AND s."revokedAt" IS NULL AND s."expiresAt" > NOW()
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || !row.isActive || !allowedRoles.has(row.role)) return null;
  return { ...row, token: tokenValue };
}

export async function requireAdminSession() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  if (session.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  return session;
}

export async function requireAdminMutation(request: Request) {
  const session = await requireAdminSession();
  if (!sameOrigin(request) || !csrfMatches(request, session.csrfToken)) throw new Error("CSRF_INVALID");
  return session;
}

export async function requireGlobalAdminSession() {
  const session = await requireAdminSession();
  if (session.role === "CITY_MANAGER") throw new Error("FORBIDDEN");
  return session;
}

export async function requireGlobalAdminMutation(request: Request) {
  const session = await requireAdminMutation(request);
  if (session.role === "CITY_MANAGER") throw new Error("FORBIDDEN");
  return session;
}

const dictionaryRoles = new Set(["OWNER", "ADMIN", "DEVELOPER", "CITY_MANAGER"]);
const dictionaryWriteRoles = new Set(["OWNER", "ADMIN", "DEVELOPER"]);

// Dictionary permissions are route-scoped; the general admin role policy stays unchanged.
export async function getDictionarySession() {
  const tokenValue = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!tokenValue) return null;
  const rows = await db().$queryRaw<Array<{ sessionId: string; csrfToken: string; userId: string; email: string; name: string | null; role: string; isActive: boolean; mustChangePassword: boolean }>>`
    SELECT s.id AS "sessionId", s."csrfToken", u.id AS "userId", u.email, u.name, u.role::text AS role, u."isActive",
      COALESCE((to_jsonb(u)->>'mustChangePassword')::boolean, FALSE) AS "mustChangePassword"
    FROM sessions s JOIN users u ON u.id = s."userId"
    WHERE s.token = ${tokenValue} AND s."revokedAt" IS NULL AND s."expiresAt" > NOW()
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || !row.isActive || !dictionaryRoles.has(row.role)) return null;
  return { ...row, token: tokenValue };
}

export async function requireDictionarySession() {
  const session = await getDictionarySession();
  if (!session) throw new Error("UNAUTHORIZED");
  if (session.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  return session;
}

export async function requireRequestSession() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  if (session.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  return session;
}

export async function changeOwnPassword(request: Request, currentPassword: string, newPassword: string) {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  if (!sameOrigin(request) || !csrfMatches(request, session.csrfToken)) throw new Error("CSRF_INVALID");
  if (newPassword.length < 14 || newPassword.length > 256) throw new Error("INVALID_PASSWORD");
  const client = db();
  const rows = await client.$queryRaw<Array<{ passwordHash: string }>>`SELECT "passwordHash" FROM users WHERE id=${session.userId} AND "isActive"=TRUE LIMIT 1`;
  if (!rows[0] || !(await argon2.verify(rows[0].passwordHash, currentPassword).catch(() => false))) throw new Error("INVALID_CURRENT_PASSWORD");
  const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
  await client.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE users SET "passwordHash"=${passwordHash}, "mustChangePassword"=FALSE, "updatedAt"=NOW() WHERE id=${session.userId}`;
    await tx.$executeRaw`UPDATE sessions SET "revokedAt"=NOW() WHERE "userId"=${session.userId} AND id<>${session.sessionId} AND "revokedAt" IS NULL`;
  });
  return session;
}

export function authErrorStatus(error: unknown) {
  if (!(error instanceof Error)) return 500;
  if (error.message === "UNAUTHORIZED") return 401;
  if (["FORBIDDEN", "CSRF_INVALID"].includes(error.message)) return 403;
  if (error.message === "NOT_FOUND") return 404;
  if (["EMAIL_EXISTS", "LAST_ACTIVE_OWNER"].includes(error.message)) return 409;
  if (["PASSWORD_CHANGE_REQUIRED", "AUTH_SCHEMA_PATCH_REQUIRED"].includes(error.message)) return 503;
  return 500;
}

export async function requireDictionaryMutation(request: Request) {
  const session = await requireDictionarySession();
  if (!sameOrigin(request) || !csrfMatches(request, session.csrfToken)) throw new Error("CSRF_INVALID");
  if (!dictionaryWriteRoles.has(session.role)) throw new Error("FORBIDDEN");
  return session;
}

export async function revokeCurrentSession() {
  const tokenValue = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!tokenValue) return;
  await db().$executeRaw`UPDATE sessions SET "revokedAt" = NOW() WHERE token = ${tokenValue} AND "revokedAt" IS NULL`;
}

export function csrfMatches(request: Request, expectedToken?: string) {
  const headerToken = request.headers.get("x-csrf-token");
  const cookieToken = request.headers.get("cookie")?.match(/(?:^|; )icenter_csrf=([^;]+)/)?.[1];
  try { return Boolean(headerToken && cookieToken && headerToken === decodeURIComponent(cookieToken) && (!expectedToken || headerToken === expectedToken)); }
  catch { return false; }
}

export const authCookies = { SESSION_COOKIE, CSRF_COOKIE };
