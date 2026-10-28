-- Review-only compatibility patch for checkout requests.
-- Do not apply to production without schema review, backup, and deployment approval.
-- Existing orders remain readable through their legacy plaintext columns.

ALTER TABLE orders
  ALTER COLUMN "customerName" DROP NOT NULL,
  ALTER COLUMN "customerPhone" DROP NOT NULL,
  ADD COLUMN "encryptedPiiPayload" text,
  ADD COLUMN "cityId" text REFERENCES cities(id) ON DELETE RESTRICT,
  ADD COLUMN "consentAt" timestamptz,
  ADD COLUMN "consentVersion" text,
  ADD COLUMN "contactMethod" text;

ALTER TABLE order_attempts
  ADD COLUMN "orderId" text REFERENCES orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX "order_attempts_orderId_key" ON order_attempts ("orderId") WHERE "orderId" IS NOT NULL;

ALTER TABLE order_items
  ADD COLUMN "productNameSnapshot" text,
  ADD COLUMN "skuSnapshot" text,
  ADD COLUMN "variantSnapshot" jsonb;

CREATE INDEX "orders_cityId_createdAt_idx" ON orders ("cityId", "createdAt" DESC);

ALTER TABLE orders
  ADD CONSTRAINT "orders_checkout_pii_or_legacy_check"
  CHECK (
    ("encryptedPiiPayload" IS NOT NULL AND "customerName" IS NULL AND "customerPhone" IS NULL)
    OR ("encryptedPiiPayload" IS NULL AND "customerName" IS NOT NULL AND "customerPhone" IS NOT NULL)
  );

ALTER TABLE orders
  ADD CONSTRAINT "orders_checkout_consent_check"
  CHECK (
    ("encryptedPiiPayload" IS NULL AND "consentAt" IS NULL AND "consentVersion" IS NULL)
    OR ("encryptedPiiPayload" IS NOT NULL AND "consentAt" IS NOT NULL AND "consentVersion" IS NOT NULL)
  );

ALTER TABLE orders
  ADD CONSTRAINT "orders_checkout_contact_method_check"
  CHECK ("contactMethod" IS NULL OR "contactMethod" IN ('phone', 'telegram', 'max'));
