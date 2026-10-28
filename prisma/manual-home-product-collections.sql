-- Prepared only. Do not apply automatically.
-- Verified against the local legacy best_offers layout on 2026-10-28.
BEGIN;

DO $$
BEGIN
  IF to_regclass('best_offers') IS NULL THEN
    RAISE EXCEPTION 'best_offers table is missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='best_offers'
      AND (column_name,data_type,is_nullable) NOT IN (
        ('id','text','NO'),('productId','text','NO'),('title','text','NO'),('description','text','YES'),
        ('discountPercent','integer','YES'),('sortOrder','integer','NO'),('isActive','boolean','NO'),
        ('createdAt','timestamp without time zone','NO'),('updatedAt','timestamp without time zone','NO')
        ,('variantId','text','YES')
      )
  ) THEN
    RAISE EXCEPTION 'best_offers legacy layout differs from the audited schema';
  END IF;
END $$;

ALTER TABLE best_offers ADD COLUMN IF NOT EXISTS "variantId" text NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='best_offers_variantId_fkey') THEN
    ALTER TABLE best_offers ADD CONSTRAINT "best_offers_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES product_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "best_offers_product_level_unique"
  ON best_offers ("productId") WHERE "variantId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "best_offers_variant_level_unique"
  ON best_offers ("variantId") WHERE "variantId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "best_offers_isActive_sortOrder_idx" ON best_offers ("isActive","sortOrder");

CREATE TABLE IF NOT EXISTS popular_products (
  id text PRIMARY KEY,
  "productId" text NOT NULL,
  "variantId" text NULL,
  "sortOrder" integer NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp without time zone NOT NULL DEFAULT NOW(),
  "updatedAt" timestamp without time zone NOT NULL DEFAULT NOW(),
  CONSTRAINT "popular_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "popular_products_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES product_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "popular_products_product_level_unique"
  ON popular_products ("productId") WHERE "variantId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "popular_products_variant_level_unique"
  ON popular_products ("variantId") WHERE "variantId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "popular_products_productId_idx" ON popular_products ("productId");
CREATE INDEX IF NOT EXISTS "popular_products_isActive_sortOrder_idx" ON popular_products ("isActive","sortOrder");

-- Product-level versus variant-level conflicts are serialized and rejected by the API.
-- Existing best_offers rows remain product-level because variantId is nullable.
COMMIT;
