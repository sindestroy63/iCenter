import dotenv from "dotenv";
import argon2 from "argon2";
import { createInterface } from "node:readline";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH ?? ".env.local" });

const owner = {
  id: "cmv8tgejs0000e1sg6sdpozk9",
  email: "owner@icenter.com",
};
const prisma = new PrismaClient({ log: [] });

function ask(question) {
  const io = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => io.question(question, (answer) => {
    io.close();
    resolve(answer.trim());
  }));
}

function askSecret(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      reject(new Error("Запустите утилиту в интерактивном терминале."));
      return;
    }
    const io = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = io._writeToOutput.bind(io);
    io._writeToOutput = (value) => {
      if (value.includes("\n") || value.includes("\r")) output(value);
    };
    io.question(question, (answer) => {
      io.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

function validatePassword(password) {
  if (password.length < 16 || Buffer.byteLength(password, "utf8") > 1024) return false;
  const groups = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];
  return groups.filter((pattern) => pattern.test(password)).length >= 3;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL не настроен.");

  const existing = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return tx.$queryRaw`SELECT id, email, role::text AS role, "isActive" FROM users WHERE id = ${owner.id}`;
  });
  if (existing.length !== 1 || existing[0].email !== owner.email || existing[0].role !== "OWNER" || !existing[0].isActive) {
    throw new Error("Ожидаемая активная запись OWNER не подтверждена; изменений нет.");
  }

  process.stdout.write(`Подтверждена запись OWNER: ${owner.id} · ${owner.email}\n`);
  process.stdout.write("Будет изменён passwordHash этой строки users и отозваны только активные sessions этого userId.\n");
  const password = await askSecret("Новый пароль (ввод скрыт): ");
  const repeated = await askSecret("Повторите новый пароль: ");
  if (password !== repeated || !validatePassword(password)) {
    throw new Error("Пароль не прошёл проверку длины/сложности или значения не совпали; изменений нет.");
  }
  if (await ask("Для подтверждения введите OWNER-RESET: ") !== "OWNER-RESET") {
    throw new Error("Подтверждение не совпало; изменений нет.");
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.$executeRaw`
      UPDATE users
      SET "passwordHash" = ${passwordHash}, "updatedAt" = NOW()
      WHERE id = ${owner.id}
        AND email = ${owner.email}
        AND role = 'OWNER'::"UserRole"
        AND "isActive" = TRUE
    `;
    if (updated !== 1) throw new Error("OWNER row changed during confirmation; transaction rolled back.");
    const revoked = await tx.$executeRaw`
      UPDATE sessions
      SET "revokedAt" = NOW()
      WHERE "userId" = ${owner.id} AND "revokedAt" IS NULL
    `;
    return { revoked };
  });
  process.stdout.write(`Пароль OWNER обновлён; отозвано сессий: ${result.revoked}.\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Не удалось завершить восстановление."}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
