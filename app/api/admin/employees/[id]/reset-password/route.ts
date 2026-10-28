import { NextResponse } from "next/server";
import argon2 from "argon2";
import { z } from "zod";
import { requireGlobalAdminMutation } from "@/lib/auth";
import { adminDb } from "@/lib/admin-db";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireGlobalAdminMutation(request);
    const parsed = z.object({ temporaryPassword: z.string().regex(/^[A-Za-z0-9_-]{32}$/) }).safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_PASSWORD" }, { status: 400 });
    const hash = await argon2.hash(parsed.data.temporaryPassword, { type: argon2.argon2id });
    const db = adminDb();
    await db.$transaction(async tx => {
      const users = await tx.$queryRaw<Array<{ role: string }>>`SELECT role::text AS role FROM users WHERE id=${params.id} AND "isActive"=TRUE FOR UPDATE`;
      if (!users[0]) throw new Error("NOT_FOUND");
      if (actor.role !== "OWNER" && users[0].role === "OWNER") throw new Error("FORBIDDEN");
      await tx.$executeRaw`UPDATE users SET "passwordHash"=${hash},"mustChangePassword"=TRUE,"updatedAt"=NOW() WHERE id=${params.id}`;
      await tx.$executeRaw`UPDATE sessions SET "revokedAt"=NOW() WHERE "userId"=${params.id} AND "revokedAt" IS NULL`;
    });
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESET_FAILED";
    const status = message === "UNAUTHORIZED" ? 401 : ["FORBIDDEN", "CSRF_INVALID"].includes(message) ? 403 : message === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
