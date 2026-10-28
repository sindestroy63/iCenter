"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadEnvConfig } = require("@next/env");

const root = path.resolve(__dirname, "..");
const schemaPath = path.join(root, "prisma", "schema.prisma");
const temporarySchemaPath = path.join(
  root,
  "prisma",
  `.tmp-schema-lowerqa-${process.pid}-${Date.now()}.prisma`,
);
const clientOutput = "../node_modules/.prisma/client-lowerqa";

loadEnvConfig(root);

let databaseUrl;
try {
  databaseUrl = new URL(process.env.DATABASE_URL ?? "");
} catch {
  throw new Error("A valid local DATABASE_URL is required to generate the lowerqa client");
}

if (
  !["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname)
  || databaseUrl.port !== "5434"
  || databaseUrl.pathname !== "/icenter_v2"
) {
  throw new Error("Refusing Prisma generation unless DATABASE_URL targets local icenter_v2 on port 5434");
}

const schema = fs.readFileSync(schemaPath, "utf8");
const generatorMatch = schema.match(/generator client\s*\{[\s\S]*?\}/);
if (!generatorMatch) throw new Error("Prisma client generator block was not found");
if (/^\s*output\s*=/m.test(generatorMatch[0])) {
  throw new Error("Prisma client generator already has an output; review the schema before continuing");
}

const lineEnding = schema.includes("\r\n") ? "\r\n" : "\n";
const isolatedGenerator = generatorMatch[0].replace(
  /\r?\n\}/,
  `${lineEnding}  output = "${clientOutput}"${lineEnding}}`,
);
if (isolatedGenerator === generatorMatch[0]) throw new Error("Could not set the isolated Prisma output");

fs.writeFileSync(temporarySchemaPath, schema.replace(generatorMatch[0], isolatedGenerator));

try {
  const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(
    process.execPath,
    [prismaCli, "generate", `--schema=${path.relative(root, temporarySchemaPath)}`],
    { cwd: root, env: process.env, stdio: "inherit" },
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(temporarySchemaPath, { force: true });
}
