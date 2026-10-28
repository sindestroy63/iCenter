import assert from "node:assert/strict";
import { sameOrigin } from "../lib/same-origin.ts";

const previousNodeEnv = process.env.NODE_ENV;
const previousLocalDev = process.env.ICENTER_LOCAL_DEV;
const checks = [];
function test(name, fn) {
  fn();
  checks.push(name);
}

function request(url, origin, extraHeaders = {}) {
  return new Request(url, { headers: { ...(origin ? { origin } : {}), ...extraHeaders } });
}

try {
  test("production accepts the configured public origin when request.url is internal", () => {
    process.env.NODE_ENV = "production";
    assert.equal(sameOrigin(request("http://next:3000/api/auth/login", "https://icenter-store.com")), true);
  });

  test("production rejects other origins even when forwarded headers claim the public host", () => {
    process.env.NODE_ENV = "production";
    assert.equal(sameOrigin(request("http://next:3000/api/auth/login", "https://attacker.example", {
      "x-forwarded-host": "icenter-store.com",
      "x-forwarded-proto": "https",
    })), false);
    assert.equal(sameOrigin(request("http://next:3000/api/auth/login", "http://next:3000")), false);
  });

  test("production local opt-in accepts only the exact loopback request origin", () => {
    process.env.NODE_ENV = "production";
    process.env.ICENTER_LOCAL_DEV = "1";
    assert.equal(sameOrigin(request("http://localhost:3022/api/admin/products", "http://localhost:3022")), true);
    assert.equal(sameOrigin(request("http://127.0.0.1:3022/api/admin/products", "http://localhost:3022")), false);
    assert.equal(sameOrigin(request("http://localhost:3022/api/admin/products", "https://attacker.example")), false);
  });

  test("production still rejects loopback when local opt-in is absent", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ICENTER_LOCAL_DEV;
    assert.equal(sameOrigin(request("http://localhost:3022/api/admin/products", "http://localhost:3022")), false);
  });

  test("development requires Origin to match request.url", () => {
    process.env.NODE_ENV = "development";
    assert.equal(sameOrigin(request("http://localhost:3011/api/auth/login", "http://localhost:3011")), true);
    assert.equal(sameOrigin(request("http://localhost:3011/api/auth/login", "https://attacker.example")), false);
  });

  test("missing and malformed origins are rejected", () => {
    process.env.NODE_ENV = "production";
    assert.equal(sameOrigin(request("https://icenter-store.com/api/auth/login", null)), false);
    assert.equal(sameOrigin(request("https://icenter-store.com/api/auth/login", "https://icenter-store.com/path")), false);
  });

  process.stdout.write(`Passed ${checks.length} same-origin checks.\n`);
} finally {
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousLocalDev === undefined) delete process.env.ICENTER_LOCAL_DEV;
  else process.env.ICENTER_LOCAL_DEV = previousLocalDev;
}
