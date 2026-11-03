import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateCityAccess } from "../lib/city-access-policy.ts";

const root = new URL("../", import.meta.url);
const source = (path) => readFileSync(new URL(path, root), "utf8");

for (const role of ["ADMIN", "DEVELOPER", "OWNER"]) {
  assert.deepEqual(evaluateCityAccess({ role, isActive: true, allCities: false, hasCityGrant: false }), {
    allowed: true,
    canManagePrices: true,
    canManageStock: true,
  });
}

assert.deepEqual(evaluateCityAccess({
  role: "CITY_MANAGER", isActive: true, allCities: false, hasCityGrant: true,
  grantCanManagePrices: true, grantCanManageStock: false,
}), { allowed: true, canManagePrices: true, canManageStock: false });

assert.deepEqual(evaluateCityAccess({ role: "CITY_MANAGER", isActive: true, allCities: false, hasCityGrant: false }), {
  allowed: false,
  canManagePrices: false,
  canManageStock: false,
});

assert.deepEqual(evaluateCityAccess({
  role: "CITY_MANAGER", isActive: true, allCities: true, hasCityGrant: false,
  allCitiesCanManagePrices: false, allCitiesCanManageStock: true,
}), { allowed: true, canManagePrices: false, canManageStock: true });

assert.deepEqual(evaluateCityAccess({
  role: "CITY_MANAGER", isActive: true, allCities: true, hasCityGrant: true,
  grantCanManagePrices: true, grantCanManageStock: true,
  allCitiesCanManagePrices: false, allCitiesCanManageStock: false,
}), { allowed: true, canManagePrices: false, canManageStock: false });

assert.deepEqual(evaluateCityAccess({ role: "CITY_MANAGER", isActive: false, allCities: true, hasCityGrant: true }), {
  allowed: false,
  canManagePrices: false,
  canManageStock: false,
});

const migration = source("prisma/manual-rbac-all-cities.sql");
assert.match(migration, /ADD COLUMN IF NOT EXISTS "allCities" BOOLEAN DEFAULT FALSE/);
assert.match(migration, /"allCitiesCanManagePrices" BOOLEAN DEFAULT FALSE/);
assert.match(migration, /"allCitiesCanManageStock" BOOLEAN DEFAULT FALSE/);
assert.doesNotMatch(migration, /CREATE\s+TABLE\s+.*audit/i);

const audit = source("lib/admin-audit.ts");
assert.match(audit, /INSERT INTO audit_logs/);
assert.match(audit, /newId\(\)/);
assert.match(audit, /tx\.\$executeRaw/);
assert.doesNotMatch(audit, /passwordHash|temporaryPassword|encryptedPiiPayload/i);

const inventoryRoute = source("app/api/admin/city-inventory/route.ts");
const productRoute = source("app/api/admin/products/route.ts");
const employeeRoute = source("app/api/admin/employees/route.ts");
const resetPasswordRoute = source("app/api/admin/employees/[id]/reset-password/route.ts");
for (const [label, code] of [["inventory", inventoryRoute], ["product", productRoute], ["employee", employeeRoute]]) {
  assert.ok(/\$transaction\s*\(\s*async\s*\(?tx\)?\s*=>/s.test(code), `${label} mutation uses an interactive transaction`);
  assert.ok(/writeAuditLog\(tx|auditInventoryChanges\(tx/.test(code), `${label} writes audit using its transaction client`);
}
assert.match(inventoryRoute, /getCityAccess\(tx, session\.userId, value\.cityId\)/);
assert.match(inventoryRoute, /grant\.canManagePrices/);
assert.match(inventoryRoute, /grant\.canManageStock/);
assert.match(inventoryRoute, /CASE WHEN COALESCE\(\(to_jsonb\(u\)->>'allCities'\)/);
assert.match(productRoute, /getProductAuditSnapshot/);
assert.match(productRoute, /getProductInventorySnapshot/);
assert.match(employeeRoute, /allCitiesCanManagePrices/);
assert.match(employeeRoute, /allCitiesCanManageStock/);
assert.match(employeeRoute, /cityGrants/);
assert.match(resetPasswordRoute, /user\.password_reset/);
assert.doesNotMatch(resetPasswordRoute, /changes:\s*\{[^}]*temporaryPassword|changes:\s*\{[^}]*passwordHash/s);
const citiesRoute = source("app/api/admin/cities/route.ts");
const settingsRoute = source("app/api/admin/settings/route.ts");
const taxonomyRoute = source("app/api/admin/taxonomy/route.ts");
const dictionariesRoute = source("app/api/admin/dictionaries/route.ts");
const groupsRoute = source("app/api/admin/product-groups/route.ts");
const menuRoute = source("app/api/admin/catalog-menu/route.ts");
const collectionRoute = source("lib/admin-product-collection-route.ts");
const bannersRoute = source("app/api/admin/banners/route.ts");
const mediaRoute = source("app/api/admin/media/route.ts");
const mediaDeleteRoute = source("app/api/admin/media/[id]/route.ts");
const profileRoute = source("app/api/admin/profile/route.ts");
const authSource = source("lib/auth.ts");
const menuBannersRoute = source("app/api/admin/catalog-menu-banners/route.ts");
assert.match(citiesRoute, /city\.created/);
assert.match(citiesRoute, /city\.updated/);
assert.match(citiesRoute, /writeAuditLog\(tx/);
assert.match(settingsRoute, /settings\.updated/);
assert.match(settingsRoute, /db\.\$transaction\(async \(tx\)/);
assert.doesNotMatch(settingsRoute, /TELEGRAM_BOT_TOKEN|TELEGRAM_WORK_CHAT_ID|passwordHash|temporaryPassword/);
assert.match(taxonomyRoute, /category\.created/);
assert.match(taxonomyRoute, /category\.updated/);
assert.match(taxonomyRoute, /dictionary\.created/);
assert.match(taxonomyRoute, /auditDiff/);
assert.match(taxonomyRoute, /db\.\$transaction\(async \(tx\)/);
assert.match(dictionariesRoute, /dictionary\.created/);
assert.match(dictionariesRoute, /dictionary\.updated/);
assert.match(dictionariesRoute, /dictionary\.deleted/);
assert.match(dictionariesRoute, /getDictionarySnapshot/);
assert.match(dictionariesRoute, /writeAuditLog\(tx/);
assert.match(dictionariesRoute, /db\.\$transaction\(async \(tx\)/);
assert.doesNotMatch(dictionariesRoute, /passwordHash|temporaryPassword|TELEGRAM_BOT_TOKEN|TELEGRAM_WORK_CHAT_ID/);
assert.match(groupsRoute, /product_group\.created/);
assert.match(groupsRoute, /product_group\.updated/);
assert.match(groupsRoute, /product_group\.deleted/);
assert.match(groupsRoute, /db\.\$transaction\(async \(tx\)/);
assert.match(groupsRoute, /writeAuditLog\(tx/);
assert.match(menuRoute, /catalog_menu\.updated/);
assert.match(menuRoute, /db\.\$transaction\(async \(tx\)/);
assert.match(menuRoute, /auditDiff/);
assert.match(menuRoute, /writeAuditLog\(tx/);
assert.match(collectionRoute, /best_offer|popular_product/);
assert.match(collectionRoute, /auditAction\(collection, "created"\)/);
assert.match(collectionRoute, /auditAction\(collection, "updated"\)/);
assert.match(collectionRoute, /auditAction\(collection, "deleted"\)/);
assert.match(collectionRoute, /auditDiff/);
assert.match(collectionRoute, /db\.\$transaction\(async \(tx\)/);
assert.match(collectionRoute, /writeAuditLog\(tx/);
assert.match(bannersRoute, /banner\.created/);
assert.match(bannersRoute, /banner\.updated/);
assert.match(bannersRoute, /auditDiff/);
assert.match(bannersRoute, /db\.\$transaction\(async \(tx\)/);
assert.match(mediaRoute, /media\.uploaded/);
assert.match(mediaRoute, /adminDb\(\)\.\$transaction\(async \(tx\)/);
assert.match(mediaDeleteRoute, /media\.deleted/);
assert.match(mediaDeleteRoute, /writeAuditLog\(tx/);
assert.match(profileRoute, /profile\.updated/);
assert.match(profileRoute, /profile\.avatar_updated/);
assert.match(profileRoute, /auditDiff/);
assert.match(profileRoute, /\$transaction\(async \(tx\)/);
assert.match(authSource, /profile\.password_changed/);
assert.match(authSource, /writeAuditLog\(tx/);
assert.doesNotMatch(authSource, /changes:[^;]*(passwordHash|sessionToken|csrfToken|temporaryPassword)/s);
assert.match(menuBannersRoute, /catalog_menu\.updated/);
assert.match(menuBannersRoute, /auditDiff/);
assert.match(menuBannersRoute, /\$transaction\(async \(tx\)/);
assert.match(menuBannersRoute, /requireGlobalAdminMutation/);

const photoRoute = source("app/api/admin/lead-photo/route.ts");
const tradeIn = source("lib/trade-in-service.ts");
assert.match(photoRoute, /searchParams\.get\("request"\)/);
assert.match(photoRoute, /canViewTradeInPhoto/);
assert.match(tradeIn, /pii\.photoUrls\.includes\(photoPath\)/);
assert.match(tradeIn, /to_jsonb\(u\)->>'allCities'/);

const requests = source("lib/request-service.ts");
assert.match(requests, /order\.status_updated/);
assert.match(requests, /order\.deleted/);
assert.match(requests, /\$transaction\(async \(tx\)/);
assert.match(requests, /to_jsonb\(viewer_user\)->>'allCities'/);
assert.match(tradeIn, /lead\.status_updated/);
assert.match(tradeIn, /\$transaction\(async \(tx\)/);
assert.match(tradeIn, /to_jsonb\(u\)->>'allCities'/);

const auditRoute = source("app/api/admin/audit-logs/route.ts");
assert.match(auditRoute, /PAGE_MAX = 100000/);
assert.match(auditRoute, /Math\.min\(PAGE_MAX/);
assert.match(auditRoute, /requireGlobalAdminSession/);
assert.match(auditRoute, /PAGE_SIZE_MAX = 100/);
assert.match(auditRoute, /ORDER BY a\."createdAt" DESC/);
assert.match(auditRoute, /metadata->>'actorRole'/);
assert.match(auditRoute, /safeValue/);
assert.doesNotMatch(auditRoute, /export async function (POST|PATCH|DELETE)/);

const auditPage = source("components/AdminAuditLogBackend.tsx");
assert.match(auditPage, /Сотрудник/);
assert.match(auditPage, /Страница/);
assert.match(auditPage, /Записей пока нет/);

assert.match(source("components/AdminShell.tsx"), /\/admin\/audit-log/);
assert.match(source("app/admin/\[...slug\]/page.tsx"), /AdminAuditLogBackend/);
assert.match(employeeRoute, /OWNER_CREATION_DISABLED/);
assert.match(source("components/AdminEmployeesBackend.tsx"), /draft\.role === "OWNER"/);
console.log("RBAC and audit policy checks passed.");
