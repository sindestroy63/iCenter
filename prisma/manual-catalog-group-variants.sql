-- Prepared only. Do not apply automatically.
-- Adds variant-level membership without changing existing group/product data.
BEGIN;

DO $$
BEGIN
  IF to_regclass('catalog_groups') IS NULL
     OR to_regclass('product_variants') IS NULL THEN
    RAISE EXCEPTION 'catalog_groups and product_variants must exist before catalog_group_variants';
  END IF;
  IF to_regclass('catalog_group_variants') IS NOT NULL THEN
    RAISE EXCEPTION 'catalog_group_variants already exists; review before reapplying manual-catalog-group-variants.sql';
  END IF;
END $$;

CREATE TABLE catalog_group_variants (
  "groupId" text NOT NULL REFERENCES catalog_groups(id) ON DELETE CASCADE,
  "variantId" text NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("groupId", "variantId")
);

CREATE INDEX catalog_group_variants_order_idx ON catalog_group_variants ("groupId", "sortOrder");
CREATE INDEX catalog_group_variants_variant_idx ON catalog_group_variants ("variantId");

COMMIT;
