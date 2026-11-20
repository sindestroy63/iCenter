BEGIN;

CREATE TABLE IF NOT EXISTS variant_gallery_images (
  id text PRIMARY KEY,
  "variantId" text NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  "mediaId" text NOT NULL REFERENCES media(id) ON DELETE RESTRICT,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT variant_gallery_images_variant_media_key UNIQUE ("variantId", "mediaId")
);

CREATE INDEX IF NOT EXISTS variant_gallery_images_media_id_idx
  ON variant_gallery_images ("mediaId");

CREATE INDEX IF NOT EXISTS variant_gallery_images_variant_order_idx
  ON variant_gallery_images ("variantId", "sortOrder");

COMMIT;
