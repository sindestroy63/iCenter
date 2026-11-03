import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const container = "icenter-work-test-postgres";
const suffix = randomBytes(6).toString("hex");
const prefix = `RBAC_TEST_${suffix}`;
const ids = {
  admin: `${prefix}_ADMIN`,
  developer: `${prefix}_DEVELOPER`,
  manager: `${prefix}_MANAGER`,
  samara: `${prefix}_SAMARA`,
  moscow: `${prefix}_MOSCOW`,
  future: `${prefix}_FUTURE`,
};

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runSql(sql) {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-U", "icenter_test", "-d", "icenter_test", "-v", "ON_ERROR_STOP=1", "-X", "-A", "-t"], { input: sql, encoding: "utf8" });
}

const q = sqlLiteral;
const managerEmail = `${prefix.toLowerCase()}@invalid.test`;
const setup = `
BEGIN;
INSERT INTO users (id,email,"passwordHash",role,name,"isActive","updatedAt","firstName","lastName","mustChangePassword","allCities","allCitiesCanManagePrices","allCitiesCanManageStock") VALUES
  (${q(ids.admin)},${q(`${prefix.toLowerCase()}_admin@invalid.test`)},'RBAC_TEST_HASH','ADMIN',${q(prefix + ' admin')},TRUE,NOW(),${q('Test')},${q('Admin')},FALSE,FALSE,FALSE,FALSE),
  (${q(ids.developer)},${q(`${prefix.toLowerCase()}_developer@invalid.test`)},'RBAC_TEST_HASH','DEVELOPER',${q(prefix + ' developer')},TRUE,NOW(),${q('Test')},${q('Developer')},FALSE,FALSE,FALSE,FALSE),
  (${q(ids.manager)},${q(managerEmail)},'RBAC_TEST_HASH','CITY_MANAGER',${q(prefix + ' manager')},TRUE,NOW(),${q('Test')},${q('Manager')},FALSE,FALSE,FALSE,FALSE);
INSERT INTO cities (id,name,slug,"isActive","updatedAt") VALUES
  (${q(ids.samara)},${q(prefix + ' Samara')},${q(prefix.toLowerCase() + '-samara')},TRUE,NOW()),
  (${q(ids.moscow)},${q(prefix + ' Moscow')},${q(prefix.toLowerCase() + '-moscow')},TRUE,NOW()),
  (${q(ids.future)},${q(prefix + ' Future')},${q(prefix.toLowerCase() + '-future')},TRUE,NOW());
INSERT INTO user_city_access (id,"userId","cityId","canManagePrices","canManageStock") VALUES
  (${q(prefix + '_GRANT_1')},${q(ids.manager)},${q(ids.samara)},TRUE,FALSE),
  (${q(prefix + '_GRANT_2')},${q(ids.manager)},${q(ids.moscow)},FALSE,TRUE);
COMMIT;
`;

const checks = `
DO $$
DECLARE c integer; v text; b boolean;
BEGIN
  SELECT count(*) INTO c FROM users WHERE id IN (${q(ids.admin)},${q(ids.developer)},${q(ids.manager)});
  IF c <> 3 THEN RAISE EXCEPTION 'synthetic users missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=${q(ids.admin)} AND role='ADMIN') THEN RAISE EXCEPTION 'admin role failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=${q(ids.developer)} AND role='DEVELOPER') THEN RAISE EXCEPTION 'developer role failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM user_city_access WHERE "userId"=${q(ids.manager)} AND "cityId"=${q(ids.samara)} AND "canManagePrices"=TRUE AND "canManageStock"=FALSE) THEN RAISE EXCEPTION 'samara permissions failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM user_city_access WHERE "userId"=${q(ids.manager)} AND "cityId"=${q(ids.moscow)} AND "canManagePrices"=FALSE AND "canManageStock"=TRUE) THEN RAISE EXCEPTION 'moscow permissions failed'; END IF;
  UPDATE users SET "allCities"=TRUE,"allCitiesCanManagePrices"=FALSE,"allCitiesCanManageStock"=TRUE WHERE id=${q(ids.manager)};
  SELECT ("allCities" AND "allCitiesCanManageStock" AND NOT "allCitiesCanManagePrices") INTO b FROM users WHERE id=${q(ids.manager)};
  IF b IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'allCities priority failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cities WHERE id=${q(ids.future)} AND "isActive"=TRUE) THEN RAISE EXCEPTION 'future city missing'; END IF;
  INSERT INTO audit_logs (id,"userId",action,"entityType","entityId",changes,metadata,"sessionId") VALUES (${q(prefix + '_AUDIT_PRICE')},${q(ids.manager)},'inventory.updated','inventory',${q(prefix + '_INVENTORY')},'{"price":{"old":"10","new":"11"}}'::jsonb,jsonb_build_object('actorId',${q(ids.manager)},'actorRole','CITY_MANAGER'),${q(prefix + '_SESSION')});
  IF NOT EXISTS (SELECT 1 FROM audit_logs WHERE id=${q(prefix + '_AUDIT_PRICE')} AND changes = '{"price":{"old":"10","new":"11"}}'::jsonb) THEN RAISE EXCEPTION 'old/new diff failed'; END IF;
  IF EXISTS (SELECT 1 FROM audit_logs WHERE id=${q(prefix + '_AUDIT_PRICE')} AND changes::text ~* '(password|token|secret|hash)') THEN RAISE EXCEPTION 'secret in audit payload'; END IF;
  SELECT count(*) INTO c FROM audit_logs;
  UPDATE users SET name=name WHERE id=${q(ids.manager)};
  IF (SELECT count(*) FROM audit_logs) <> c THEN RAISE EXCEPTION 'no-op created audit'; END IF;
  BEGIN
    UPDATE users SET name=${q(prefix + ' rollback')} WHERE id=${q(ids.manager)};
    INSERT INTO audit_logs (id,"userId",action) VALUES (${q(prefix + '_AUDIT_FAIL')},${q(ids.manager)},NULL);
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  SELECT name INTO v FROM users WHERE id=${q(ids.manager)};
  IF v <> ${q(prefix + ' manager')} THEN RAISE EXCEPTION 'rollback failed'; END IF;
END $$;
DELETE FROM users WHERE id=${q(ids.manager)};
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM audit_logs WHERE id=${q(prefix + '_AUDIT_PRICE')} AND "userId" IS NULL AND metadata->>'actorId'=${q(ids.manager)}) THEN RAISE EXCEPTION 'actor snapshot or SET NULL failed'; END IF;
END $$;
`;

const cleanup = `
BEGIN;
DELETE FROM audit_logs WHERE id LIKE ${q(prefix + '%')} OR metadata->>'actorId' LIKE ${q(prefix + '%')} OR "entityId" LIKE ${q(prefix + '%')};
DELETE FROM user_city_access WHERE id LIKE ${q(prefix + '%')} OR "userId" LIKE ${q(prefix + '%')} OR "cityId" LIKE ${q(prefix + '%')};
DELETE FROM users WHERE id LIKE ${q(prefix + '%')};
DELETE FROM cities WHERE id LIKE ${q(prefix + '%')};
COMMIT;
`;

try {
  runSql(setup);
  runSql(checks);
  console.log(`RBAC PostgreSQL integration checks passed (${prefix})`);
} finally {
  runSql(cleanup);
}
