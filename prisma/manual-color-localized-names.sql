-- Prepared additive migration for local approval. Do not run automatically.
-- The current legacy colors table stores English `name`; this nullable field
-- allows Russian labels without changing IDs, slugs, HEX values or relations.
BEGIN;
ALTER TABLE colors ADD COLUMN IF NOT EXISTS "nameRu" text;
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('black','Black','Черный'),
    ('black-titanium','Black Titanium','Черный титан'),
    ('blue','Blue','Синий'),
    ('blue-titanium','Blue Titanium','Синий титан'),
    ('natural-titanium','Natural Titanium','Натуральный титан'),
    ('pink','Pink','Розовый'),
    ('purple','Purple','Фиолетовый'),
    ('titanium','Titanium','Титановый'),
    ('white','White','Белый'),
    ('white-titanium','White Titanium','Белый титан')
  ) AS values_to_check(slug,name_en,name_ru)
  LOOP
    IF EXISTS (SELECT 1 FROM colors WHERE name=item.name_en AND slug<>item.slug) THEN
      RAISE EXCEPTION 'Cannot canonicalize color %: English name is already used',item.slug;
    END IF;
  END LOOP;
END $$;
UPDATE colors target SET name=source.name_en,"updatedAt"=NOW()
FROM (VALUES
  ('black','Black','Черный'),('black-titanium','Black Titanium','Черный титан'),
  ('blue','Blue','Синий'),('blue-titanium','Blue Titanium','Синий титан'),
  ('natural-titanium','Natural Titanium','Натуральный титан'),('pink','Pink','Розовый'),('purple','Purple','Фиолетовый'),
  ('titanium','Titanium','Титановый'),('white','White','Белый'),
  ('white-titanium','White Titanium','Белый титан')
) AS source(slug,name_en,name_ru)
WHERE target.slug=source.slug AND target.name=source.name_ru;
UPDATE colors target SET "nameRu"=source.name_ru,"updatedAt"=NOW()
FROM (VALUES
  ('black','Черный'),('black-titanium','Черный титан'),('blue','Синий'),
  ('blue-titanium','Синий титан'),('burgundy','Бордовый'),('glacier','Ледниковый'),
  ('natural-titanium','Натуральный титан'),('night-sky','Ночное небо'),('pink','Розовый'),('purple','Фиолетовый'),
  ('silver','Серебристый'),('star-white','Звездный белый'),('titanium','Титановый'),
  ('white','Белый'),('white-titanium','Белый титан')
) AS source(slug,name_ru)
WHERE target.slug=source.slug AND NULLIF(BTRIM(target."nameRu"),'') IS NULL;
COMMIT;
