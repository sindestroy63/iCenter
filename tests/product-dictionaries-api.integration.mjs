import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.equal(url.pathname, "/icenter_test", "Integration tests require the isolated icenter_test database");
assert.equal(url.port, "55432", "Integration tests require the isolated PostgreSQL port 55432");
const prisma = new PrismaClient();
const base = process.env.TEST_APP_URL ?? "http://localhost:3012";
const sessions = new Map();
const created = [];
let originalLink;
let createdProductId;
const id = () => `c${randomBytes(12).toString("hex")}`;

try {
  const identity = await prisma.$queryRaw`SELECT current_database() AS db, current_user AS username, current_setting('server_version_num') AS version`;
  assert.equal(identity[0].db, "icenter_test");
  assert.equal(identity[0].username, "icenter_test");
  assert.ok(Number(identity[0].version) >= 160000 && Number(identity[0].version) < 170000);

  for (const role of ["OWNER", "ADMIN", "DEVELOPER", "CITY_MANAGER"]) {
    const users = await prisma.$queryRaw`SELECT id FROM users WHERE role::text=${role} AND "isActive"=TRUE ORDER BY id LIMIT 1`;
    assert.ok(users[0], `Expected cloned ${role} test principal`);
    const token = randomBytes(32).toString("base64url");
    const csrf = randomBytes(24).toString("base64url");
    const sessionId = id();
    await prisma.$executeRaw`INSERT INTO sessions (id,"userId",token,"csrfToken","expiresAt","createdAt","lastActivityAt","tokenFamily") VALUES (${sessionId},${users[0].id},${token},${csrf},NOW()+INTERVAL '10 minutes',NOW(),NOW(),${id()})`;
    sessions.set(role, { token, csrf, sessionId });
  }

  const call = async (role, method, body, path = "/api/admin/dictionaries") => {
    const session = sessions.get(role);
    const code = path.includes("dictionaries") ? body?.code ?? (method === "GET" ? "memory" : "") : "";
    const response = await fetch(`${base}${path}${code ? `?code=${code}` : ""}`, {
      method,
      headers: {
        cookie: `icenter_session=${session.token}; icenter_csrf=${session.csrf}`,
        origin: base,
        "x-csrf-token": session.csrf,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { response, body: await response.json().catch(() => ({})) };
  };

  for (const role of sessions.keys()) {
    const { response, body } = await call(role, "GET");
    assert.equal(response.status, 200, `${role} dictionary read: ${JSON.stringify(body)}`);
    assert.ok(Array.isArray(body.data));
  }

  const suffix = randomBytes(5).toString("hex");
  const option = { id: id(), canonicalKey: `memory:${suffix}gb`, label: `test-${suffix}`, aliases: [], sortOrder: 99999, isActive: true };
  for (const role of ["OWNER", "ADMIN", "DEVELOPER"]) {
    const { response, body } = await call(role, "POST", { ...option, code: "memory" });
    assert.equal(response.status, 201, `${role} dictionary write: ${JSON.stringify(body)}`);
    created.push({ id: option.id, code: "memory" });
    break;
  }
  const optionId = created.at(-1)?.id;

  const duplicate = await call("OWNER", "POST", option);
  assert.notEqual(duplicate.response.status, 201, "Duplicate key must be rejected");
  for (const role of ["ADMIN", "DEVELOPER"]) {
    const roleOption = { ...option, id: id(), canonicalKey: `memory:${suffix}-${role.toLowerCase()}gb`, label: `${role}-${suffix}` };
    const result = await call(role, "POST", { ...roleOption, code: "memory" });
    assert.equal(result.response.status, 201, `${role} dictionary write: ${JSON.stringify(result.body)}`);
    created.push({ id: roleOption.id, code: "memory" });
  }
  const cityWrite = await call("CITY_MANAGER", "POST", { ...option, id: id(), code: "memory", canonicalKey: `memory:${suffix}-city`, label: `city-${suffix}` });
  assert.equal(cityWrite.response.status, 403);

  const updated = await call("ADMIN", "PATCH", { code: "memory", id: optionId, isActive: true, label: `updated-${suffix}` });
  assert.equal(updated.response.status, 200);

  const optionRow = await prisma.$queryRaw`SELECT id,"definitionId" FROM attribute_options WHERE id=${optionId}`;
  const links = await prisma.$queryRaw`SELECT "variantId","definitionId","optionId" FROM product_variant_attribute_values WHERE "definitionId"=${optionRow[0].definitionId} LIMIT 1`;
  assert.ok(links[0], "Expected a cloned variant link to test used-option protection");
  originalLink = links[0];
  await prisma.$executeRaw`UPDATE product_variant_attribute_values SET "optionId"=${optionId} WHERE "variantId"=${originalLink.variantId} AND "definitionId"=${originalLink.definitionId}`;
  const blocked = await call("OWNER", "PATCH", { code: "memory", id: optionId, isActive: false });
  assert.equal(blocked.response.status, 409, `Used option must be protected: ${JSON.stringify(blocked.body)}`);

  const catalog = await call("OWNER", "GET", undefined, "/api/admin/products");
  assert.equal(catalog.response.status, 200, `Product read: ${JSON.stringify(catalog.body)}`);
  assert.equal((await call("ADMIN", "GET", undefined, "/api/admin/products")).response.status, 200);
  assert.equal((await call("DEVELOPER", "GET", undefined, "/api/admin/products")).response.status, 200);
  assert.equal((await call("CITY_MANAGER", "GET", undefined, "/api/admin/products")).response.status, 403);
  const source = catalog.body.data.find((product) => product.variants.some((variant) => variant.inventory.length && variant.dictionaryOptionIds.memory));
  assert.ok(source && source.brandId && source.productTypeId && source.categoryId);
  const existingVariant = source.variants.find((variant) => variant.inventory.length && variant.dictionaryOptionIds.memory);
  const newProduct = {
    name: `Dictionary integration ${suffix}`,
    slug: `dictionary-integration-${suffix}`,
    brandId: source.brandId,
    productTypeId: source.productTypeId,
    categoryId: source.categoryId,
    productLineId: null,
    model: source.model ?? null,
    generation: source.generation ?? null,
    chip: source.chip ?? null,
    displaySize: source.displaySize ?? null,
    releaseYear: source.releaseYear ?? null,
    description: source.description ?? "",
    specifications: {},
    isNew: false,
    status: "PUBLISHED",
    dictionaryOptionIds: {},
    variants: [{ label: existingVariant.label ?? null, colorId: existingVariant.colorId ?? null, storage: existingVariant.storage ?? null, ram: existingVariant.ram ?? null, simType: existingVariant.simType ?? null, connectivity: existingVariant.connectivity ?? null, size: existingVariant.size ?? null, material: existingVariant.material ?? null, dictionaryOptionIds: existingVariant.dictionaryOptionIds.memory ? { memory: existingVariant.dictionaryOptionIds.memory } : {}, attributes: {}, active: true, inventory: (existingVariant.inventory ?? []).map(({ cityId, price, oldPrice, availability, allowPreorder, deliveryTime }) => ({ cityId, price, oldPrice, availability, allowPreorder, deliveryTime })) }],
    images: (source.images ?? []).map(({ mediaId, colorId, sortOrder }) => ({ mediaId, colorId: colorId ?? null, sortOrder })),
  };
  const createdProduct = await call("OWNER", "POST", newProduct, "/api/admin/products");
  assert.equal(createdProduct.response.status, 201, `Product create: ${JSON.stringify(createdProduct.body)}`);
  const afterCreate = await call("OWNER", "GET", undefined, "/api/admin/products");
  assert.equal(afterCreate.response.status, 200);
  const saved = afterCreate.body.data.find((item) => item.name === newProduct.name);
  assert.ok(saved, "Created product must be returned on reopen");
  createdProductId = saved.id;
  const originalSnapshot = {
    sku: saved.variants.map((item) => item.sku),
    inventory: saved.variants.map((item) => item.inventory.map(({ cityId, price, oldPrice, availability, allowPreorder, deliveryTime }) => ({ cityId, price, oldPrice, availability, allowPreorder, deliveryTime }))),
    images: saved.images.map(({ mediaId, colorId, sortOrder }) => ({ mediaId, colorId, sortOrder })),
  };
  const definitions = await prisma.$queryRaw`SELECT id FROM attribute_definitions WHERE code='memory'`;
  const alternate = await prisma.$queryRaw`SELECT o.id,o.label FROM attribute_options o JOIN product_type_attributes pta ON pta."definitionId"=o."definitionId" WHERE o."definitionId"=${definitions[0].id} AND pta."productTypeId"=${saved.productTypeId} AND o."isActive"=TRUE AND o.id<>${saved.variants[0].dictionaryOptionIds.memory ?? ""} LIMIT 1`;
  assert.ok(alternate[0], "Characteristic update must have a distinct applicable option");
  if (alternate[0]) {
    const edit = { ...saved, variants: saved.variants.map((item, index) => index === 0 ? { ...item, dictionaryOptionIds: { ...item.dictionaryOptionIds, memory: alternate[0].id } } : item) };
    const changed = await call("OWNER", "PATCH", { id: saved.id, data: edit }, "/api/admin/products");
    assert.equal(changed.response.status, 200, `Product characteristic edit: ${JSON.stringify(changed.body)}`);
    const reopened = await call("OWNER", "GET", undefined, "/api/admin/products");
    const roundTrip = reopened.body.data.find((item) => item.id === saved.id);
    assert.equal(roundTrip.variants[0].dictionaryOptionIds.memory, alternate[0].id);
    assert.deepEqual(roundTrip.variants.map((item) => item.sku), originalSnapshot.sku);
    assert.deepEqual(roundTrip.variants.map((item) => item.inventory.map(({ cityId, price, oldPrice, availability, allowPreorder, deliveryTime }) => ({ cityId, price, oldPrice, availability, allowPreorder, deliveryTime }))), originalSnapshot.inventory);
    assert.deepEqual(roundTrip.images.map(({ mediaId, colorId, sortOrder }) => ({ mediaId, colorId, sortOrder })), originalSnapshot.images);
    const publicMatch = await fetch(`${base}/api/catalog/products?city=${encodeURIComponent(existingVariant.inventory[0].citySlug)}&memory=${encodeURIComponent(alternate[0].label)}`);
    assert.equal(publicMatch.status, 200);
    const publicData = await publicMatch.json();
    assert.ok(publicData.data.some((product) => product.id === saved.id), "Saved dictionary memory must be searchable in the public catalog");
  }
  const cities = await prisma.$queryRaw`SELECT slug FROM cities WHERE "isActive"=TRUE ORDER BY name LIMIT 1`;
  assert.ok(cities[0], "Public filter smoke requires an active test city");
  const filterParams = ["brand", "type", "productModel", "color", "memory", "ram", "sim", "connectivity"];
  for (const filter of filterParams) {
    const response = await fetch(`${base}/api/catalog/products?city=${encodeURIComponent(cities[0].slug)}&${filter}=integration-no-match`);
    assert.equal(response.status, 200, `Public filter ${filter} must be accepted`);
    assert.ok(Array.isArray((await response.json()).data));
  }
  process.stdout.write("Dictionary CRUD/RBAC, product round-trip, invariants, and 8 public filters passed on icenter_test.\n");
} finally {
  if (originalLink) await prisma.$executeRaw`UPDATE product_variant_attribute_values SET "optionId"=${originalLink.optionId} WHERE "variantId"=${originalLink.variantId} AND "definitionId"=${originalLink.definitionId}`.catch(() => undefined);
  if (createdProductId) {
    await prisma.$executeRaw`DELETE FROM product_attribute_values WHERE "productId"=${createdProductId}`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM product_variant_attribute_values WHERE "variantId" IN (SELECT id FROM product_variants WHERE "productId"=${createdProductId})`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM inventory WHERE "variantId" IN (SELECT id FROM product_variants WHERE "productId"=${createdProductId})`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM color_gallery_images WHERE "colorGalleryId" IN (SELECT id FROM color_galleries WHERE "productId"=${createdProductId})`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM color_galleries WHERE "productId"=${createdProductId}`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM product_gallery_images WHERE "productId"=${createdProductId}`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM product_variants WHERE "productId"=${createdProductId}`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM products WHERE id=${createdProductId}`.catch(() => undefined);
  }
  for (const item of created) await prisma.$executeRaw`DELETE FROM attribute_options WHERE id=${item.id}`.catch(() => undefined);
  for (const session of sessions.values()) await prisma.$executeRaw`DELETE FROM sessions WHERE id=${session.sessionId}`.catch(() => undefined);
  await prisma.$disconnect();
}
