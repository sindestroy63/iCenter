const base = process.env.AUTH_SMOKE_URL ?? "http://localhost:3012";
const checks = [];
async function check(name, method, path, options = {}, expected) {
  const response = await fetch(new URL(path, base), { redirect: "manual", ...options });
  const ok = expected(response);
  checks.push(`${ok ? "PASS" : "FAIL"} ${name} ${response.status}`);
  if (!ok) process.exitCode = 1;
  return response;
}

await check("admin unauthenticated redirect", "GET", "/admin", {}, r => r.status === 307 && new URL(r.headers.get("location") ?? "", base).pathname === "/admin/login");
await check("login page public", "GET", "/admin/login", {}, r => r.status === 200);
await check("session denied without cookie", "GET", "/api/auth/session", {}, r => r.status === 401);
await check("login origin required", "POST", "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }, r => r.status === 403);
await check("invalid login payload rejected", "POST", "/api/auth/login", { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: "{}" }, r => r.status === 400);
await check("logout csrf required", "POST", "/api/auth/logout", { method: "POST", headers: { origin: base } }, r => r.status === 403);
await check("product admin API denied without session", "GET", "/api/admin/products", {}, r => r.status === 401);
await check("media admin API denied without session", "GET", "/api/admin/media", {}, r => r.status === 401);
await check("catalog API remains public", "GET", "/api/catalog/products?city=samara", {}, r => r.status === 200);
process.stdout.write(`${checks.join("\n")}\n`);
