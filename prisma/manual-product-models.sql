-- MANUAL, NOT AUTO-APPLIED. Target: legacy PostgreSQL icenter_v2.
-- Additive only: supplies the product-model tables used by the admin API.
-- Review and apply to each environment only after schema/backup verification.
BEGIN;

CREATE TABLE IF NOT EXISTS product_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "globalProductTypeId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_models_brand_fk FOREIGN KEY ("brandId") REFERENCES brands(id) ON DELETE RESTRICT,
  CONSTRAINT product_models_type_fk FOREIGN KEY ("globalProductTypeId") REFERENCES global_product_types(id) ON DELETE RESTRICT
);

ALTER TABLE product_models ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE product_models ADD COLUMN IF NOT EXISTS "brandId" TEXT;
ALTER TABLE product_models ADD COLUMN IF NOT EXISTS "globalProductTypeId" TEXT;
ALTER TABLE product_models ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE product_models ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE product_models ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_models_brand_fk' AND conrelid='product_models'::regclass) THEN
    ALTER TABLE product_models ADD CONSTRAINT product_models_brand_fk FOREIGN KEY ("brandId") REFERENCES brands(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_models_type_fk' AND conrelid='product_models'::regclass) THEN
    ALTER TABLE product_models ADD CONSTRAINT product_models_type_fk FOREIGN KEY ("globalProductTypeId") REFERENCES global_product_types(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS product_models_active_name_idx
  ON product_models ("isActive", name);
CREATE INDEX IF NOT EXISTS product_models_brand_type_idx
  ON product_models ("brandId", "globalProductTypeId", "isActive", name);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM product_models WHERE name IS NULL OR "brandId" IS NULL OR "globalProductTypeId" IS NULL) THEN
    RAISE EXCEPTION 'product_models contains incomplete rows; review before applying NOT NULL constraints';
  END IF;
  ALTER TABLE product_models ALTER COLUMN name SET NOT NULL;
  ALTER TABLE product_models ALTER COLUMN "brandId" SET NOT NULL;
  ALTER TABLE product_models ALTER COLUMN "globalProductTypeId" SET NOT NULL;
END $$;

ALTER TABLE products ADD COLUMN IF NOT EXISTS "modelId" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_model_fk'
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_model_fk
      FOREIGN KEY ("modelId") REFERENCES product_models(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS products_model_idx ON products ("modelId");

COMMIT;
