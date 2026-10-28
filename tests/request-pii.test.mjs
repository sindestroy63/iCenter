import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const key = process.env.REQUEST_PII_KEY;
assert.ok(key, "REQUEST_PII_KEY test secret must be supplied by the local test environment");
const decoded = Buffer.from(key, "base64");
assert.equal(decoded.length, 32, "REQUEST_PII_KEY must decode to exactly 32 bytes");

const tempDir = mkdtempSync(path.join(tmpdir(), "icenter-pii-test-"));
try {
  const modulePath = path.resolve("lib/request-pii.ts");
  const testModulePath = path.join(tempDir, "request-pii.ts");
  // `server-only` is provided by Next.js at build time; strip that marker in
  // this direct Node smoke test while exercising the same implementation.
  const source = readFileSync(modulePath, "utf8").replace('import "server-only";\n', "");
  writeFileSync(testModulePath, source);
  const testPath = path.join(tempDir, "roundtrip.mjs");
  writeFileSync(testPath, `
    import assert from 'node:assert/strict';
    import { encryptPii, decryptPii } from ${JSON.stringify(pathToFileURL(testModulePath).href)};
    const value = { name: 'Test Client', phone: '+79990000000', comment: 'private' };
    const a = encryptPii(value);
    const b = encryptPii(value);
    assert.notEqual(a, b, 'each encryption must use a fresh nonce');
    assert.deepEqual(decryptPii(a), value);
    assert.throws(() => decryptPii(a.slice(0, -2) + 'AA'), /Unsupported state|auth/i);
    process.stdout.write('PII encryption round-trip and tamper rejection passed.\\n');
  `);
  const result = spawnSync(process.execPath, ["--experimental-strip-types", testPath], { stdio: "inherit", env: process.env });
  assert.equal(result.status, 0);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
