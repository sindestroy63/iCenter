import { NextResponse } from "next/server";
import { z } from "zod";
import { csrfMatches, requireDictionaryMutation, requireDictionarySession, sameOrigin } from "@/lib/auth";
import { adminDb, newId } from "@/lib/admin-db";
import { DICTIONARY_REGISTRY, sortDictionaryOptions, validateOptionInput, type DictionaryCode } from "@/lib/product-dictionaries";
import { catalogColorHex } from "@/lib/catalog-colors";
import { auditDiff, getDictionarySnapshot, writeAuditLog } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

const optionSchema = z.object({ id: z.string().trim().min(1).max(100).optional(), canonicalKey: z.string().trim().min(1).max(120), label: z.string().trim().min(1).max(180), nameRu: z.string().trim().max(180).nullable().optional(), aliases: z.array(z.string().trim().min(1).max(180)).max(30).default([]), sortOrder: z.number().int().min(-100000).max(100000).default(0), isActive: z.boolean().default(true), brandId: z.string().trim().min(1).optional(), globalProductTypeId: z.string().trim().min(1).optional(), hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional() });
const definitionSchema = z.object({ id: z.string().trim().min(1).max(100).optional(), code: z.string().regex(/^[a-z][a-z0-9_]*$/).optional(), name: z.string().trim().min(1).max(180), scope: z.literal("VARIANT").default("VARIANT"), valueKind: z.literal("OPTION").default("OPTION"), sortOrder: z.number().int().min(-100000).max(100000).default(0), isFilterable: z.literal(false).default(false), isActive: z.boolean().default(true), productTypeIds: z.array(z.string().trim().min(1)).max(100).default([]) });
const legacyCodes = new Set<string>();
const optionCodes = new Set(DICTIONARY_REGISTRY.filter((item) => item.source === "attribute_options").map((item) => item.code));
const fixedDefinitionCodes = new Set(DICTIONARY_REGISTRY.map((item) => item.code));
const reservedAttributeCodes = new Set(["memory", "ram", "sim", "simType", "storage", "color", "connectivity", "size", "material"]);

function isFixedDictionary(code: string) { return fixedDefinitionCodes.has(code as DictionaryCode); }

function attributeCode(name: string) {
  const transliterated = name.trim().toLocaleLowerCase("ru-RU").replace(/[а-яё]/g, (char) => ({ а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" }[char] ?? char)).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 54);
  return transliterated || "attribute";
}

async function requireAttributeManager(request: Request) {
  const session = await requireDictionarySession();
  if (!sameOrigin(request) || !csrfMatches(request, session.csrfToken)) throw new Error("CSRF_INVALID");
  return session;
}

async function isCustomDefinition(code: string) {
  if (!code || isFixedDictionary(code) || reservedAttributeCodes.has(code)) return false;
  return (await adminDb().$queryRaw<any[]>`SELECT 1 FROM attribute_definitions WHERE code=${code} AND scope='VARIANT' LIMIT 1`).length > 0;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "DICTIONARY_FAILED";
  if (message.startsWith("DUPLICATE_KEY:")) return NextResponse.json({ error: message.slice("DUPLICATE_KEY:".length) }, { status: 409 });
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const databaseCode = error && typeof error === "object" && "meta" in error && (error as { meta?: unknown }).meta && typeof (error as { meta: object }).meta === "object" && "code" in (error as { meta: { code?: unknown } }).meta ? String((error as { meta: { code?: unknown } }).meta.code ?? "") : "";
  if ([code, databaseCode].some((value) => ["42P01", "42703"].includes(value))) return NextResponse.json({ error: "DICTIONARY_MIGRATION_REQUIRED" }, { status: 503 });
  if ([code, databaseCode].some((value) => ["23503", "P2003"].includes(value))) return NextResponse.json({ error: "USED_VALUE" }, { status: 409 });
  if ([code, databaseCode].includes("23505")) return NextResponse.json({ error: "DICTIONARY_VALUE_EXISTS" }, { status: 409 });
  const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" || message === "CSRF_INVALID" ? 403 : message === "NOT_FOUND" ? 404 : ["USED_VALUE", "ATTRIBUTE_NAME_EXISTS", "ATTRIBUTE_HAS_VALUES", "ATTRIBUTE_IN_USE", "RESERVED_ATTRIBUTE_CODE", "DUPLICATE_KEY", "DUPLICATE_ALIAS"].includes(message) ? 409 : ["MODEL_REFERENCE_REQUIRED", "MODEL_REFERENCE_INVALID"].includes(message) ? 400 : 400;
  return NextResponse.json({ error: message }, { status });
}

function labels(code: string, row: any) {
  return { id: row.id, dictionary: code, canonicalKey: row.canonicalKey ?? `${code}:${row.slug ?? row.id}`, label: row.label ?? row.name, aliases: row.aliases ?? [], sortOrder: row.sortOrder ?? row.order ?? 0, isActive: row.isActive ?? true, brandId: row.brandId ?? null, globalProductTypeId: row.globalProductTypeId ?? null, scope: row.scope ?? null, definitionName: row.definitionName ?? null, definitionIsActive: row.definitionIsActive ?? null, productTypeIds: row.productTypeIds ?? [], nameEn: code === "color" ? row.name : undefined, nameRu: code === "color" ? row.nameRu ?? null : undefined, hex: code === "color" ? row.hexPrimary ?? catalogColorHex({ name: row.name, slug: row.slug }) : undefined };
}

export async function GET(request: Request) {
  try {
    const session = await requireDictionarySession();
    const code = new URL(request.url).searchParams.get("code") ?? "";
    const brandFilter = new URL(request.url).searchParams.get("brandId");
    const typeFilter = new URL(request.url).searchParams.get("globalProductTypeId");
    const activeFilter = new URL(request.url).searchParams.get("isActive");
    const db = adminDb();
    const [brands, colors, products, lines, options, globalTypes, definitions, productTypes] = await Promise.all([
      db.$queryRaw<any[]>`SELECT id,name,slug,"sortOrder","isActive" FROM brands ORDER BY "sortOrder",name`,
      (!code || code === "color") ? db.$queryRaw<any[]>`SELECT id,name,to_jsonb(colors)->>'nameRu' AS "nameRu",slug,"hexPrimary","sortOrder","isActive" FROM colors ORDER BY "sortOrder",name` : Promise.resolve([]),
      (!code || code === "productModel") ? db.$queryRaw<any[]>`SELECT m.id,m.name,m."brandId",m."globalProductTypeId",m."isActive",m."createdAt" FROM product_models m WHERE (${brandFilter}::text IS NULL OR m."brandId"=${brandFilter}) AND (${typeFilter}::text IS NULL OR m."globalProductTypeId"=${typeFilter}) AND (${activeFilter}::text IS NULL OR m."isActive"=(${activeFilter}='true')) ORDER BY m.name` : Promise.resolve([]),
      (!code || code === "productLine") ? db.$queryRaw<any[]>`SELECT id,"brandId","canonicalKey",name,"sortOrder","isActive" FROM product_lines ORDER BY "sortOrder",name` : Promise.resolve([]),
      (!code || optionCodes.has(code as DictionaryCode) || await db.$queryRaw<any[]>`SELECT 1 FROM attribute_definitions WHERE code=${code} AND scope='VARIANT' LIMIT 1`.then((rows) => rows.length > 0)) ? db.$queryRaw<any[]>`SELECT o.id,d.code AS dictionary,o."canonicalKey",o.label,o."sortOrder",o."isActive",d.name AS "definitionName",d.scope,d."isActive" AS "definitionIsActive",COALESCE((SELECT json_agg(pta."productTypeId") FROM global_product_type_attributes pta WHERE pta."definitionId"=d.id AND pta.scope=d.scope),'[]'::json) AS "productTypeIds",COALESCE((SELECT json_agg(a."aliasLabel" ORDER BY a."aliasLabel") FROM attribute_option_aliases a WHERE a."optionId"=o.id),'[]'::json) AS aliases FROM attribute_options o JOIN attribute_definitions d ON d.id=o."definitionId" WHERE (${code}::text='' OR d.code=${code}) ORDER BY d.code,o."sortOrder",o.label` : Promise.resolve([]),
      (!code || code === "productType") ? db.$queryRaw<any[]>`SELECT t.id,t."canonicalKey",t.name,t."sortOrder",t."isActive" FROM global_product_types t ORDER BY t."sortOrder",t.name` : Promise.resolve([]),
      db.$queryRaw<any[]>`SELECT d.id,d.code,d.name,d.scope,d."valueKind",d."sortOrder",d."isFilterable",d."isActive",COALESCE(json_agg(pta."productTypeId") FILTER (WHERE pta."productTypeId" IS NOT NULL),'[]'::json) AS "productTypeIds" FROM attribute_definitions d LEFT JOIN global_product_type_attributes pta ON pta."definitionId"=d.id AND pta.scope=d.scope GROUP BY d.id ORDER BY d."sortOrder",d.code`,
      db.$queryRaw<any[]>`SELECT id,name,"isActive" FROM global_product_types ORDER BY "sortOrder",name`,
    ]);
    if (code && !DICTIONARY_REGISTRY.some((item) => item.code === code) && !definitions.some((item) => item.code === code)) return NextResponse.json({ error: "UNKNOWN_DICTIONARY" }, { status: 400 });
    const data = [
      ...brands.map((row) => labels("brand", row)),
      ...colors.map((row) => labels("color", row)),
      ...products.map((row) => labels("productModel", row)),
      ...lines.map((row) => labels("productLine", row)),
      ...options.map((row) => labels(row.dictionary, row)),
      ...globalTypes.map((row) => labels("productType", row)),
    ].filter((row) => !code || row.dictionary === code);
    const sorted = code ? sortDictionaryOptions(code as DictionaryCode, data as any) : data.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "ru"));
    return NextResponse.json({ data: sorted, globalTypes, productTypes, brands, definitions: definitions.map((definition) => ({ ...definition, isManaged: !isFixedDictionary(definition.code), canAssign: definition.scope === "VARIANT" && definition.isActive && definition.code !== "region" })), role: session.role, canWrite: ["OWNER", "ADMIN", "DEVELOPER", "CITY_MANAGER"].includes(session.role), canManageAttributes: true, registry: DICTIONARY_REGISTRY });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const code = new URL(request.url).searchParams.get("code") ?? "";
    const body = await request.json();
    if (body?.kind === "definition") {
      const actor = await requireAttributeManager(request);
      const parsedDefinition = definitionSchema.safeParse(body);
      if (!parsedDefinition.success) return NextResponse.json({ error: "INVALID_ATTRIBUTE_DEFINITION" }, { status: 400 });
      if (parsedDefinition.data.code && (isFixedDictionary(parsedDefinition.data.code) || reservedAttributeCodes.has(parsedDefinition.data.code))) return NextResponse.json({ error: "RESERVED_ATTRIBUTE_CODE" }, { status: 409 });
      const definition = parsedDefinition.data;
      const db = adminDb();
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('icenter_attribute_definition_name'))`;
        const id = definition.id ?? newId();
        if (await tx.$queryRaw<any[]>`SELECT 1 FROM attribute_definitions WHERE lower(name)=lower(${definition.name}) LIMIT 1`.then((rows) => rows.length)) throw new Error("ATTRIBUTE_NAME_EXISTS");
        let code = definition.code ?? attributeCode(definition.name);
        for (let suffix = 2; await tx.$queryRaw<any[]>`SELECT 1 FROM attribute_definitions WHERE code=${code} LIMIT 1`.then((rows) => rows.length); suffix++) code = `${attributeCode(definition.name).slice(0, 48)}_${suffix}`;
        await tx.$executeRaw`INSERT INTO attribute_definitions (id,code,name,scope,"valueKind","sortOrder","isFilterable","isActive") VALUES (${id},${code},${definition.name},'VARIANT','OPTION',${definition.sortOrder},FALSE,${definition.isActive})`;
        for (const productTypeId of Array.from(new Set(definition.productTypeIds))) {
          const type = await tx.$queryRaw<any[]>`SELECT id FROM global_product_types WHERE id=${productTypeId} LIMIT 1`;
          if (!type.length) throw new Error("INVALID_PRODUCT_TYPE");
          await tx.$executeRaw`INSERT INTO global_product_type_attributes ("productTypeId","definitionId",scope,"sortOrder") VALUES (${productTypeId},${id},'VARIANT',${definition.sortOrder}) ON CONFLICT ("productTypeId","definitionId") DO NOTHING`;
        }
        await writeAuditLog(tx, actor, { action: "dictionary.created", entityType: "attribute_definition", entityId: id, changes: { old: null, new: { code, name: definition.name, scope: "VARIANT", valueKind: "OPTION", sortOrder: definition.sortOrder, isFilterable: false, isActive: definition.isActive } }, metadata: { dictionary: "definition" } });
      });
      return NextResponse.json({ ok: true }, { status: 201 });
    }
    const parsed = optionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_DICTIONARY_VALUE" }, { status: 400 });
    const value = parsed.data;
    if (legacyCodes.has(code)) return NextResponse.json({ error: "LEGACY_DICTIONARY_READ_ONLY" }, { status: 409 });
    const builtInDictionary = optionCodes.has(code as DictionaryCode) || ["productLine", "productType", "productModel", "brand", "color"].includes(code);
    if (!builtInDictionary) {
      const exists = await adminDb().$queryRaw<any[]>`SELECT 1 FROM attribute_definitions WHERE code=${code} AND scope='VARIANT' LIMIT 1`;
      if (!exists.length) return NextResponse.json({ error: "UNKNOWN_DICTIONARY" }, { status: 400 });
    }
    const actor = builtInDictionary ? await requireDictionaryMutation(request) : await requireAttributeManager(request);
    const db = adminDb();
    await db.$transaction(async (tx) => {
      if (code === "productLine") {
        if (!value.brandId) throw new Error("BRAND_REQUIRED");
        const id = value.id ?? newId();
        await tx.$executeRaw`INSERT INTO product_lines (id,"brandId","canonicalKey",name,"sortOrder","isActive") VALUES (${id},${value.brandId},${value.canonicalKey},${value.label},${value.sortOrder},${value.isActive})`;
        await writeAuditLog(tx, actor, { action: "dictionary.created", entityType: "productLine", entityId: id, changes: { old: null, new: { brandId: value.brandId, canonicalKey: value.canonicalKey, name: value.label, sortOrder: value.sortOrder, isActive: value.isActive } }, metadata: { dictionary: code } });
        return;
      }
      if (code === "productModel") {
        if (!value.brandId || !value.globalProductTypeId) throw new Error("MODEL_REFERENCE_REQUIRED");
        const reference = await tx.$queryRaw<any[]>`SELECT 1 FROM global_product_types g WHERE g.id=${value.globalProductTypeId} AND g."isActive"=TRUE LIMIT 1`;
        if (!reference.length) throw new Error("MODEL_REFERENCE_INVALID");
        const id = value.id ?? newId();
        await tx.$executeRaw`INSERT INTO product_models (id,name,"brandId","globalProductTypeId","isActive") VALUES (${id},${value.label},${value.brandId},${value.globalProductTypeId},${value.isActive})`;
        await writeAuditLog(tx, actor, { action: "dictionary.created", entityType: "productModel", entityId: id, changes: { old: null, new: { name: value.label, brandId: value.brandId, globalProductTypeId: value.globalProductTypeId, isActive: value.isActive } }, metadata: { dictionary: code } });
        return;
      }
      if (code === "productType") {
        if (!/^product_type:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.canonicalKey)) throw new Error("INVALID_CANONICAL_KEY");
        const id = value.id ?? newId();
        await tx.$executeRaw`INSERT INTO global_product_types (id,"canonicalKey",name,"sortOrder","isActive") VALUES (${id},${value.canonicalKey},${value.label},${value.sortOrder},${value.isActive})`;
        await writeAuditLog(tx, actor, { action: "dictionary.created", entityType: "productType", entityId: id, changes: { old: null, new: { canonicalKey: value.canonicalKey, name: value.label, sortOrder: value.sortOrder, isActive: value.isActive } }, metadata: { dictionary: code } });
        return;
      }
      if (code === "brand") {
        const slug = value.canonicalKey.replace(/^brand:/, "");
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("INVALID_CANONICAL_KEY");
        const id = value.id ?? newId();
        await tx.$executeRaw`INSERT INTO brands (id,name,slug,"sortOrder","isActive","updatedAt") VALUES (${id},${value.label},${slug},${value.sortOrder},${value.isActive},NOW())`;
        await writeAuditLog(tx, actor, { action: "dictionary.created", entityType: "brand", entityId: id, changes: { old: null, new: { name: value.label, slug, sortOrder: value.sortOrder, isActive: value.isActive } }, metadata: { dictionary: code } });
        return;
      }
      if (code === "color") {
        const slug = value.canonicalKey.replace(/^color:/, "");
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("INVALID_CANONICAL_KEY");
        const id = value.id ?? newId();
        await tx.$executeRaw`INSERT INTO colors (id,name,"nameRu",slug,"hexPrimary","sortOrder","isActive","updatedAt") VALUES (${id},${value.label},${value.nameRu?.trim() || null},${slug},${value.hex ?? null},${value.sortOrder},${value.isActive},NOW())`;
        await writeAuditLog(tx, actor, { action: "dictionary.created", entityType: "color", entityId: id, changes: { old: null, new: { name: value.label, nameRu: value.nameRu?.trim() || null, slug, hexPrimary: value.hex ?? null, sortOrder: value.sortOrder, isActive: value.isActive } }, metadata: { dictionary: code } });
        return;
      }
      const definition = await tx.$queryRaw<any[]>`SELECT id FROM attribute_definitions WHERE code=${code} LIMIT 1`;
      if (!definition.length) throw new Error("UNKNOWN_DICTIONARY");
      const existing = await tx.$queryRaw<any[]>`SELECT d.code AS dictionary,o."canonicalKey" AS key,o.id AS "optionId" FROM attribute_options o JOIN attribute_definitions d ON d.id=o."definitionId" UNION ALL SELECT d.code,a."aliasKey",a.id FROM attribute_option_aliases a JOIN attribute_definitions d ON d.id=a."definitionId"`;
      const issues = validateOptionInput({ dictionary: code as any, canonicalKey: value.canonicalKey, label: value.label, aliases: value.aliases }, existing);
      if (issues.length) {
        const issue = issues[0];
        if (issue.code === "DUPLICATE_KEY" || issue.code === "DUPLICATE_ALIAS") {
          const conflict = await tx.$queryRaw<any[]>`SELECT o.label,o."canonicalKey" FROM attribute_options o LEFT JOIN attribute_option_aliases a ON a."optionId"=o.id WHERE o.id=${issue.conflictsWith ?? ""} OR a.id=${issue.conflictsWith ?? ""} LIMIT 1`;
          throw new Error(`DUPLICATE_KEY:Ключ «${issue.value}» уже занят значением «${conflict[0]?.label ?? "неизвестное значение"}» (${conflict[0]?.canonicalKey ?? "ключ недоступен"}).`);
        }
        throw new Error(issue.code);
      }
      const optionId = value.id ?? newId();
      await tx.$executeRaw`INSERT INTO attribute_options (id,"definitionId","canonicalKey",label,"sortOrder","isActive") VALUES (${optionId},${definition[0].id},${value.canonicalKey},${value.label},${value.sortOrder},${value.isActive})`;
      for (let index = 0; index < value.aliases.length; index++) { const alias = value.aliases[index]; await tx.$executeRaw`INSERT INTO attribute_option_aliases (id,"definitionId","optionId","aliasKey","aliasLabel") VALUES (${newId()},${definition[0].id},${optionId},${`${code}:${alias.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `alias-${index + 1}`}`},${alias})`; }
      await writeAuditLog(tx, actor, { action: "dictionary.created", entityType: "attribute_option", entityId: optionId, changes: { old: null, new: { dictionary: code, canonicalKey: value.canonicalKey, label: value.label, aliases: value.aliases, sortOrder: value.sortOrder, isActive: value.isActive } }, metadata: { dictionary: code } });
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { kind?: string; code?: string; id?: string; isActive?: boolean; label?: string; name?: string; nameRu?: string | null; sortOrder?: number; brandIds?: string[]; brandId?: string; globalProductTypeId?: string; hex?: string | null; isFilterable?: boolean; productTypeIds?: string[] };
    if (body.kind === "definition") {
      const actor = await requireAttributeManager(request);
      if (!body.id || typeof body.isActive !== "boolean" || (body.name !== undefined && (!body.name.trim() || body.name.trim().length > 180)) || (body.sortOrder !== undefined && !Number.isInteger(body.sortOrder)) || (body.productTypeIds !== undefined && (!Array.isArray(body.productTypeIds) || body.productTypeIds.length > 100 || body.productTypeIds.some((id) => typeof id !== "string" || !id.trim())))) return NextResponse.json({ error: "INVALID_ATTRIBUTE_DEFINITION" }, { status: 400 });
      const definitionId = body.id;
      const db = adminDb();
      await db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<any[]>`SELECT id,code,scope FROM attribute_definitions WHERE id=${definitionId} LIMIT 1`;
        if (!rows[0]) throw new Error("NOT_FOUND");
        const before = await getDictionarySnapshot(tx, "definition", definitionId);
        if (body.name !== undefined) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('icenter_attribute_definition_name'))`;
          const duplicate = await tx.$queryRaw<any[]>`SELECT 1 FROM attribute_definitions WHERE lower(name)=lower(${body.name.trim()}) AND id<>${definitionId} LIMIT 1`;
          if (duplicate.length) throw new Error("ATTRIBUTE_NAME_EXISTS");
        }
        await tx.$executeRaw`UPDATE attribute_definitions SET name=COALESCE(${body.name?.trim() ?? null},name), "isActive"=${body.isActive}, "sortOrder"=COALESCE(${body.sortOrder ?? null},"sortOrder"), "isFilterable"=FALSE, "updatedAt"=NOW() WHERE id=${definitionId}`;
        if (body.productTypeIds !== undefined) {
          const productTypeIds = Array.from(new Set(body.productTypeIds));
          const currentAssignments = await tx.$queryRaw<any[]>`SELECT "productTypeId" FROM global_product_type_attributes WHERE "definitionId"=${definitionId} AND scope=${rows[0].scope}`;
          for (const assignment of currentAssignments) {
            if (!productTypeIds.includes(assignment.productTypeId)) {
              const used = rows[0].scope === "PRODUCT"
                ? await tx.$queryRaw<any[]>`SELECT 1 FROM product_attribute_values pav JOIN products p ON p.id=pav."productId" WHERE p."globalProductTypeId"=${assignment.productTypeId} AND pav."definitionId"=${definitionId} LIMIT 1`
                : await tx.$queryRaw<any[]>`SELECT 1 FROM product_variant_attribute_values pvav JOIN product_variants pv ON pv.id=pvav."variantId" JOIN products p ON p.id=pv."productId" WHERE p."globalProductTypeId"=${assignment.productTypeId} AND pvav."definitionId"=${definitionId} LIMIT 1`;
              if (used.length) throw new Error("ATTRIBUTE_IN_USE");
              await tx.$executeRaw`DELETE FROM global_product_type_attributes WHERE "productTypeId"=${assignment.productTypeId} AND "definitionId"=${definitionId} AND scope=${rows[0].scope}`;
            }
          }
          for (const productTypeId of productTypeIds) {
            const type = await tx.$queryRaw<any[]>`SELECT id FROM global_product_types WHERE id=${productTypeId} LIMIT 1`;
            if (!type.length) throw new Error("INVALID_PRODUCT_TYPE");
            await tx.$executeRaw`INSERT INTO global_product_type_attributes ("productTypeId","definitionId",scope,"sortOrder") VALUES (${productTypeId},${definitionId},${rows[0].scope},${body.sortOrder ?? 0}) ON CONFLICT ("productTypeId","definitionId") DO NOTHING`;
          }
        }
        const after = await getDictionarySnapshot(tx, "definition", definitionId);
        const changes = auditDiff(before, after);
        if (changes) await writeAuditLog(tx, actor, { action: "dictionary.updated", entityType: "attribute_definition", entityId: definitionId, changes, metadata: { dictionary: "definition" } });
      });
      return NextResponse.json({ ok: true });
    }
    const actor = await (await isCustomDefinition(body.code ?? "") ? requireAttributeManager(request) : requireDictionaryMutation(request));
    if (!body.code || !body.id || typeof body.isActive !== "boolean") return NextResponse.json({ error: "INVALID_DICTIONARY_VALUE" }, { status: 400 });
    if (body.label !== undefined && (!body.label.trim() || body.label.trim().length > 180)) return NextResponse.json({ error: "INVALID_DICTIONARY_VALUE" }, { status: 400 });
    if (body.nameRu !== undefined && body.nameRu !== null && body.nameRu.trim().length > 180) return NextResponse.json({ error: "INVALID_DICTIONARY_VALUE" }, { status: 400 });
    if (body.hex !== undefined && body.hex !== null && !/^#[0-9A-Fa-f]{6}$/.test(body.hex)) return NextResponse.json({ error: "INVALID_DICTIONARY_VALUE" }, { status: 400 });
    const dictionaryCode = body.code;
    const dictionaryId = body.id;
    if (legacyCodes.has(body.code)) return NextResponse.json({ error: "LEGACY_DICTIONARY_READ_ONLY" }, { status: 409 });
    const db = adminDb();
    await db.$transaction(async (tx) => {
      const before = await getDictionarySnapshot(tx, dictionaryCode, dictionaryId);
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
          const reference = await tx.$queryRaw<any[]>`SELECT 1 FROM product_models m JOIN global_product_types g ON g.id=COALESCE(${body.globalProductTypeId ?? null},m."globalProductTypeId") WHERE m.id=${body.id} AND g."isActive"=TRUE AND m."brandId"=COALESCE(${body.brandId ?? null},m."brandId") LIMIT 1`;
          if (!reference.length) throw new Error("MODEL_REFERENCE_INVALID");
        }
        await tx.$executeRaw`UPDATE product_models SET "isActive"=${body.isActive}, name=COALESCE(${body.label ?? null},name), "brandId"=COALESCE(${body.brandId ?? null},"brandId"), "globalProductTypeId"=COALESCE(${body.globalProductTypeId ?? null},"globalProductTypeId"), "updatedAt"=NOW() WHERE id=${body.id}`;
      } else if (body.code === "productType") {
        if (!body.isActive) { const used = await tx.$queryRaw<any[]>`SELECT 1 FROM legacy_product_type_mappings WHERE "globalProductTypeId"=${body.id} LIMIT 1`; if (used.length) throw new Error("USED_VALUE"); }
        await tx.$executeRaw`UPDATE global_product_types SET "isActive"=${body.isActive}, name=COALESCE(${body.label ?? null},name), "sortOrder"=COALESCE(${body.sortOrder ?? null},"sortOrder"), "updatedAt"=NOW() WHERE id=${body.id}`;
      } else {
        if (!optionCodes.has(body.code as DictionaryCode)) {
          const custom = await tx.$queryRaw<any[]>`SELECT 1 FROM attribute_definitions WHERE code=${body.code} AND scope='VARIANT' LIMIT 1`;
          if (!custom.length) throw new Error("UNKNOWN_DICTIONARY");
        }
        if (!body.isActive) { const used = await tx.$queryRaw<any[]>`SELECT 1 FROM product_attribute_values WHERE "optionId"=${body.id} UNION ALL SELECT 1 FROM product_variant_attribute_values WHERE "optionId"=${body.id} LIMIT 1`; if (used.length) throw new Error("USED_VALUE"); }
        await tx.$executeRaw`UPDATE attribute_options SET "isActive"=${body.isActive}, label=COALESCE(${body.label ?? null},label), "sortOrder"=COALESCE(${body.sortOrder ?? null},"sortOrder"), "updatedAt"=NOW() WHERE id=${body.id}`;
      }
      const after = await getDictionarySnapshot(tx, dictionaryCode, dictionaryId);
      const changes = auditDiff(before, after);
      if (changes) await writeAuditLog(tx, actor, { action: "dictionary.updated", entityType: dictionaryCode === "productType" ? "productType" : dictionaryCode, entityId: dictionaryId, changes, metadata: { dictionary: dictionaryCode } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code") ?? "";
    const id = url.searchParams.get("id") ?? "";
    if (url.searchParams.get("kind") === "definition") {
      const actor = await requireAttributeManager(request);
      const db = adminDb();
      await db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<any[]>`SELECT id,code FROM attribute_definitions WHERE id=${id} AND scope='VARIANT' LIMIT 1`;
        if (!rows[0]) throw new Error("NOT_FOUND");
        if (isFixedDictionary(rows[0].code) || reservedAttributeCodes.has(rows[0].code)) throw new Error("RESERVED_ATTRIBUTE_CODE");
        const values = await tx.$queryRaw<any[]>`SELECT 1 FROM attribute_options WHERE "definitionId"=${id} LIMIT 1`;
        if (values.length) throw new Error("ATTRIBUTE_HAS_VALUES");
        const assignments = await tx.$queryRaw<any[]>`SELECT 1 FROM product_type_attributes WHERE "definitionId"=${id} UNION ALL SELECT 1 FROM global_product_type_attributes WHERE "definitionId"=${id} UNION ALL SELECT 1 FROM product_variant_attribute_values WHERE "definitionId"=${id} UNION ALL SELECT 1 FROM product_attribute_values WHERE "definitionId"=${id} LIMIT 1`;
        if (assignments.length) throw new Error("ATTRIBUTE_IN_USE");
        const before = await getDictionarySnapshot(tx, "definition", id);
        const deleted = await tx.$executeRaw`DELETE FROM attribute_definitions WHERE id=${id}`;
        if (!deleted) throw new Error("NOT_FOUND");
        await writeAuditLog(tx, actor, { action: "dictionary.deleted", entityType: "attribute_definition", entityId: id, changes: { deleted: { old: before, new: null } }, metadata: { dictionary: "definition" } });
      });
      return NextResponse.json({ ok: true });
    }
    const actor = await (await isCustomDefinition(code) ? requireAttributeManager(request) : requireDictionaryMutation(request));
    if (!id || (!optionCodes.has(code as DictionaryCode) && !["productLine", "productType", "productModel", "brand", "color"].includes(code) && !(await adminDb().$queryRaw<any[]>`SELECT 1 FROM attribute_definitions WHERE code=${code} AND scope='VARIANT' LIMIT 1`).length)) {
      return NextResponse.json({ error: "INVALID_DICTIONARY_VALUE" }, { status: 400 });
    }
    const db = adminDb();
    await db.$transaction(async (tx) => {
      const before = await getDictionarySnapshot(tx, code, id);
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
      await writeAuditLog(tx, actor, { action: "dictionary.deleted", entityType: code === "productType" ? "productType" : code === "productLine" ? "productLine" : code === "productModel" ? "productModel" : code === "brand" ? "brand" : code === "color" ? "color" : "attribute_option", entityId: id, changes: { deleted: { old: before, new: null } }, metadata: { dictionary: code } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
