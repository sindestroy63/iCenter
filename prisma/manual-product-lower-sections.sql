-- Additive support for product Trade-in banners, leads, and related products.
-- Targets the verified legacy icenter_v2 schema used by current raw-SQL APIs.
-- This file is manual, transactional, additive, and never run by the application.

BEGIN;

DO $$
DECLARE
  product_id_type text;
  city_id_type text;
BEGIN
  IF to_regclass('public.banners') IS NULL OR to_regclass('public.products') IS NULL OR to_regclass('public.cities') IS NULL THEN
    RAISE EXCEPTION 'Expected legacy tables banners, products, and cities are missing';
  END IF;
  IF EXISTS (
    SELECT required.column_name
    FROM (VALUES ('id'),('title'),('subtitle'),('linkUrl'),('linkText'),('imageMediaId'),('sortOrder'),('isActive'),('createdAt'),('updatedAt')) AS required(column_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name='banners' AND c.column_name=required.column_name
    )
  ) THEN
    RAISE EXCEPTION 'banners does not match the legacy banner API schema; reconcile the Prisma Banner model before applying';
  END IF;
  SELECT data_type INTO product_id_type FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='id';
  SELECT data_type INTO city_id_type FROM information_schema.columns WHERE table_schema='public' AND table_name='cities' AND column_name='id';
  IF product_id_type IS DISTINCT FROM 'text' OR city_id_type IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION 'Expected products.id and cities.id to be text for the foreign keys in this script';
  END IF;
END $$;

ALTER TABLE banners
  ADD COLUMN IF NOT EXISTS placement text NOT NULL DEFAULT 'home';

CREATE UNIQUE INDEX IF NOT EXISTS banners_product_trade_in_placement_uq
  ON banners (placement)
  WHERE placement = 'product_trade_in';

CREATE TABLE IF NOT EXISTS product_related_products (
  "productId" text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  "relatedProductId" text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  "sortOrder" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("productId", "relatedProductId"),
  UNIQUE ("productId", "sortOrder"),
  CHECK ("productId" <> "relatedProductId")
);

CREATE INDEX IF NOT EXISTS product_related_products_target_idx
  ON product_related_products ("relatedProductId");

CREATE TABLE IF NOT EXISTS trade_in_requests (
  id text PRIMARY KEY,
  "requestNumber" text NOT NULL UNIQUE,
  "idempotencyKey" text NOT NULL UNIQUE,
  "requestHash" text NOT NULL,
  "cityId" text NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
  "productId" text REFERENCES products(id) ON DELETE SET NULL,
  "productNameSnapshot" text,
  "encryptedPiiPayload" text NOT NULL,
  source text NOT NULL DEFAULT 'trade_in' CHECK (source = 'trade_in'),
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','PROCESSING','CONTACTED','COMPLETED','CANCELLED')),
  "consentAt" timestamptz NOT NULL,
  "consentVersion" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_in_requests_city_created_idx
  ON trade_in_requests ("cityId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS trade_in_requests_status_created_idx
  ON trade_in_requests (status, "createdAt" DESC);

COMMIT;
