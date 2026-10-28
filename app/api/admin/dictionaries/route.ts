import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDictionaryMutation, requireDictionarySession } from "@/lib/auth";
import { adminDb, newId } from "@/lib/admin-db";
import { DICTIONARY_REGISTRY, sortDictionaryOptions, validateOptionInput, type DictionaryCode } from "@/lib/product-dictionaries";
import { catalogColorHex } from "@/lib/catalog-colors";

export const dynamic = "force-dynamic";

const optionSchema = z.object({ id: z.string().trim().min(1).max(100).optional(), canonicalKey: z.string().trim().min(1).max(120), label: z.string().trim().min(1).max(180), nameRu: z.string().trim().max(180).nullable().optional(), aliases: z.array(z.string().trim().min(1).max(180)).max(30).default([]), sortOrder: z.number().int().min(-100000).max(100000).default(0), isActive: z.boolean().default(true), brandId: z.string().trim().min(1).optional(), globalProductTypeId: z.string().trim().min(1).optional(), brandIds: z.array(z.string().trim().min(1)).max(100).default([]), hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional() });
const legacyCodes = new Set<string>();
const optionCodes = new Set(DICTIONARY_REGISTRY.filter((item) => item.source === "attribute_options").map((item) => item.code));

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "DICTIONARY_FAILED";
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const databaseCode = error && typeof error === "object" && "meta" in error && (error as { meta?: unknown }).meta && typeof (error as { meta: object }).meta === "object" && "code" in (error as { meta: { code?: unknown } }).meta ? String((error as { meta: { code?: unknown } }).meta.code ?? "") : "";
  if ([code, databaseCode].some((value) => ["42P01", "42703"].includes(value))) return NextResponse.json({ error: "DICTIONARY_MIGRATION_REQUIRED" }, { status: 503 });
  if ([code, databaseCode].some((value) => ["23503", "P2003"].includes(value))) return NextResponse.json({ error: "USED_VALUE" }, { status: 409 });
  if ([code, databaseCode].includes("23505")) return NextResponse.json({ error: "DICTIONARY_VALUE_EXISTS" }, { status: 409 });
  const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : message === "CSRF_INVALID" ? 403 : message === "NOT_FOUND" ? 404 : message === "USED_VALUE" ? 409 : ["MODEL_REFERENCE_REQUIRED", "MODEL_REFERENCE_INVALID"].includes(message) ? 400 : 400;
  return NextResponse.json({ error: message }, { status });
}

function labels(code: string, row: any) {
  return { id: row.id, dictionary: code, canonicalKey: row.canonicalKey ?? `${code}:${row.slug ?? row.id}`, label: row.label ?? row.name, aliases: row.aliases ?? [], sortOrder: row.sortOrder ?? row.order ?? 0, isActive: row.isActive ?? true, brandId: row.brandId ?? null, globalProductTypeId: row.globalProductTypeId ?? null, nameEn: code === "color" ? row.name : undefined, nameRu: code === "color" ? row.nameRu ?? null : undefined, hex: code === "color" ? row.hexPrimary ?? catalogColorHex({ name: row.name, slug: row.slug }) : undefined };
}

export async function GET(request: Request) {
  try {
    const session = await requireDictionarySession();
    const code = new URL(request.url).searchParams.get("code") ?? "";
    const brandFilter = new URL(request.url).searchParams.get("brandId");
    const typeFilter = new URL(request.url).searchParams.get("globalProductTypeId");
    const activeFilter = new URL(request.url).searchParams.get("isActive");
    if (code && !DICTIONARY_REGISTRY.some((item) => item.code === code)) return NextResponse.json({ error: "UNKNOWN_DICTIONARY" }, { status: 400 });
    const db = adminDb();
    const [brands, types, colors, products, lines, options, globalTypes] = await Promise.all([
      db.$queryRaw<any[]>`SELECT id,name,slug,"sortOrder","isActive" FROM brands ORDER BY "sortOrder",name`,
      (!code || code === "productType") ? db.$queryRaw<any[]>`SELECT id,name,slug,"brandId","sortOrder","isActive" FROM product_types ORDER BY "sortOrder",name` : Promise.resolve([]),
      (!code || code === "color") ? db.$queryRaw<any[]>`SELECT id,name,to_jsonb(colors)->>'nameRu' AS "nameRu",slug,"hexPrimary","sortOrder","isActive" FROM colors ORDER BY "sortOrder",name` : Promise.resolve([]),
      (!code || code === "productModel") ? db.$queryRaw<any[]>`SELECT m.id,m.name,m."brandId",m."globalProductTypeId",m."isActive",m."createdAt" FROM product_models m WHERE (${brandFilter}::text IS NULL OR m."brandId"=${brandFilter}) AND (${typeFilter}::text IS NULL OR m."globalProductTypeId"=${typeFilter}) AND (${activeFilter}::text IS NULL OR m."isActive"=(${activeFilter}='true')) ORDER BY m.name` : Promise.resolve([]),
      (!code || code === "productLine") ? db.$queryRaw<any[]>`SELECT id,"brandId","canonicalKey",name,"sortOrder","isActive" FROM product_lines ORDER BY "sortOrder",name` : Promise.resolve([]),
      (!code || optionCodes.has(code as DictionaryCode)) ? db.$queryRaw<any[]>`SELECT o.id,d.code AS dictionary,o."canonicalKey",o.label,o."sortOrder",o."isActive",COALESCE(json_agg(a."aliasLabel" ORDER BY a."aliasLabel") FILTER (WHERE a.id IS NOT NULL),'[]'::json) AS aliases FROM attribute_options o JOIN attribute_definitions d ON d.id=o."definitionId" LEFT JOIN attribute_option_aliases a ON a."optionId"=o.id GROUP BY o.id,d.code ORDER BY d.code,o."sortOrder",o.label` : Promise.resolve([]),
      (!code || code === "productType") ? db.$queryRaw<any[]>`SELECT t.id,t."canonicalKey",t.name,t."sortOrder",t."isActive",COALESCE(json_agg(b.id) FILTER (WHERE b.id IS NOT NULL),'[]'::json) AS "brandIds" FROM global_product_types t LEFT JOIN global_product_type_brands link ON link."productTypeId"=t.id LEFT JOIN brands b ON b.id=link."brandId" GROUP BY t.id ORDER BY t."sortOrder",t.name` : Promise.resolve([]),
    ]);
    const data = [
      ...brands.map((row) => labels("brand", row)),
      ...colors.map((row) => labels("color", row)),
      ...products.map((row) => labels("productModel", row)),
      ...lines.map((row) => labels("productLine", row)),
      ...options.map((row) => labels(row.dictionary, row)),
      ...globalTypes.map((row) => labels("productType", row)),
    ].filter((row) => !code || row.dictionary === code);
    const sorted = code ? sortDictionaryOptions(code as DictionaryCode, data as any) : data.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "ru"));
    return NextResponse.json({ data: sorted, globalTypes, legacyTypes: types, brands, role: session.role, canWrite: ["OWNER", "ADMIN", "DEVELOPER"].includes(session.role), registry: DICTIONARY_REGISTRY });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await requireDictionaryMutation(request);
    const code = new URL(request.url).searchParams.get("code") ?? "";
    const parsed = optionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_DICTIONARY_VALUE" }, { status: 400 });
    const value = parsed.data;
    if (legacyCodes.has(code)) return NextResponse.json({ error: "LEGACY_DICTIONARY_READ_ONLY" }, { status: 409 });
    if (!optionCodes.has(code as DictionaryCode) && !["productLine", "productType", "productModel", "brand", "color"].includes(code)) return NextResponse.json({ error: "UNKNOWN_DICTIONARY" }, { status: 400 });
    const db = adminDb();
    await db.$transaction(async (tx) => {
      if (code === "productLine") {
        if (!value.brandId) throw new Error("BRAND_REQUIRED");
        await tx.$executeRaw`INSERT INTO product_lines (id,"brandId","canonicalKey",name,"sortOrder","isActive") VALUES (${value.id ?? newId()},${value.brandId},${value.canonicalKey},${value.label},${value.sortOrder},${value.isActive})`;
        return;
      }
      if (code === "productModel") {
        if (!value.brandId || !value.globalProductTypeId) throw new Error("MODEL_REFERENCE_REQUIRED");
        const reference = await tx.$queryRaw<any[]>`SELECT 1 FROM global_product_types g JOIN global_product_type_brands link ON link."productTypeId"=g.id AND link."brandId"=${value.brandId} WHERE g.id=${value.globalProductTypeId} AND g."isActive"=TRUE LIMIT 1`;
        if (!reference.length) throw new Error("MODEL_REFERENCE_INVALID");
        await tx.$executeRaw`INSERT INTO product_models (id,name,"brandId","globalProductTypeId","isActive") VALUES (${value.id ?? newId()},${value.label},${value.brandId},${value.globalProductTypeId},${value.isActive})`;
        return;
      }
      if (code === "productType") {
        if (!/^product_type:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.canonicalKey)) throw new Error("INVALID_CANONICAL_KEY");
        const id = value.id ?? newId();
        await tx.$executeRaw`INSERT INTO global_product_types (id,"canonicalKey",name,"sortOrder","isActive") VALUES (${id},${value.canonicalKey},${value.label},${value.sortOrder},${value.isActive})`;
        for (const brandId of value.brandIds) await tx.$executeRaw`INSERT INTO global_product_type_brands ("productTypeId","brandId") VALUES (${id},${brandId})`;
        return;
      }
      if (code === "brand") {
        const slug = value.canonicalKey.replace(/^brand:/, "");
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("INVALID_CANONICAL_KEY");
        await tx.$executeRaw`INSERT INTO brands (id,name,slug,"sortOrder","isActive","updatedAt") VALUES (${value.id ?? newId()},${value.label},${slug},${value.sortOrder},${value.isActive},NOW())`;
        return;
      }
      if (code === "color") {
        const slug = value.canonicalKey.replace(/^color:/, "");
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("INVALID_CANONICAL_KEY");
        await tx.$executeRaw`INSERT INTO colors (id,name,"nameRu",slug,"hexPrimary","sortOrder","isActive","updatedAt") VALUES (${value.id ?? newId()},${value.label},${value.nameRu?.trim() || null},${slug},${value.hex ?? null},${value.sortOrder},${value.isActive},NOW())`;
        return;
      }
      const definition = await tx.$queryRaw<any[]>`SELECT id FROM attribute_definitions WHERE code=${code} LIMIT 1`;
      if (!definition.length) throw new Error("UNKNOWN_DICTIONARY");
      const existing = await tx.$queryRaw<any[]>`SELECT d.code AS dictionary,o."canonicalKey" AS key,o.id AS "optionId" FROM attribute_options o JOIN attribute_definitions d ON d.id=o."definitionId" UNION ALL SELECT d.code,a."aliasKey",a.id FROM attribute_option_aliases a JOIN attribute_definitions d ON d.id=a."definitionId"`;
      const issues = validateOptionInput({ dictionary: code as any, canonicalKey: value.canonicalKey, label: value.label, aliases: value.aliases }, existing);
      if (issues.length) throw new Error(issues[0].code);
      const optionId = value.id ?? newId();
      await tx.$executeRaw`INSERT INTO attribute_options (id,"definitionId","canonicalKey",label,"sortOrder","isActive") VALUES (${optionId},${definition[0].id},${value.canonicalKey},${value.label},${value.sortOrder},${value.isActive})`;
      for (let index = 0; index < value.aliases.length; index++) { const alias = value.aliases[index]; await tx.$executeRaw`INSERT INTO attribute_option_aliases (id,"definitionId","optionId","aliasKey","aliasLabel") VALUES (${newId()},${definition[0].id},${optionId},${`${code}:${alias.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `alias-${index + 1}`}`},${alias})`; }
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    await requireDictionaryMutation(request);
    const body = await request.json() as { code?: string; id?: string; isActive?: boolean; label?: string; nameRu?: string | null; sortOrder?: number; brandIds?: string[]; brandId?: string; globalProductTypeId?: string; hex?: string | null };
    if (!body.code || !body.id || typeof body.isActive !== "boolean") return NextResponse.json({ error: "INVALID_DICTIONARY_VALUE" }, { status: 400 });
    if (body.label !== undefined && (!body.label.trim() || body.label.trim().length > 180)) return NextResponse.json({ error: "INVALID_DICTIONARY_VALUE" }, { status: 400 });
    if (body.nameRu !== undefined && body.nameRu !== null && body.nameRu.trim().length > 180) return NextResponse.json({ error: "INVALID_DICTIONARY_VALUE" }, { status: 400 });
    if (body.hex !== undefined && body.hex !== null && !/^#[0-9A-Fa-f]{6}$/.test(body.hex)) return NextResponse.json({ error: "INVALID_DICTIONARY_VALUE" }, { status: 400 });
    if (legacyCodes.has(body.code)) return NextResponse.json({ error: "LEGACY_DICTIONARY_READ_ONLY" }, { status: 409 });
    const db = adminDb();
    await db.$transaction(async (tx) => {
      if (body.code === "brand") {
        if (!body.isActive) { const used = await tx.$queryRaw<any[]>`SELECT 1 FROM products WHERE "brandId"=${body.id} UNION ALL SELECT 1 FROM product_types WHERE "brandId"=${body.id} LIMIT 1`; if (used.length) throw new Error("USED_VALUE"); }
        await tx.$executeRaw`UPDATE brands SET "isActive"=${body.isActive}, name=COALESCE(${body.label ?? null},name), "sortOrder"=COALESCE(${body.sortOrder ?? null},"sortOrder"), "updatedAt"=NOW() WHERE id=${body.id}`;
      } else if (body.code === "color") {
        if (!body.isActive) { const used = await tx.$queryRaw<any[]>`SELECT 1 FROM product_variants WHERE "colorId"=${body.id} UNION ALL SELECT 1 FROM color_galleries WHERE "colorId"=${body.id} LIMIT 1`; if (used.length) throw new Error("USED_VALUE"); }
        await tx.$executeRaw`UPDATE colors SET "isActive"=${body.isActive}, name=COALESCE(${body.label?.trim() || null},name), "nameRu"=CASE WHEN ${body.nameRu !== undefined} THEN ${body.nameRu?.trim() || null} ELSE "nameRu" END, "hexPrimary"=CASE WHEN ${body.hex !== undefined} THEN ${body.hex || null} ELSE "hexPrimary" END, "sortOrder"=COALESCE(${body.sortOrder ?? null},"sortOrder"), "updatedAt"=NOW() WHERE id=${body.id}`;
      } else if (body.code === "productLine") {
        if (!body.isActive) { const used = await tx.$queryRaw<any[]>`SELECT 1 FROM products WHERE "productLineId"=${body.id} LIMIT 1`; if (used.length) throw new Error("USED_VALUE"); }
        await tx.$executeRaw`UPDATE product_lines SET "isActive"=${body.isActive}, name=COALESCE(${body.label ?? null},name), "sortOrder"=COALESCE(${body.sortOrder ?? null},"sortOrder"), "updatedAt"=NOW() WHERE id=${body.id}`;
      } else if (body.code === "productModel") {
        if (!body.isActive) { const used = await tx.$queryRaw<any[]>`SELECT 1 FROM products WHERE "modelId"=${body.id} LIMIT 1`; if (used.length) throw new Error("USED_VALUE"); }
        if (body.brandId || body.globalProductTypeId) {
          const reference = await tx.$queryRaw<any[]>`SELECT 1 FROM product_models m JOIN global_product_types g ON g.id=COALESCE(${body.globalProductTypeId ?? null},m."globalProductTypeId") JOIN global_product_type_brands link ON link."productTypeId"=g.id AND link."brandId"=COALESCE(${body.brandId ?? null},m."brandId") WHERE m.id=${body.id} AND g."isActive"=TRUE LIMIT 1`;
          if (!reference.length) throw new Error("MODEL_REFERENCE_INVALID");
        }
        await tx.$executeRaw`UPDATE product_models SET "isActive"=${body.isActive}, name=COALESCE(${body.label ?? null},name), "brandId"=COALESCE(${body.brandId ?? null},"brandId"), "globalProductTypeId"=COALESCE(${body.globalProductTypeId ?? null},"globalProductTypeId"), "updatedAt"=NOW() WHERE id=${body.id}`;
      } else if (body.code === "productType") {
        if (!body.isActive) { const used = await tx.$queryRaw<any[]>`SELECT 1 FROM legacy_product_type_mappings WHERE "globalProductTypeId"=${body.id} LIMIT 1`; if (used.length) throw new Error("USED_VALUE"); }
        await tx.$executeRaw`UPDATE global_product_types SET "isActive"=${body.isActive}, name=COALESCE(${body.label ?? null},name), "sortOrder"=COALESCE(${body.sortOrder ?? null},"sortOrder"), "updatedAt"=NOW() WHERE id=${body.id}`;
        if (body.brandIds) {
          const linked = await tx.$queryRaw<any[]>`SELECT DISTINCT pt."brandId" FROM legacy_product_type_mappings mapping JOIN product_types pt ON pt.id=mapping."legacyProductTypeId" WHERE mapping."globalProductTypeId"=${body.id}`;
          const requested = new Set(body.brandIds);
          if (linked.some((row) => !requested.has(row.brandId))) throw new Error("USED_VALUE");
          await tx.$executeRaw`DELETE FROM global_product_type_brands WHERE "productTypeId"=${body.id}`;
          for (const brandId of body.brandIds) await tx.$executeRaw`INSERT INTO global_product_type_brands ("productTypeId","brandId") VALUES (${body.id},${brandId})`;
        }
      } else {
        if (!optionCodes.has(body.code as DictionaryCode)) throw new Error("UNKNOWN_DICTIONARY");
        if (!body.isActive) { const used = await tx.$queryRaw<any[]>`SELECT 1 FROM product_attribute_values WHERE "optionId"=${body.id} UNION ALL SELECT 1 FROM product_variant_attribute_values WHERE "optionId"=${body.id} LIMIT 1`; if (used.length) throw new Error("USED_VALUE"); }
        await tx.$executeRaw`UPDATE attribute_options SET "isActive"=${body.isActive}, label=COALESCE(${body.label ?? null},label), "sortOrder"=COALESCE(${body.sortOrder ?? null},"sortOrder"), "updatedAt"=NOW() WHERE id=${body.id}`;
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    await requireDictionaryMutation(request);
    const url = new URL(request.url);
    const code = url.searchParams.get("code") ?? "";
    const id = url.searchParams.get("id") ?? "";
    if (!id || (!optionCodes.has(code as DictionaryCode) && !["productLine", "productType", "productModel", "brand", "color"].includes(code))) {
      return NextResponse.json({ error: "INVALID_DICTIONARY_VALUE" }, { status: 400 });
    }
    const db = adminDb();
    await db.$transaction(async (tx) => {
      let used: any[] = [];
      let deleted = 0;
      if (code === "brand") {
        used = await tx.$queryRaw<any[]>`SELECT 1 FROM products WHERE "brandId"=${id} UNION ALL SELECT 1 FROM product_types WHERE "brandId"=${id} UNION ALL SELECT 1 FROM product_lines WHERE "brandId"=${id} UNION ALL SELECT 1 FROM product_models WHERE "brandId"=${id} UNION ALL SELECT 1 FROM global_product_type_brands WHERE "brandId"=${id} LIMIT 1`;
        if (!used.length) deleted = await tx.$executeRaw`DELETE FROM brands WHERE id=${id}`;
      } else if (code === "color") {
        used = await tx.$queryRaw<any[]>`SELECT 1 FROM product_variants WHERE "colorId"=${id} UNION ALL SELECT 1 FROM color_galleries WHERE "colorId"=${id} LIMIT 1`;
        if (!used.length) deleted = await tx.$executeRaw`DELETE FROM colors WHERE id=${id}`;
      } else if (code === "productLine") {
        used = await tx.$queryRaw<any[]>`SELECT 1 FROM products WHERE "productLineId"=${id} LIMIT 1`;
        if (!used.length) deleted = await tx.$executeRaw`DELETE FROM product_lines WHERE id=${id}`;
      } else if (code === "productModel") {
        used = await tx.$queryRaw<any[]>`SELECT 1 FROM products WHERE "modelId"=${id} LIMIT 1`;
        if (!used.length) deleted = await tx.$executeRaw`DELETE FROM product_models WHERE id=${id}`;
      } else if (code === "productType") {
        used = await tx.$queryRaw<any[]>`SELECT 1 FROM legacy_product_type_mappings WHERE "globalProductTypeId"=${id} UNION ALL SELECT 1 FROM product_models WHERE "globalProductTypeId"=${id} UNION ALL SELECT 1 FROM global_product_type_brands WHERE "productTypeId"=${id} LIMIT 1`;
        if (!used.length) deleted = await tx.$executeRaw`DELETE FROM global_product_types WHERE id=${id}`;
      } else {
        used = await tx.$queryRaw<any[]>`SELECT 1 FROM product_attribute_values WHERE "optionId"=${id} UNION ALL SELECT 1 FROM product_variant_attribute_values WHERE "optionId"=${id} LIMIT 1`;
        if (!used.length) deleted = await tx.$executeRaw`DELETE FROM attribute_options WHERE id=${id}`;
      }
      if (used.length) throw new Error("USED_VALUE");
      if (!deleted) throw new Error("NOT_FOUND");
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
