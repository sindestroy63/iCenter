import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireGlobalAdminMutation,
  requireGlobalAdminSession,
} from "@/lib/auth";
import { adminDb, newId } from "@/lib/admin-db";
import { saveImages, saveVariants } from "@/lib/admin-product-write";

export const dynamic = "force-dynamic";

const variantDictionaryFields = {
  storage: "memory",
  ram: "ram",
  simType: "sim",
  connectivity: "connectivity",
  size: "size",
  material: "material",
} as const;
const productDictionaryCodes = new Set(["chip", "condition"]);

async function syncDictionaryLinks(
  tx: any,
  productId: string,
  variants: any[],
  product: any,
) {
  const definitions = await tx.$queryRaw<
    any[]
  >`SELECT id, code, scope, "isActive" FROM attribute_definitions`;
  const byCode = new Map<
    string,
    { id: string; code: string; scope: string; isActive: boolean }
  >(
    definitions.map(
      (row: { id: string; code: string; scope: string; isActive: boolean }) => [
        row.code,
        row,
      ],
    ),
  );
  for (const code of Object.keys(product.dictionaryOptionIds ?? {}))
    if (!productDictionaryCodes.has(code))
      throw new Error("INVALID_DICTIONARY_REFERENCE");
  const saveOption = async (
    code: string,
    optionId: string,
    ownerId: string,
    scope: "PRODUCT" | "VARIANT",
  ) => {
    const definition = byCode.get(code);
    if (!definition || definition.scope !== scope || !definition.isActive)
      throw new Error("INVALID_DICTIONARY_REFERENCE");
    const valid = await tx.$queryRaw<
      any[]
    >`SELECT id,label FROM attribute_options WHERE id=${optionId} AND "definitionId"=${definition.id} AND "isActive"=TRUE`;
    if (!valid[0]) throw new Error("INVALID_DICTIONARY_REFERENCE");
    if (scope === "PRODUCT") {
      const applicable = await tx.$queryRaw<
        any[]
      >`SELECT 1 FROM product_type_attributes WHERE "productTypeId"=${product.productTypeId} AND "definitionId"=${definition.id} LIMIT 1`;
      if (!applicable.length) throw new Error("ATTRIBUTE_NOT_APPLICABLE");
    }
    if (scope === "PRODUCT")
      await tx.$executeRaw`INSERT INTO product_attribute_values ("productId","definitionId","optionId") VALUES (${ownerId},${definition.id},${optionId}) ON CONFLICT ("productId","definitionId") DO UPDATE SET "optionId"=EXCLUDED."optionId","updatedAt"=NOW()`;
    else
      await tx.$executeRaw`INSERT INTO product_variant_attribute_values ("variantId","definitionId","optionId") VALUES (${ownerId},${definition.id},${optionId}) ON CONFLICT ("variantId","definitionId") DO UPDATE SET "optionId"=EXCLUDED."optionId","updatedAt"=NOW()`;
    return valid[0].label as string;
  };
  for (const [code, optionId] of Object.entries(
    product.dictionaryOptionIds ?? {},
  )) {
    if (!optionId) {
      const definition = byCode.get(code);
      if (!definition || definition.scope !== "PRODUCT")
        throw new Error("INVALID_DICTIONARY_REFERENCE");
      await tx.$executeRaw`DELETE FROM product_attribute_values WHERE "productId"=${productId} AND "definitionId"=${definition.id}`;
      continue;
    }
    const label = await saveOption(
      code,
      optionId as string,
      productId,
      "PRODUCT",
    );
    if (code === "chip") {
      product.chip = label;
      await tx.$executeRaw`UPDATE products SET chip=${label} WHERE id=${productId}`;
    } else {
      product.specifications = { ...product.specifications, [code]: label };
      await tx.$executeRaw`UPDATE products SET specifications=${JSON.stringify(product.specifications)}::jsonb WHERE id=${productId}`;
    }
  }
  for (const variant of variants) {
    if (!variant.id) continue;
    const entries = Object.entries(variant.dictionaryOptionIds ?? {});
    const selectedDefinitions = new Map<
      string,
      { code: string; optionId: string; definitionId: string }
    >();
    for (const [code, optionId] of entries) {
      if (!optionId) {
        const definition = byCode.get(code);
        if (!definition || definition.scope !== "VARIANT")
          throw new Error("INVALID_DICTIONARY_REFERENCE");
        continue;
      }
      const definition = byCode.get(code);
      if (
        !definition ||
        definition.scope !== "VARIANT" ||
        !definition.isActive ||
        selectedDefinitions.has(definition.id)
      )
        throw new Error("INVALID_DICTIONARY_REFERENCE");
      selectedDefinitions.set(definition.id, {
        code,
        optionId: optionId as string,
        definitionId: definition.id,
      });
    }
    const existing = await tx.$queryRaw<
      any[]
    >`SELECT "definitionId" FROM product_variant_attribute_values WHERE "variantId"=${variant.id}`;
    for (const row of existing)
      if (!selectedDefinitions.has(row.definitionId)) {
        await tx.$executeRaw`DELETE FROM product_variant_attribute_values WHERE "variantId"=${variant.id} AND "definitionId"=${row.definitionId}`;
      }
    for (const { code, optionId } of Array.from(selectedDefinitions.values())) {
      const label = await saveOption(code, optionId, variant.id, "VARIANT");
      const field = Object.entries(variantDictionaryFields).find(
        ([, dictionary]) => dictionary === code,
      )?.[0];
      if (field) {
        variant[field] = label;
        const column =
          field === "simType"
            ? tx.$executeRaw`UPDATE product_variants SET "simType"=${label} WHERE id=${variant.id}`
            : field === "storage"
              ? tx.$executeRaw`UPDATE product_variants SET storage=${label} WHERE id=${variant.id}`
              : field === "ram"
                ? tx.$executeRaw`UPDATE product_variants SET ram=${label} WHERE id=${variant.id}`
                : field === "connectivity"
                  ? tx.$executeRaw`UPDATE product_variants SET connectivity=${label} WHERE id=${variant.id}`
                  : field === "size"
                    ? tx.$executeRaw`UPDATE product_variants SET size=${label} WHERE id=${variant.id}`
                    : tx.$executeRaw`UPDATE product_variants SET material=${label} WHERE id=${variant.id}`;
        await column;
      } else {
        variant.attributes = { ...variant.attributes, [code]: label };
        await tx.$executeRaw`UPDATE product_variants SET attributes=${JSON.stringify(variant.attributes)}::jsonb WHERE id=${variant.id}`;
      }
    }
  }
}
const priceSchema = z.object({
  cityId: z.string().min(1),
  price: z.number().finite().nonnegative().nullable(),
  oldPrice: z.number().finite().nonnegative().nullable().optional(),
  availability: z.enum(["UNSPECIFIED", "IN_STOCK", "PREORDER", "OUT_OF_STOCK"]),
  allowPreorder: z.boolean().default(false),
  deliveryTime: z.string().max(180).nullable().optional(),
});
const dictionaryIdsSchema = z
  .record(z.string().min(1), z.string().min(1).max(100).nullable())
  .default({});
const variantSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().max(180).optional(),
  colorId: z.string().nullable().optional(),
  storage: z.string().max(100).nullable().optional(),
  ram: z.string().max(100).nullable().optional(),
  simType: z.string().max(100).nullable().optional(),
  connectivity: z.string().max(100).nullable().optional(),
  size: z.string().max(100).nullable().optional(),
  material: z.string().max(100).nullable().optional(),
  dictionaryOptionIds: dictionaryIdsSchema,
  attributes: z.record(z.string(), z.unknown()).default({}),
  active: z.boolean().default(true),
  inventory: z.array(priceSchema).max(8).default([]),
});
const imageSchema = z.object({
  mediaId: z.string().min(1),
  colorId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000),
});
const productSchema = z
  .object({
    name: z.string().trim().min(1).max(240),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    brandId: z.string().min(1),
    productTypeId: z.string().optional().default(""),
    globalProductTypeId: z.string().optional().default(""),
    productLineId: z.string().nullable().optional(),
    categoryId: z.string().min(1),
    modelId: z.string().nullable().optional(),
    model: z.string().max(180).nullable().optional(),
    generation: z.string().max(180).nullable().optional(),
    chip: z.string().max(180).nullable().optional(),
    displaySize: z.string().max(100).nullable().optional(),
    releaseYear: z.number().int().min(1900).max(2200).nullable().optional(),
    dictionaryOptionIds: dictionaryIdsSchema,
    description: z.string().max(10000).default(""),
    specifications: z.record(z.string(), z.unknown()).default({}),
    isNew: z.boolean().default(false),
    status: z
      .enum(["DRAFT", "PUBLISHED", "HIDDEN", "ARCHIVED"])
      .default("DRAFT"),
    relatedProductIds: z.array(z.string().min(1).max(120)).max(12).default([]),
    variants: z.array(variantSchema).min(1).max(100),
    images: z.array(imageSchema).max(100).default([]),
  })
  .superRefine((product, context) => {
    if (
      new Set(product.relatedProductIds).size !==
      product.relatedProductIds.length
    )
      context.addIssue({
        code: "custom",
        path: ["relatedProductIds"],
        message: "duplicate related product",
      });
    product.variants.forEach((variant, index) => {
      const selected = Object.entries(variant.dictionaryOptionIds).filter(
        ([, id]) => id,
      );
      const selectedIds = selected.map(([, id]) => id);
      if (new Set(selectedIds).size !== selectedIds.length)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["variants", index, "dictionaryOptionIds"],
          message:
            "Одно значение справочника нельзя назначить нескольким характеристикам.",
        });
    });
    for (const [code, id] of Object.entries(product.dictionaryOptionIds))
      if (id && !productDictionaryCodes.has(code))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dictionaryOptionIds", code],
          message: "Неизвестный код характеристики товара.",
        });
  });

async function resolveProductModel(
  tx: any,
  product: { modelId?: string | null; brandId: string; productTypeId?: string },
  currentModelId?: string | null,
) {
  if (!product.modelId) return null;
  const rows = await tx.$queryRaw<any[]>`
    SELECT m.id,m.name,m."isActive"
    FROM product_models m
    JOIN legacy_product_type_mappings mapping ON mapping."globalProductTypeId"=m."globalProductTypeId"
    JOIN global_product_types g ON g.id=m."globalProductTypeId" AND g."isActive"=TRUE
    JOIN global_product_type_brands link ON link."productTypeId"=g.id AND link."brandId"=m."brandId"
    WHERE m.id=${product.modelId} AND m."brandId"=${product.brandId} AND mapping."legacyProductTypeId"=${product.productTypeId ?? ""}
    LIMIT 1
  `;
  if (!rows.length || (!rows[0].isActive && currentModelId !== product.modelId))
    throw new Error("INVALID_MODEL_REFERENCE");
  return rows[0] as { id: string; name: string; isActive: boolean };
}

async function syncRelatedProducts(
  tx: any,
  productId: string,
  relatedProductIds: string[],
) {
  if (relatedProductIds.includes(productId))
    throw new Error("INVALID_RELATED_PRODUCTS");
  const relation = await tx.$queryRaw<Array<{ relation: string | null }>>`
    SELECT to_regclass('public.product_related_products')::text AS relation
  `;
  if (!relation[0]?.relation) {
    if (relatedProductIds.length)
      throw new Error("RELATED_PRODUCTS_SCHEMA_REQUIRED");
    return;
  }
  if (relatedProductIds.length) {
    const valid = await tx.$queryRaw<any[]>`
      SELECT p.id FROM products p
      WHERE p.id=ANY(${relatedProductIds}::text[])
        AND p.status='PUBLISHED'::"ProductStatus"
        AND EXISTS (
          SELECT 1 FROM product_variants v JOIN inventory i ON i."variantId"=v.id AND i."isActive"=TRUE
          WHERE v."productId"=p.id AND v."isActive"=TRUE
        )
    `;
    if (valid.length !== relatedProductIds.length)
      throw new Error("INVALID_RELATED_PRODUCTS");
  }
  await tx.$executeRaw`DELETE FROM product_related_products WHERE "productId"=${productId}`;
  for (
    let sortOrder = 0;
    sortOrder < relatedProductIds.length;
    sortOrder += 1
  ) {
    const relatedProductId = relatedProductIds[sortOrder];
    await tx.$executeRaw`INSERT INTO product_related_products ("productId","relatedProductId","sortOrder") VALUES (${productId},${relatedProductId},${sortOrder})`;
  }
}
function slugFromName(value: string) {
  const translit: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "yo",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya",
  };
  return (
    value
      .toLowerCase()
      .replace(/[а-яё]/g, (char) => translit[char] ?? "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "product"
  );
}

async function uniqueSlug(tx: any, name: string) {
  const normalized = slugFromName(name);
  for (let suffix = 0; suffix < 10000; suffix++) {
    const candidate = suffix === 0 ? normalized : `${normalized}-${suffix + 1}`;
    const found = await tx.$queryRaw<
      any[]
    >`SELECT id FROM products WHERE slug=${candidate} LIMIT 1`;
    if (!found.length) return candidate;
  }
  throw new Error("DUPLICATE_SLUG");
}

function validationMessage(error: z.ZodError) {
  const issue = error.issues[0];
  const path = issue?.path.join(".") ?? "";
  if (path === "slug")
    return "Slug должен содержать латинские буквы, цифры и дефисы.";
  if (path === "name") return "Укажите название товара (до 240 символов).";
  if (/^variants\.\d+\.inventory\.\d+\.(price|oldPrice)$/.test(path))
    return "Проверьте цены: укажите число не меньше нуля или оставьте поле пустым.";
  if (/^variants\.\d+\.inventory\.\d+\.cityId$/.test(path))
    return "Не удалось определить город у одной из цен.";
  if (/^variants\.\d+\.inventory/.test(path))
    return "Проверьте цену и доступность варианта по городам.";
  if (/^variants\.\d+\.colorId$/.test(path))
    return "Выбранный цвет имеет неверный формат.";
  if (/^variants/.test(path))
    return "Проверьте обязательные поля варианта и его характеристики.";
  if (/^images/.test(path))
    return "Проверьте выбранные фотографии, цвет и порядок сортировки.";
  return "Проверьте обязательные поля товара, цены и фотографии.";
}

function mutationFailure(error: unknown, action: "create" | "update") {
  if (error instanceof Error && error.message === "INVALID_RELATED_PRODUCTS")
    return { status: 400, message: "INVALID_RELATED_PRODUCTS" };
  if (
    error instanceof Error &&
    error.message === "RELATED_PRODUCTS_SCHEMA_REQUIRED"
  )
    return {
      status: 503,
      message:
        "Схема сопутствующих товаров ещё не применена. Сохранение без выбранных сопутствующих товаров доступно после обновления страницы.",
    };
  if (
    error instanceof Error &&
    error.message === "INVALID_PRODUCT_TYPE_MAPPING"
  )
    return {
      status: 400,
      message:
        "Выбранный глобальный тип не имеет однозначной legacy-связи для этого бренда.",
    };
  if (
    error instanceof Error &&
    error.message === "INVALID_DICTIONARY_REFERENCE"
  )
    return {
      status: 400,
      message:
        "Выбранное значение справочника недоступно или архивировано. Обновите список справочников.",
    };
  if (error instanceof Error && error.message === "ATTRIBUTE_NOT_APPLICABLE")
    return {
      status: 400,
      message: "Эта характеристика неприменима к выбранному типу товара.",
    };
  const value =
    error && typeof error === "object"
      ? (error as {
          name?: unknown;
          code?: unknown;
          meta?: {
            code?: unknown;
            constraint?: unknown;
            target?: unknown;
            message?: unknown;
          };
        })
      : {};
  const prismaCode = typeof value.code === "string" ? value.code : "";
  const databaseCode =
    typeof value.meta?.code === "string" ? value.meta.code : "";
  const code = /^[0-9A-Z]{5}$/.test(databaseCode)
    ? databaseCode
    : prismaCode || databaseCode;
  const rawConstraint =
    typeof value.meta?.constraint === "string"
      ? value.meta.constraint
      : Array.isArray(value.meta?.target)
        ? value.meta.target
            .filter((item): item is string => typeof item === "string")
            .join(",")
        : "";
  const embeddedConstraint =
    typeof value.meta?.message === "string"
      ? value.meta.message.match(/constraint \"([A-Za-z0-9_]+)\"/)?.[1]
      : undefined;
  const constraint = rawConstraint || embeddedConstraint || "";
  if (error instanceof Error) {
    const known = new Map<string, readonly [number, string]>([
      ["UNAUTHORIZED", [401, "Требуется вход."]],
      [
        "CSRF_INVALID",
        [
          403,
          "Проверка CSRF не пройдена. Обновите страницу и войдите повторно.",
        ],
      ],
      ["NOT_FOUND", [404, "Товар не найден."]],
      ["DUPLICATE_SLUG", [409, "Этот slug уже используется другим товаром."]],
      [
        "DUPLICATE_IMAGE",
        [400, "Одно и то же фото нельзя добавить в одну галерею дважды."],
      ],
      [
        "INVALID_REFERENCE",
        [
          400,
          "Выбранный бренд, тип товара или категория больше недоступны. Обновите страницу и выберите их снова.",
        ],
      ],
      [
        "INVALID_CITY",
        [400, "Одна из выбранных цен ссылается на недоступный город."],
      ],
      [
        "INVALID_COLOR",
        [
          400,
          "Один из выбранных цветов больше недоступен. Обновите страницу и выберите цвет снова.",
        ],
      ],
      [
        "INVALID_VARIANT",
        [
          400,
          "Вариант товара устарел или не принадлежит этому товару. Перезагрузите каталог.",
        ],
      ],
      [
        "INVALID_MEDIA",
        [
          400,
          "Одно из фото больше недоступно в медиатеке. Обновите список фотографий.",
        ],
      ],
    ]);
    if (error.message === "INVALID_MODEL_REFERENCE")
      return {
        status: 400,
        message:
          "Выбранная модель неактивна или не соответствует бренду и типу товара.",
      };
    const result = known.get(error.message);
    if (result) return { status: result[0], message: result[1] };
  }
  console.error("admin product mutation failed", {
    action,
    name: typeof value.name === "string" ? value.name : "UnknownError",
    code: code || undefined,
    constraint: constraint || undefined,
  });
  if (
    (code === "23505" || code === "P2002" || code === "P2010") &&
    (constraint.includes("product_gallery_images_productId_mediaId") ||
      constraint.includes("color_gallery_images_colorGalleryId_mediaId"))
  )
    return {
      status: 400,
      message: "Одно и то же фото нельзя добавить в одну галерею дважды.",
    };
  if (code === "23505" || code === "P2002" || code === "P2010")
    return {
      status: 409,
      message: constraint.toLowerCase().includes("sku")
        ? "SKU уже используется. Проверьте варианты товара."
        : constraint.toLowerCase().includes("slug")
          ? "Такой slug уже используется другим товаром."
          : "Данные конфликтуют с уже существующей записью. Проверьте slug и варианты.",
    };
  if (code === "23503" || code === "P2003")
    return {
      status: 400,
      message:
        "Сохранение отклонено: связанный бренд, тип, категория, вариант, город или фото больше недоступны. Обновите данные и повторите.",
    };
  if (code === "22P02")
    return {
      status: 400,
      message:
        "Одно из значений не поддерживается базой данных. Проверьте статус товара и доступность.",
    };
  if (code === "23502" || code === "P2011")
    return {
      status: 400,
      message: "Не заполнено обязательное поле товара или варианта.",
    };
  if (
    ["P2028", "P2024"].includes(code) ||
    prismaCode === "P2028" ||
    prismaCode === "P2024"
  )
    return {
      status: 503,
      message:
        "База данных не завершила сохранение вовремя. Данные не применены; повторите попытку.",
    };
  if (["40001", "40P01"].includes(code) || prismaCode === "P2034")
    return {
      status: 409,
      message:
        "Данные одновременно изменились. Обновите каталог и повторите сохранение.",
    };
  return {
    status: 500,
    message: `Не удалось ${action === "create" ? "создать" : "сохранить"} товар из-за ошибки базы данных. Повторите попытку; если ошибка повторится, передайте код ${code || "без кода"} поддержке.`,
  };
}

export async function GET() {
  try {
    await requireGlobalAdminSession();
    const db = adminDb();
    const rows = await db.$queryRaw<any[]>`
      SELECT p.id, p.name, p.slug, p."brandId", b.name AS "brandName", p."productTypeId", g.name AS "typeName", mapping."globalProductTypeId" AS "globalTypeId", p."productLineId", p."categoryId", c.name AS "categoryName", p."modelId", pm.name AS "linkedModelName", pm."isActive" AS "linkedModelActive", p.model, p.generation, p.chip, p."displaySize", p."releaseYear", p.description, p.specifications, p."isNew", p.status::text AS status,
        v.id AS "variantId", v.sku, v.label, v."colorId", co.name AS "colorName", to_jsonb(co)->>'nameRu' AS "colorNameRu", v.storage, v.ram, v."simType", v.connectivity, v.size, v.material, v.attributes AS "variantAttributes", v."isActive" AS "variantActive",
        i.id AS "inventoryId", i."cityId", ci.name AS "cityName", ci.slug AS "citySlug", i.price::text AS price, i."oldPrice"::text AS "oldPrice", i.availability::text AS availability, i."allowPreorder", i."deliveryTime",
        pg."mediaId" AS "mediaId", pg."sortOrder" AS "imageOrder", NULL::text AS "imageColorId", m."storagePath", m.alt AS "imageAlt"
      FROM products p JOIN brands b ON b.id=p."brandId" JOIN product_types pt ON pt.id=p."productTypeId" LEFT JOIN legacy_product_type_mappings mapping ON mapping."legacyProductTypeId"=pt.id LEFT JOIN global_product_types g ON g.id=mapping."globalProductTypeId" JOIN categories c ON c.id=p."categoryId"
      LEFT JOIN product_models pm ON pm.id=p."modelId"
      LEFT JOIN product_variants v ON v."productId"=p.id
      LEFT JOIN colors co ON co.id=v."colorId"
      LEFT JOIN inventory i ON i."variantId"=v.id
      LEFT JOIN cities ci ON ci.id=i."cityId"
      LEFT JOIN product_gallery_images pg ON pg."productId"=p.id
      LEFT JOIN media m ON m.id=pg."mediaId"
      ORDER BY p.name, v.sku, ci.name, pg."sortOrder"
    `;
    const relatedTable = await db.$queryRaw<Array<{ relation: string | null }>>`
      SELECT to_regclass('public.product_related_products')::text AS relation
    `;
    const relatedRows = relatedTable[0]?.relation
      ? await db.$queryRaw<
          any[]
        >`SELECT "productId","relatedProductId" FROM product_related_products ORDER BY "productId","sortOrder"`
      : [];
    const [
      brands,
      types,
      categories,
      colors,
      cities,
      colorImages,
      productLines,
      models,
    ] = await Promise.all([
      db.$queryRaw<
        any[]
      >`SELECT id,name,slug FROM brands WHERE "isActive"=TRUE ORDER BY "sortOrder",name`,
      db.$queryRaw<
        any[]
      >`SELECT pt.id,g.name,pt.slug,pt."brandId",pt."variantAttributes",g.id AS "globalTypeId",g."canonicalKey" AS "globalTypeKey" FROM product_types pt JOIN legacy_product_type_mappings mapping ON mapping."legacyProductTypeId"=pt.id JOIN global_product_types g ON g.id=mapping."globalProductTypeId" JOIN global_product_type_brands link ON link."productTypeId"=g.id AND link."brandId"=pt."brandId" WHERE pt."isActive"=TRUE AND g."isActive"=TRUE ORDER BY g."sortOrder",g.name,pt."sortOrder"`,
      db.$queryRaw<
        any[]
      >`SELECT id,name,slug,"parentId" FROM categories WHERE "isActive"=TRUE ORDER BY "sortOrder",name`,
      db.$queryRaw<
        any[]
      >`SELECT id,name,name AS "nameEn",to_jsonb(colors)->>'nameRu' AS "nameRu",slug,"hexPrimary" FROM colors WHERE "isActive"=TRUE ORDER BY "sortOrder",name`,
      db.$queryRaw<
        any[]
      >`SELECT id,name,slug FROM cities WHERE "isActive"=TRUE ORDER BY name`,
      db.$queryRaw<
        any[]
      >`SELECT cg."productId", cgi."mediaId", cg."colorId", cgi."sortOrder", m."storagePath", m.alt FROM color_galleries cg JOIN color_gallery_images cgi ON cgi."colorGalleryId"=cg.id JOIN media m ON m.id=cgi."mediaId" ORDER BY cgi."sortOrder"`,
      db.$queryRaw<
        any[]
      >`SELECT id,"brandId","canonicalKey",name,"sortOrder","isActive" FROM product_lines WHERE "isActive"=TRUE ORDER BY "brandId","sortOrder",name`,
      db.$queryRaw<
        any[]
      >`SELECT m.id,m.name,m."brandId",m."globalProductTypeId",m."isActive" FROM product_models m WHERE m."isActive"=TRUE OR EXISTS (SELECT 1 FROM products p WHERE p."modelId"=m.id) ORDER BY m.name`,
    ]);
    const [productAttributeRows, variantAttributeRows] = await Promise.all([
      db.$queryRaw<
        any[]
      >`SELECT v."productId",d.code,v."optionId" FROM product_attribute_values v JOIN attribute_definitions d ON d.id=v."definitionId"`,
      db.$queryRaw<
        any[]
      >`SELECT pv."variantId",d.code,pv."optionId" FROM product_variant_attribute_values pv JOIN attribute_definitions d ON d.id=pv."definitionId"`,
    ]);
    const productDictionaryIds = new Map<string, Record<string, string>>();
    for (const row of productAttributeRows)
      productDictionaryIds.set(row.productId, {
        ...productDictionaryIds.get(row.productId),
        [row.code]: row.optionId,
      });
    const variantDictionaryIds = new Map<string, Record<string, string>>();
    for (const row of variantAttributeRows)
      variantDictionaryIds.set(row.variantId, {
        ...variantDictionaryIds.get(row.variantId),
        [row.code]: row.optionId,
      });
    const products = new Map<string, any>();
    for (const row of rows) {
      let product = products.get(row.id);
      if (!product) {
        product = {
          id: row.id,
          name: row.name,
          slug: row.slug,
          brandId: row.brandId,
          brandName: row.brandName,
          productTypeId: row.productTypeId,
          globalProductTypeId: row.globalTypeId ?? "",
          typeName: row.typeName,
          productLineId: row.productLineId ?? null,
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          modelId: row.modelId ?? null,
          linkedModelName: row.linkedModelName ?? null,
          linkedModelActive: row.linkedModelActive ?? null,
          model: row.model,
          generation: row.generation,
          chip: row.chip,
          displaySize: row.displaySize,
          releaseYear: row.releaseYear,
          description:
            typeof row.description === "string"
              ? row.description
              : (row.description?.text ?? ""),
          specifications: row.specifications ?? {},
          dictionaryOptionIds: {},
          relatedProductIds: [],
          isNew: row.isNew,
          status: row.status,
          variants: new Map<string, any>(),
          images: new Map<string, any>(),
        };
        products.set(row.id, product);
      }
      if (row.variantId) {
        let variant = product.variants.get(row.variantId);
        if (!variant) {
          variant = {
            id: row.variantId,
            sku: row.sku,
            label: row.label,
            colorId: row.colorId,
            colorName: row.colorName,
            colorNameRu: row.colorNameRu,
            storage: row.storage,
            ram: row.ram,
            simType: row.simType,
            connectivity: row.connectivity,
            size: row.size,
            material: row.material,
            attributes: row.variantAttributes ?? {},
            dictionaryOptionIds: {},
            active: row.variantActive,
            inventory: new Map(),
          };
          product.variants.set(row.variantId, variant);
        }
        if (row.inventoryId)
          variant.inventory.set(row.cityId, {
            cityId: row.cityId,
            cityName: row.cityName,
            citySlug: row.citySlug,
            price: row.price === null ? null : Number(row.price),
            oldPrice: row.oldPrice === null ? null : Number(row.oldPrice),
            availability: row.availability,
            allowPreorder: row.allowPreorder,
            deliveryTime: row.deliveryTime,
          });
      }
      if (row.mediaId)
        product.images.set(row.mediaId, {
          mediaId: row.mediaId,
          colorId: null,
          sortOrder: row.imageOrder,
          url: `/${row.storagePath}`,
          alt: row.imageAlt ?? "",
        });
    }
    for (const link of relatedRows) {
      const product = products.get(link.productId);
      if (product) product.relatedProductIds.push(link.relatedProductId);
    }
    for (const image of colorImages) {
      const product = products.get(image.productId);
      if (product)
        product.images.set(`${image.colorId}:${image.mediaId}`, {
          mediaId: image.mediaId,
          colorId: image.colorId,
          sortOrder: image.sortOrder,
          url: `/${image.storagePath}`,
          alt: image.alt ?? "",
        });
    }
    products.forEach((product, id) => {
      product.dictionaryOptionIds = productDictionaryIds.get(id) ?? {};
      for (const variant of product.variants.values())
        variant.dictionaryOptionIds =
          variantDictionaryIds.get(variant.id) ?? {};
    });
    return NextResponse.json({
      data: Array.from(products.values()).map((p: any) => ({
        ...p,
        variants: Array.from((p.variants as Map<string, any>).values()).map(
          (v: any) => ({
            ...v,
            inventory: Array.from((v.inventory as Map<string, any>).values()),
          }),
        ),
        images: Array.from((p.images as Map<string, any>).values()),
      })),
      options: {
        brands,
        types,
        categories,
        colors,
        cities,
        productLines,
        models,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status =
      message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 503;
    if (status === 503)
      console.error("admin products read failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        code:
          typeof error === "object" && error !== null && "code" in error
            ? (error as { code?: unknown }).code
            : undefined,
      });
    return NextResponse.json(
      {
        error:
          status === 401
            ? "Требуется вход."
            : status === 403
              ? "Недостаточно прав."
              : "Не удалось загрузить каталог для управления.",
      },
      { status },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireGlobalAdminMutation(request);
    const parsed = productSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: validationMessage(parsed.error) },
        { status: 400 },
      );
    const product = parsed.data;
    const db = adminDb();
    await db.$transaction(
      async (tx) => {
        const [brand, type, category, line] = await Promise.all([
          tx.$queryRaw<
            any[]
          >`SELECT id FROM brands WHERE id=${product.brandId} AND "isActive"=TRUE`,
          tx.$queryRaw<
            any[]
          >`SELECT pt.id FROM product_types pt JOIN legacy_product_type_mappings mapping ON mapping."legacyProductTypeId"=pt.id JOIN global_product_types g ON g.id=mapping."globalProductTypeId" JOIN global_product_type_brands link ON link."productTypeId"=g.id AND link."brandId"=${product.brandId} WHERE pt.id=${product.productTypeId} AND pt."isActive"=TRUE AND g."isActive"=TRUE AND pt."brandId"=${product.brandId}`,
          tx.$queryRaw<
            any[]
          >`SELECT id FROM categories WHERE id=${product.categoryId} AND "isActive"=TRUE`,
          product.productLineId
            ? tx.$queryRaw<
                any[]
              >`SELECT id FROM product_lines WHERE id=${product.productLineId} AND "brandId"=${product.brandId} AND "isActive"=TRUE`
            : Promise.resolve([{ id: null }]),
        ]);
        if (!brand.length || !type.length || !category.length || !line.length)
          throw new Error("INVALID_REFERENCE");
        const selectedModel = await resolveProductModel(tx, product);
        const slug = await uniqueSlug(tx, product.name);
        const id = newId();
        await tx.$executeRaw`INSERT INTO products (id,name,slug,"brandId","productTypeId","productLineId","categoryId","modelId",model,generation,chip,"displaySize","releaseYear",description,specifications,"isNew",status,"updatedAt") VALUES (${id},${product.name},${slug},${product.brandId},${product.productTypeId},${product.productLineId ?? null},${product.categoryId},${selectedModel?.id ?? null},${selectedModel?.name ?? product.model ?? null},${product.generation ?? null},${product.chip ?? null},${product.displaySize ?? null},${product.releaseYear ?? null},${JSON.stringify({ text: product.description })}::jsonb,${JSON.stringify(product.specifications)}::jsonb,${product.isNew},${product.status}::"ProductStatus",NOW())`;
        const savedVariantIds = await saveVariants(tx, id, product.variants);
        await syncDictionaryLinks(
          tx,
          id,
          product.variants.map((item, index) => ({
            ...item,
            id: item.id ?? savedVariantIds[index],
          })),
          product,
        );
        await saveImages(tx, id, product.images);
        await syncRelatedProducts(tx, id, product.relatedProductIds);
      },
      { maxWait: 10000, timeout: 30000 },
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const failure = mutationFailure(error, "create");
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireGlobalAdminMutation(request);
    const body = (await request.json()) as { id?: string; data?: unknown };
    if (!body.id || typeof body.id !== "string")
      return NextResponse.json({ error: "Не указан товар." }, { status: 400 });
    const parsed = productSchema.safeParse(body.data);
    if (!parsed.success)
      return NextResponse.json(
        { error: validationMessage(parsed.error) },
        { status: 400 },
      );
    const product = parsed.data;
    const db = adminDb();
    const productId = body.id;
    await db.$transaction(
      async (tx) => {
        const exists = await tx.$queryRaw<
          any[]
        >`SELECT id FROM products WHERE id=${productId} LIMIT 1`;
        if (!exists.length) throw new Error("NOT_FOUND");
        const current = await tx.$queryRaw<
          any[]
        >`SELECT slug FROM products WHERE id=${productId} LIMIT 1`;
        if (!current.length) throw new Error("NOT_FOUND");
        const [brand, type, category, line] = await Promise.all([
          tx.$queryRaw<
            any[]
          >`SELECT id FROM brands WHERE id=${product.brandId} AND "isActive"=TRUE`,
          tx.$queryRaw<
            any[]
          >`SELECT pt.id FROM product_types pt JOIN legacy_product_type_mappings mapping ON mapping."legacyProductTypeId"=pt.id JOIN global_product_types g ON g.id=mapping."globalProductTypeId" JOIN global_product_type_brands link ON link."productTypeId"=g.id AND link."brandId"=${product.brandId} WHERE pt.id=${product.productTypeId} AND pt."isActive"=TRUE AND g."isActive"=TRUE AND pt."brandId"=${product.brandId}`,
          tx.$queryRaw<
            any[]
          >`SELECT id FROM categories WHERE id=${product.categoryId} AND "isActive"=TRUE`,
          product.productLineId
            ? tx.$queryRaw<
                any[]
              >`SELECT id FROM product_lines WHERE id=${product.productLineId} AND "brandId"=${product.brandId} AND "isActive"=TRUE`
            : Promise.resolve([{ id: null }]),
        ]);
        if (!brand.length || !type.length || !category.length || !line.length)
          throw new Error("INVALID_REFERENCE");
        const currentModel = await tx.$queryRaw<
          any[]
        >`SELECT "modelId" FROM products WHERE id=${productId} LIMIT 1`;
        const selectedModel = await resolveProductModel(
          tx,
          product,
          currentModel[0]?.modelId ?? null,
        );
        await tx.$executeRaw`UPDATE products SET name=${product.name},"brandId"=${product.brandId},"productTypeId"=${product.productTypeId},"productLineId"=${product.productLineId ?? null},"categoryId"=${product.categoryId},"modelId"=${selectedModel?.id ?? null},model=${selectedModel?.name ?? product.model ?? null},generation=${product.generation ?? null},chip=${product.chip ?? null},"displaySize"=${product.displaySize ?? null},"releaseYear"=${product.releaseYear ?? null},description=${JSON.stringify({ text: product.description })}::jsonb,specifications=${JSON.stringify(product.specifications)}::jsonb,"isNew"=${product.isNew},status=${product.status}::"ProductStatus","updatedAt"=NOW() WHERE id=${productId}`;
        await saveVariants(tx, productId, product.variants);
        await syncDictionaryLinks(tx, productId, product.variants, product);
        await saveImages(tx, productId, product.images);
        await syncRelatedProducts(tx, productId, product.relatedProductIds);
      },
      { maxWait: 10000, timeout: 30000 },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = mutationFailure(error, "update");
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status },
    );
  }
}
