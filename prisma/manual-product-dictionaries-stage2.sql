-- MANUAL, NOT AUTO-APPLIED. Target: legacy PostgreSQL icenter_v2.
-- Additive only: preserves existing columns/data and uses legacy camelCase names.
-- Review and apply only after backup/restore verification and explicit approval.
BEGIN;

CREATE TABLE attribute_definitions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('PRODUCT', 'VARIANT')),
  "valueKind" TEXT NOT NULL DEFAULT 'OPTION' CHECK ("valueKind" IN ('OPTION', 'TEXT', 'NUMBER', 'BOOLEAN')),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isFilterable" BOOLEAN NOT NULL DEFAULT FALSE,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attribute_definitions_code_format CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT attribute_definitions_id_scope_unique UNIQUE (id, scope)
);

CREATE INDEX attribute_definitions_active_order_idx
  ON attribute_definitions ("isActive", "sortOrder", code);

-- Stable definition metadata only; no option values are fabricated or seeded.
INSERT INTO attribute_definitions (id, code, name, scope, "valueKind", "sortOrder", "isFilterable", "isActive") VALUES
  ('ad_memory', 'memory', 'Память', 'VARIANT', 'OPTION', 10, TRUE, TRUE),
  ('ad_ram', 'ram', 'Оперативная память (RAM)', 'VARIANT', 'OPTION', 11, TRUE, TRUE),
  ('ad_sim', 'sim', 'SIM', 'VARIANT', 'OPTION', 12, TRUE, TRUE),
  ('ad_connectivity', 'connectivity', 'Подключение', 'VARIANT', 'OPTION', 13, TRUE, TRUE),
  ('ad_size', 'size', 'Размер', 'VARIANT', 'OPTION', 14, FALSE, TRUE),
  ('ad_material', 'material', 'Материал', 'VARIANT', 'OPTION', 15, FALSE, TRUE),
  ('ad_chip', 'chip', 'Процессор / чип', 'PRODUCT', 'OPTION', 16, FALSE, TRUE),
  ('ad_region', 'region', 'Регион / версия', 'VARIANT', 'OPTION', 17, FALSE, TRUE),
  ('ad_condition', 'condition', 'Состояние', 'PRODUCT', 'OPTION', 18, FALSE, TRUE),
  ('ad_bundle', 'bundle', 'Комплектация', 'VARIANT', 'OPTION', 19, FALSE, TRUE);

-- Global types are separate concepts; legacy product_types IDs and brandId rows remain intact.
CREATE TABLE global_product_types (
  id TEXT PRIMARY KEY,
  "canonicalKey" TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT global_product_types_key_format CHECK ("canonicalKey" ~ '^product_type:[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE TABLE global_product_type_brands (
  "productTypeId" TEXT NOT NULL REFERENCES global_product_types(id) ON DELETE RESTRICT,
  "brandId" TEXT NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("productTypeId", "brandId")
);

CREATE TABLE legacy_product_type_mappings (
  "legacyProductTypeId" TEXT PRIMARY KEY REFERENCES product_types(id) ON DELETE RESTRICT,
  "globalProductTypeId" TEXT NOT NULL REFERENCES global_product_types(id) ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO global_product_types (id, "canonicalKey", name, "sortOrder") VALUES
  ('gpt_smartphone', 'product_type:smartphone', 'Смартфон', 10),
  ('gpt_tablet', 'product_type:tablet', 'Планшет', 20),
  ('gpt_console', 'product_type:console', 'Игровая консоль', 30),
  ('gpt_vacuum', 'product_type:vacuum', 'Пылесос', 40);

INSERT INTO legacy_product_type_mappings ("legacyProductTypeId", "globalProductTypeId")
SELECT pt.id, CASE
  WHEN lower(pt.name) IN ('galaxy', 'iphone') THEN 'gpt_smartphone'
  WHEN lower(pt.name) = 'ipad' THEN 'gpt_tablet'
  WHEN lower(pt.name) = 'playstation' THEN 'gpt_console'
  WHEN lower(pt.name) = 'пылесос' OR pt.slug = 'vacuum-cleaner' THEN 'gpt_vacuum'
END
FROM product_types pt
WHERE lower(pt.name) IN ('galaxy', 'iphone', 'ipad', 'playstation', 'пылесос') OR pt.slug = 'vacuum-cleaner';

INSERT INTO global_product_type_brands ("productTypeId", "brandId")
SELECT DISTINCT mapping."globalProductTypeId", pt."brandId"
FROM legacy_product_type_mappings mapping
JOIN product_types pt ON pt.id = mapping."legacyProductTypeId";

CREATE TABLE attribute_options (
  id TEXT PRIMARY KEY,
  "definitionId" TEXT NOT NULL,
  "canonicalKey" TEXT NOT NULL,
  label TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attribute_options_definition_fk
  FOREIGN KEY ("definitionId") REFERENCES attribute_definitions(id) ON DELETE RESTRICT,
  CONSTRAINT attribute_options_key_format CHECK ("canonicalKey" ~ '^[a-z][a-z0-9_]*:[a-z0-9]+([_-][a-z0-9]+)*$'),
  CONSTRAINT attribute_options_canonical_unique UNIQUE ("definitionId", "canonicalKey"),
  CONSTRAINT attribute_options_id_definition_unique UNIQUE (id, "definitionId")
);

CREATE INDEX attribute_options_active_order_idx
  ON attribute_options ("definitionId", "isActive", "sortOrder", label);

CREATE TABLE attribute_option_aliases (
  id TEXT PRIMARY KEY,
  "definitionId" TEXT NOT NULL,
  "optionId" TEXT NOT NULL,
  "aliasKey" TEXT NOT NULL,
  "aliasLabel" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attribute_option_aliases_option_fk
    FOREIGN KEY ("optionId", "definitionId")
    REFERENCES attribute_options(id, "definitionId") ON DELETE CASCADE,
  CONSTRAINT attribute_option_aliases_key_not_empty CHECK (length(btrim("aliasKey")) > 0),
  CONSTRAINT attribute_option_aliases_label_not_empty CHECK (length(btrim("aliasLabel")) > 0),
  CONSTRAINT attribute_option_aliases_key_unique UNIQUE ("definitionId", "aliasKey")
);

CREATE INDEX attribute_option_aliases_option_idx
  ON attribute_option_aliases ("optionId");

-- Seed only values observed in the restored catalog and approved by the owner.
INSERT INTO attribute_options (id, "definitionId", "canonicalKey", label, "sortOrder") VALUES
  ('ao_memory_128gb', 'ad_memory', 'memory:128gb', '128 ГБ', 128),
  ('ao_memory_256gb', 'ad_memory', 'memory:256gb', '256 ГБ', 256),
  ('ao_memory_512gb', 'ad_memory', 'memory:512gb', '512 ГБ', 512),
  ('ao_memory_825gb', 'ad_memory', 'memory:825gb', '825 ГБ', 825),
  ('ao_memory_1024gb', 'ad_memory', 'memory:1024gb', '1 ТБ', 1024),
  ('ao_ram_8gb', 'ad_ram', 'ram:8gb', '8 ГБ', 8),
  ('ao_ram_12gb', 'ad_ram', 'ram:12gb', '12 ГБ', 12),
  ('ao_sim_generic', 'ad_sim', 'sim:sim', 'SIM (тип не уточнён)', 10),
  ('ao_sim_esim', 'ad_sim', 'sim:esim', 'eSIM', 20),
  ('ao_sim_hybrid', 'ad_sim', 'sim:esim-physical-sim', 'eSIM + физическая SIM', 30),
  ('ao_chip_a15', 'ad_chip', 'chip:a15-bionic', 'A15 Bionic', 10),
  ('ao_chip_a16', 'ad_chip', 'chip:a16-bionic', 'A16 Bionic', 20),
  ('ao_chip_a17pro', 'ad_chip', 'chip:a17-pro', 'A17 Pro', 30),
  ('ao_chip_m2', 'ad_chip', 'chip:m2', 'M2', 40);

INSERT INTO attribute_option_aliases (id, "definitionId", "optionId", "aliasKey", "aliasLabel") VALUES
  ('aa_memory_128gb', 'ad_memory', 'ao_memory_128gb', 'memory:128gb', '128GB'),
  ('aa_memory_256', 'ad_memory', 'ao_memory_256gb', 'memory:256', '256'),
  ('aa_memory_256gb', 'ad_memory', 'ao_memory_256gb', 'memory:256gb', '256GB'),
  ('aa_memory_512gb', 'ad_memory', 'ao_memory_512gb', 'memory:512gb', '512GB'),
  ('aa_memory_1tb', 'ad_memory', 'ao_memory_1024gb', 'memory:1tb', '1TB'),
  ('aa_memory_825gb', 'ad_memory', 'ao_memory_825gb', 'memory:825gb', '825GB'),
  ('aa_ram_8', 'ad_ram', 'ao_ram_8gb', 'ram:8', '8'),
  ('aa_ram_8gb', 'ad_ram', 'ao_ram_8gb', 'ram:8gb', '8GB'),
  ('aa_ram_12gb', 'ad_ram', 'ao_ram_12gb', 'ram:12gb', '12GB'),
  ('aa_sim_generic', 'ad_sim', 'ao_sim_generic', 'sim:sim', 'SIM'),
  ('aa_sim_esim', 'ad_sim', 'ao_sim_esim', 'sim:esim', 'eSIM'),
  ('aa_sim_hybrid', 'ad_sim', 'ao_sim_hybrid', 'sim:esim-physical-sim', 'eSIM + физическая SIM');

-- Keep canonical keys and aliases unique across both tables, including concurrent writes.
CREATE FUNCTION product_dictionary_reject_key_collision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW."definitionId"));
  IF TG_TABLE_NAME = 'attribute_options' THEN
    IF split_part(NEW."canonicalKey", ':', 1) <> (
      SELECT d.code FROM attribute_definitions d WHERE d.id = NEW."definitionId"
    ) THEN
      RAISE EXCEPTION 'canonical key namespace does not match its definition' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM attribute_option_aliases a
      WHERE a."definitionId" = NEW."definitionId" AND a."aliasKey" = NEW."canonicalKey" AND a."optionId" <> NEW.id
    ) THEN
      RAISE EXCEPTION 'canonical key conflicts with an existing alias' USING ERRCODE = '23505';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM attribute_options o
      WHERE o."definitionId" = NEW."definitionId" AND o."canonicalKey" = NEW."aliasKey" AND o.id <> NEW."optionId"
    ) THEN
      RAISE EXCEPTION 'alias conflicts with an existing canonical key' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER attribute_options_key_collision_guard
  BEFORE INSERT OR UPDATE OF "definitionId", "canonicalKey" ON attribute_options
  FOR EACH ROW EXECUTE FUNCTION product_dictionary_reject_key_collision();

CREATE TRIGGER attribute_option_aliases_key_collision_guard
  BEFORE INSERT OR UPDATE OF "definitionId", "aliasKey" ON attribute_option_aliases
  FOR EACH ROW EXECUTE FUNCTION product_dictionary_reject_key_collision();

CREATE TABLE product_type_attributes (
  "productTypeId" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('PRODUCT', 'VARIANT')),
  "isRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_type_attributes_pk PRIMARY KEY ("productTypeId", "definitionId"),
  CONSTRAINT product_type_attributes_type_fk
    FOREIGN KEY ("productTypeId") REFERENCES product_types(id) ON DELETE RESTRICT,
  CONSTRAINT product_type_attributes_definition_scope_fk
    FOREIGN KEY ("definitionId", scope) REFERENCES attribute_definitions(id, scope) ON DELETE RESTRICT
);

CREATE INDEX product_type_attributes_definition_idx
  ON product_type_attributes ("definitionId", "sortOrder");

CREATE TABLE product_attribute_values (
  "productId" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "optionId" TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'PRODUCT' CHECK (scope = 'PRODUCT'),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_attribute_values_pk PRIMARY KEY ("productId", "definitionId"),
  CONSTRAINT product_attribute_values_product_fk
    FOREIGN KEY ("productId") REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT product_attribute_values_definition_scope_fk
    FOREIGN KEY ("definitionId", scope) REFERENCES attribute_definitions(id, scope) ON DELETE RESTRICT,
  CONSTRAINT product_attribute_values_option_fk
    FOREIGN KEY ("optionId", "definitionId") REFERENCES attribute_options(id, "definitionId") ON DELETE RESTRICT
);

CREATE INDEX product_attribute_values_definition_option_idx
  ON product_attribute_values ("definitionId", "optionId");

CREATE TABLE product_variant_attribute_values (
  "variantId" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "optionId" TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'VARIANT' CHECK (scope = 'VARIANT'),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_variant_attribute_values_pk PRIMARY KEY ("variantId", "definitionId"),
  CONSTRAINT product_variant_attribute_values_variant_fk
    FOREIGN KEY ("variantId") REFERENCES product_variants(id) ON DELETE CASCADE,
  CONSTRAINT product_variant_attribute_values_definition_scope_fk
    FOREIGN KEY ("definitionId", scope) REFERENCES attribute_definitions(id, scope) ON DELETE RESTRICT,
  CONSTRAINT product_variant_attribute_values_option_fk
    FOREIGN KEY ("optionId", "definitionId") REFERENCES attribute_options(id, "definitionId") ON DELETE RESTRICT
);

CREATE INDEX product_variant_attribute_values_definition_option_idx
  ON product_variant_attribute_values ("definitionId", "optionId");

CREATE FUNCTION product_dictionary_check_type_applicability() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_product_type_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'product_attribute_values' THEN
    SELECT p."productTypeId" INTO current_product_type_id
    FROM products p WHERE p.id = NEW."productId";
  ELSE
    SELECT p."productTypeId" INTO current_product_type_id
    FROM product_variants v JOIN products p ON p.id = v."productId"
    WHERE v.id = NEW."variantId";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM product_type_attributes pta
    WHERE pta."productTypeId" = current_product_type_id
      AND pta."definitionId" = NEW."definitionId"
      AND pta.scope = NEW.scope
  ) THEN
    RAISE EXCEPTION 'attribute is not enabled for the product type' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_attribute_values_type_guard
  BEFORE INSERT OR UPDATE OF "productId", "definitionId" ON product_attribute_values
  FOR EACH ROW EXECUTE FUNCTION product_dictionary_check_type_applicability();

CREATE TRIGGER product_variant_attribute_values_type_guard
  BEFORE INSERT OR UPDATE OF "variantId", "definitionId" ON product_variant_attribute_values
  FOR EACH ROW EXECUTE FUNCTION product_dictionary_check_type_applicability();

CREATE TABLE product_lines (
  id TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "canonicalKey" TEXT NOT NULL,
  name TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_lines_brand_fk
    FOREIGN KEY ("brandId") REFERENCES brands(id) ON DELETE RESTRICT,
  CONSTRAINT product_lines_key_format CHECK ("canonicalKey" ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
  CONSTRAINT product_lines_brand_key_unique UNIQUE ("brandId", "canonicalKey"),
  CONSTRAINT product_lines_id_brand_unique UNIQUE (id, "brandId")
);

CREATE INDEX product_lines_active_order_idx
  ON product_lines ("brandId", "isActive", "sortOrder", name);

CREATE TABLE product_line_aliases (
  id TEXT PRIMARY KEY,
  "productLineId" TEXT NOT NULL,
  "aliasKey" TEXT NOT NULL,
  "aliasLabel" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_line_aliases_line_fk
    FOREIGN KEY ("productLineId") REFERENCES product_lines(id) ON DELETE CASCADE,
  CONSTRAINT product_line_aliases_key_not_empty CHECK (length(btrim("aliasKey")) > 0),
  CONSTRAINT product_line_aliases_label_not_empty CHECK (length(btrim("aliasLabel")) > 0),
  CONSTRAINT product_line_aliases_key_unique UNIQUE ("productLineId", "aliasKey")
);

CREATE INDEX product_line_aliases_line_idx ON product_line_aliases ("productLineId");

ALTER TABLE products ADD COLUMN "productLineId" TEXT;
ALTER TABLE products
  ADD CONSTRAINT products_product_line_brand_fk
  FOREIGN KEY ("productLineId", "brandId")
  REFERENCES product_lines(id, "brandId") ON DELETE RESTRICT;

CREATE INDEX products_product_line_idx ON products ("productLineId");

-- Product lines are created only when a matching real catalog product exists.
INSERT INTO product_lines (id, "brandId", "canonicalKey", name, "sortOrder")
SELECT line.id, p."brandId", line.key, line.name, line.ordering
FROM (VALUES
  ('pl_iphone', 'iphone', 'iPhone', 10, 'iphone-%'),
  ('pl_galaxy_s', 'galaxy-s', 'Galaxy S', 20, 'galaxy-s%'),
  ('pl_ipad_pro', 'ipad-pro', 'iPad Pro', 30, 'ipad-pro-%'),
  ('pl_dyson_v', 'dyson-v', 'Dyson V', 40, 'dyson-v%'),
  ('pl_playstation', 'playstation', 'PlayStation', 50, 'playstation-%')
) AS line(id, key, name, ordering, slug_pattern)
JOIN products p ON p.slug LIKE line.slug_pattern
GROUP BY line.id, line.key, line.name, line.ordering, p."brandId";

UPDATE products p SET "productLineId" = line.id, "updatedAt" = NOW()
FROM product_lines line
WHERE line."brandId" = p."brandId"
  AND ((line.id = 'pl_iphone' AND p.slug LIKE 'iphone-%')
    OR (line.id = 'pl_galaxy_s' AND p.slug LIKE 'galaxy-s%')
    OR (line.id = 'pl_ipad_pro' AND p.slug LIKE 'ipad-pro-%')
    OR (line.id = 'pl_dyson_v' AND p.slug LIKE 'dyson-v%')
    OR (line.id = 'pl_playstation' AND p.slug LIKE 'playstation-%'));

-- Legacy type applicability remains keyed by untouched product_types IDs.
INSERT INTO product_type_attributes ("productTypeId", "definitionId", scope, "sortOrder")
SELECT mapping."legacyProductTypeId", definition.id, definition.scope, definition."sortOrder"
FROM legacy_product_type_mappings mapping
JOIN global_product_types global_type ON global_type.id = mapping."globalProductTypeId"
JOIN LATERAL unnest(CASE global_type."canonicalKey"
  WHEN 'product_type:smartphone' THEN ARRAY['memory','ram','sim','connectivity','chip','region','condition']
  WHEN 'product_type:tablet' THEN ARRAY['memory','ram','sim','connectivity','chip','region','condition']
  WHEN 'product_type:console' THEN ARRAY['memory','connectivity','chip','region','condition','bundle']
  WHEN 'product_type:vacuum' THEN ARRAY['connectivity','material','region','condition','bundle']
  ELSE ARRAY[]::TEXT[] END) AS applicable(code) ON TRUE
JOIN attribute_definitions definition ON definition.code = applicable.code;

-- Backfill normalized links without rewriting legacy source columns or SKU rows.
INSERT INTO product_attribute_values ("productId", "definitionId", "optionId")
SELECT p.id, definition.id, option.id
FROM products p
JOIN attribute_definitions definition ON definition.code = 'chip' AND definition.scope = 'PRODUCT'
JOIN attribute_options option ON option."definitionId" = definition.id AND option.label = p.chip
WHERE p.chip IS NOT NULL;

INSERT INTO product_variant_attribute_values ("variantId", "definitionId", "optionId")
SELECT v.id, definition.id, option.id
FROM product_variants v
JOIN attribute_definitions definition ON definition.code = 'memory' AND definition.scope = 'VARIANT'
JOIN attribute_options option ON option."definitionId" = definition.id
  AND option."canonicalKey" = CASE lower(trim(v.storage))
    WHEN '128gb' THEN 'memory:128gb' WHEN '256' THEN 'memory:256gb' WHEN '256gb' THEN 'memory:256gb'
    WHEN '512gb' THEN 'memory:512gb' WHEN '1tb' THEN 'memory:1024gb' WHEN '1024gb' THEN 'memory:1024gb'
    WHEN '825gb' THEN 'memory:825gb' END
WHERE v.storage IS NOT NULL;

INSERT INTO product_variant_attribute_values ("variantId", "definitionId", "optionId")
SELECT v.id, definition.id, option.id
FROM product_variants v
JOIN attribute_definitions definition ON definition.code = 'ram' AND definition.scope = 'VARIANT'
JOIN attribute_options option ON option."definitionId" = definition.id
  AND option."canonicalKey" = CASE lower(trim(v.ram)) WHEN '8' THEN 'ram:8gb' WHEN '8gb' THEN 'ram:8gb' WHEN '12gb' THEN 'ram:12gb' END
WHERE v.ram IS NOT NULL;

INSERT INTO product_variant_attribute_values ("variantId", "definitionId", "optionId")
SELECT v.id, definition.id, option.id
FROM product_variants v
JOIN attribute_definitions definition ON definition.code = 'sim' AND definition.scope = 'VARIANT'
JOIN attribute_options option ON option."definitionId" = definition.id
  AND option."canonicalKey" = CASE lower(trim(v."simType"))
    WHEN 'sim' THEN 'sim:sim' WHEN 'esim' THEN 'sim:esim'
    WHEN 'esim + физическая sim' THEN 'sim:esim-physical-sim' END
WHERE v."simType" IS NOT NULL;

SELECT 'backfill_unmatched_storage=' || count(*) FROM product_variants v
WHERE v.storage IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM product_variant_attribute_values value
  JOIN attribute_definitions definition ON definition.id = value."definitionId" AND definition.code = 'memory'
  WHERE value."variantId" = v.id
);
SELECT 'backfill_unmatched_ram=' || count(*) FROM product_variants v
WHERE v.ram IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM product_variant_attribute_values value
  JOIN attribute_definitions definition ON definition.id = value."definitionId" AND definition.code = 'ram'
  WHERE value."variantId" = v.id
);
SELECT 'backfill_unmatched_sim=' || count(*) FROM product_variants v
WHERE v."simType" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM product_variant_attribute_values value
  JOIN attribute_definitions definition ON definition.id = value."definitionId" AND definition.code = 'sim'
  WHERE value."variantId" = v.id
);

COMMIT;
