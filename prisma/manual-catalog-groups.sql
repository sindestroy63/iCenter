-- Prepared only. Do not apply automatically.
-- Adds universal product groups without changing existing catalog data.
BEGIN;

DO $$
BEGIN
  IF to_regclass('catalog_groups') IS NOT NULL
     OR to_regclass('catalog_group_products') IS NOT NULL
     OR to_regclass('catalog_group_rules') IS NOT NULL THEN
    RAISE EXCEPTION 'catalog groups schema already exists; review before reapplying manual-catalog-groups.sql';
  END IF;
END $$;

CREATE TABLE catalog_groups (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  isActive boolean NOT NULL DEFAULT true,
  sortOrder integer NOT NULL DEFAULT 0,
  createdAt timestamp without time zone NOT NULL DEFAULT now(),
  updatedAt timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE catalog_group_products (
  "groupId" text NOT NULL REFERENCES catalog_groups(id) ON DELETE CASCADE,
  "productId" text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("groupId", "productId")
);
CREATE INDEX IF NOT EXISTS catalog_group_products_order_idx ON catalog_group_products ("groupId", "sortOrder");
CREATE INDEX IF NOT EXISTS catalog_group_products_product_idx ON catalog_group_products ("productId");

CREATE TABLE catalog_group_rules (
  id text PRIMARY KEY,
  "groupId" text NOT NULL REFERENCES catalog_groups(id) ON DELETE CASCADE,
  "brandId" text NULL REFERENCES brands(id) ON DELETE RESTRICT,
  "globalProductTypeId" text NULL REFERENCES global_product_types(id) ON DELETE RESTRICT,
  "modelId" text NULL REFERENCES product_models(id) ON DELETE RESTRICT,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "isActive" boolean NOT NULL DEFAULT true,
  CONSTRAINT catalog_group_rules_has_condition CHECK ("brandId" IS NOT NULL OR "globalProductTypeId" IS NOT NULL OR "modelId" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS catalog_group_rules_order_idx ON catalog_group_rules ("groupId", "isActive", "sortOrder");
CREATE INDEX IF NOT EXISTS catalog_group_rules_scope_idx ON catalog_group_rules ("brandId", "globalProductTypeId", "modelId");
-- PostgreSQL UNIQUE treats NULLs as distinct, so use a null-normalized expression index.
CREATE UNIQUE INDEX IF NOT EXISTS catalog_group_rules_scope_unique
  ON catalog_group_rules ("groupId", COALESCE("brandId", ''), COALESCE("globalProductTypeId", ''), COALESCE("modelId", ''));

COMMIT;
