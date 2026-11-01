import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireGlobalAdminMutation, requireGlobalAdminSession } from "@/lib/auth";
import { adminDb, newId } from "@/lib/admin-db";
import { countGroupProducts, groupDbError, groupSchema, groupSchemaRequired, groupVariantSchemaRequired, normalizeGroupRule, validateGroupRuleReferences } from "@/lib/product-groups";

export const dynamic = "force-dynamic";
const slug = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const groupInput = z.object({ title: z.string().trim().min(1).max(180), slug, description: z.string().max(1000).default(""), isActive: z.boolean().default(true), sortOrder: z.number().int().min(-100000).max(100000).default(0) });
const groupSaveInput = groupInput.extend({ id: z.string().min(1).optional(), variantIds: z.array(z.string().min(1)).max(500).default([]) });
const ruleInput = z.object({ groupId: z.string().min(1), brandId: z.string().nullable().optional(), globalProductTypeId: z.string().nullable().optional(), modelId: z.string().nullable().optional(), sortOrder: z.number().int().min(-100000).max(100000).default(0), isActive: z.boolean().default(true) });
const productInput = z.object({ groupId: z.string().min(1), productId: z.string().min(1), sortOrder: z.number().int().min(-100000).max(100000).default(0) });
const variantInput = z.object({ groupId: z.string().min(1), variantId: z.string().min(1), sortOrder: z.number().int().min(-100000).max(100000).default(0) });
const variantsInput = z.object({ groupId: z.string().min(1), variantIds: z.array(z.string().min(1)).min(1).max(500), sortOrder: z.number().int().min(-100000).max(100000).default(0) });

function responseError(error: unknown) {
  const { message, code } = groupDbError(error);
  const status = message === "UNAUTHORIZED" ? 401 : ["FORBIDDEN", "CSRF_INVALID"].includes(message) ? 403 : message === "NOT_FOUND" ? 404 : message === "GROUP_SCHEMA_REQUIRED" || ["42P01", "42703"].includes(String(code)) ? 503 : ["GROUP_EXISTS", "RULE_EXISTS", "MODEL_BRAND_MISMATCH", "MODEL_TYPE_MISMATCH", "LEGACY_PRODUCT_CONFLICT"].includes(message) || code === "23505" ? 409 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    await requireGlobalAdminSession();
    const db = adminDb(); const schema = await groupSchema(db); groupSchemaRequired(schema);
    const id = new URL(request.url).searchParams.get("id");
    const city = new URL(request.url).searchParams.get("city");
    if (new URL(request.url).searchParams.get("options") === "1") {
      const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
      const requestedCity = new URL(request.url).searchParams.get("city")?.trim() ?? "";
      const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
      const [brands, types, models, products, cities] = await Promise.all([
        db.$queryRaw<any[]>`SELECT id,name,slug FROM brands WHERE "isActive"=TRUE ORDER BY name`,
        db.$queryRaw<any[]>`SELECT id,name,"canonicalKey" FROM global_product_types WHERE "isActive"=TRUE ORDER BY "sortOrder",name`,
        db.$queryRaw<any[]>`SELECT m.id,m.name,m."brandId",m."globalProductTypeId" FROM product_models m JOIN brands b ON b.id=m."brandId" AND b."isActive"=TRUE JOIN global_product_types t ON t.id=m."globalProductTypeId" AND t."isActive"=TRUE WHERE m."isActive"=TRUE ORDER BY m.name`,
        db.$queryRaw<any[]>`SELECT p.id,p.name,p.slug,b.name AS "brandName",pt.name AS "typeName" FROM products p JOIN brands b ON b.id=p."brandId" JOIN product_types pt ON pt.id=p."productTypeId" WHERE p.status='PUBLISHED'::"ProductStatus" AND (${q}::text='' OR p.name ILIKE ${pattern} OR p.slug ILIKE ${pattern} OR EXISTS (SELECT 1 FROM product_variants search_v WHERE search_v."productId"=p.id AND search_v.sku ILIKE ${pattern})) ORDER BY p.name LIMIT 200`,
        db.$queryRaw<any[]>`SELECT id,slug,name FROM cities WHERE "isActive"=TRUE ORDER BY "sortOrder",name`,
      ]);
      const cityId = cities.find((item) => item.slug === requestedCity)?.id ?? cities[0]?.id ?? null;
      const variants = cityId && products.length ? await db.$queryRaw<any[]>`
        SELECT v.id,v."productId",v.sku,v.label,v.storage,v.ram,v."simType",v.connectivity,v.size,v.material,v.attributes,
               i.price::text AS price,i."oldPrice"::text AS "oldPrice",i.availability::text AS availability,
               i."allowPreorder",i."deliveryTime",i.stock
        FROM product_variants v
        JOIN products p ON p.id=v."productId" AND p.status='PUBLISHED'::"ProductStatus"
        JOIN inventory i ON i."variantId"=v.id AND i."cityId"=${cityId} AND i."isActive"=TRUE
        WHERE v."isActive"=TRUE AND v."productId" IN (${Prisma.join(products.map((item) => item.id))})
        ORDER BY v."productId",v.sku
      ` : [];
      return NextResponse.json({ brands, types, models, products: products.map((product) => ({ ...product, variants: variants.filter((variant) => variant.productId === product.id) })), cities });
    }
    const groups = schema.variants
      ? await db.$queryRaw<any[]>`SELECT g.id,g.slug,g.title,g.description,g.isactive AS "isActive",g.sortorder AS "sortOrder",g.createdat AS "createdAt",g.updatedat AS "updatedAt",COUNT(DISTINCT gp."productId")::int AS "manualCount",COUNT(DISTINCT gv."variantId")::int AS "variantCount",COUNT(DISTINCT gr.id)::int AS "ruleCount" FROM catalog_groups g LEFT JOIN catalog_group_products gp ON gp."groupId"=g.id LEFT JOIN catalog_group_variants gv ON gv."groupId"=g.id LEFT JOIN catalog_group_rules gr ON gr."groupId"=g.id GROUP BY g.id ORDER BY g.sortorder,g.title`
      : await db.$queryRaw<any[]>`SELECT g.id,g.slug,g.title,g.description,g.isactive AS "isActive",g.sortorder AS "sortOrder",g.createdat AS "createdAt",g.updatedat AS "updatedAt",COUNT(DISTINCT gp."productId")::int AS "manualCount",0::int AS "variantCount",COUNT(DISTINCT gr.id)::int AS "ruleCount" FROM catalog_groups g LEFT JOIN catalog_group_products gp ON gp."groupId"=g.id LEFT JOIN catalog_group_rules gr ON gr."groupId"=g.id GROUP BY g.id ORDER BY g.sortorder,g.title`;
    if (!id) return NextResponse.json({ data: groups });
    const group = groups.find((entry) => entry.id === id); if (!group) throw new Error("NOT_FOUND");
    const [products, variants, rules, preview] = await Promise.all([
      db.$queryRaw<any[]>`SELECT gp."productId",gp."sortOrder",p.name,p.slug,p.status FROM catalog_group_products gp JOIN products p ON p.id=gp."productId" WHERE gp."groupId"=${id} ORDER BY gp."sortOrder",p.name`,
      schema.variants ? db.$queryRaw<any[]>`SELECT gv."variantId",gv."sortOrder",v.sku,v.label,v.storage,v.ram,v."simType",v.connectivity,v.size,v.material,v.attributes,p.id AS "productId",p.name AS "productName",i.price::text AS price,i."oldPrice"::text AS "oldPrice",i.availability::text AS availability,i."allowPreorder",i."deliveryTime",i.stock FROM catalog_group_variants gv JOIN product_variants v ON v.id=gv."variantId" JOIN products p ON p.id=v."productId" LEFT JOIN cities c ON c.slug=${city ?? ""} LEFT JOIN inventory i ON i."variantId"=v.id AND i."cityId"=c.id AND i."isActive"=TRUE WHERE gv."groupId"=${id} ORDER BY gv."sortOrder",p.name,v.sku` : Promise.resolve([]),
      db.$queryRaw<any[]>`SELECT id,"brandId","globalProductTypeId","modelId","sortOrder","isActive" FROM catalog_group_rules WHERE "groupId"=${id} ORDER BY "sortOrder",id`,
      city ? countGroupProducts(db, id, city, schema.variants) : Promise.resolve(null),
    ]);
    return NextResponse.json({ data: group, products, variants, rules, previewCount: preview, variantSchemaAvailable: schema.variants });
  } catch (error) { return responseError(error); }
}

export async function POST(request: Request) {
  try {
    await requireGlobalAdminMutation(request);
    const body = await request.json() as { kind?: string };
    const db = adminDb(); const schema = await groupSchema(db); groupSchemaRequired(schema);
    if (body.kind === "save") {
      groupVariantSchemaRequired(schema);
      const parsed = groupSaveInput.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "INVALID_GROUP" }, { status: 400 });
      const uniqueVariantIds = Array.from(new Set(parsed.data.variantIds));
      const result = await db.$transaction(async (tx) => {
        const id = parsed.data.id ?? newId();
        const current = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM catalog_groups WHERE id=${id} LIMIT 1`;
        if (parsed.data.id && !current.length) throw new Error("NOT_FOUND");
        const duplicateSlug = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM catalog_groups WHERE slug=${parsed.data.slug} AND id<>${id} LIMIT 1`;
        if (duplicateSlug.length) throw new Error("GROUP_EXISTS");
        const legacy = await tx.$queryRaw<Array<{ productId: string }>>`SELECT "productId" FROM catalog_group_products WHERE "groupId"=${id} LIMIT 1`;
        if (legacy.length && uniqueVariantIds.length) throw new Error("LEGACY_PRODUCT_CONFLICT");
        const variants = uniqueVariantIds.length ? await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM product_variants WHERE id IN (${Prisma.join(uniqueVariantIds)})` : [];
        if (variants.length !== uniqueVariantIds.length) throw new Error("INVALID_VARIANT");
        if (parsed.data.id) {
          await tx.$executeRaw`UPDATE catalog_groups SET slug=${parsed.data.slug},title=${parsed.data.title},description=${parsed.data.description},isactive=${parsed.data.isActive},sortorder=${parsed.data.sortOrder},updatedat=NOW() WHERE id=${id}`;
        } else {
          await tx.$executeRaw`INSERT INTO catalog_groups (id,slug,title,description,isactive,sortorder,createdat,updatedat) VALUES (${id},${parsed.data.slug},${parsed.data.title},${parsed.data.description},${parsed.data.isActive},${parsed.data.sortOrder},NOW(),NOW())`;
        }
        if (!legacy.length) {
          if (uniqueVariantIds.length) await tx.$executeRaw`DELETE FROM catalog_group_variants WHERE "groupId"=${id} AND "variantId" NOT IN (${Prisma.join(uniqueVariantIds)})`;
          else await tx.$executeRaw`DELETE FROM catalog_group_variants WHERE "groupId"=${id}`;
          for (const [sortOrder, variantId] of Array.from(uniqueVariantIds.entries())) await tx.$executeRaw`INSERT INTO catalog_group_variants ("groupId","variantId","sortOrder","createdAt") VALUES (${id},${variantId},${sortOrder},NOW()) ON CONFLICT ("groupId","variantId") DO UPDATE SET "sortOrder"=EXCLUDED."sortOrder"`;
        }
        return { id, variantCount: uniqueVariantIds.length };
      });
      return NextResponse.json({ data: result }, { status: parsed.data.id ? 200 : 201 });
    }
    if (body.kind === "group") {
      const parsed = groupInput.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "INVALID_GROUP" }, { status: 400 });
      const duplicateSlug = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM catalog_groups WHERE slug=${parsed.data.slug} LIMIT 1`; if (duplicateSlug.length) throw new Error("GROUP_EXISTS");
      const id = newId(); await db.$executeRaw`INSERT INTO catalog_groups (id,slug,title,description,isactive,sortorder,createdat,updatedat) VALUES (${id},${parsed.data.slug},${parsed.data.title},${parsed.data.description},${parsed.data.isActive},${parsed.data.sortOrder},NOW(),NOW())`; return NextResponse.json({ data: { id } }, { status: 201 });
    }
    if (body.kind === "product") {
      const parsed = productInput.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "INVALID_PRODUCT" }, { status: 400 });
      const exists = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM products WHERE id=${parsed.data.productId} LIMIT 1`; if (!exists.length) throw new Error("INVALID_PRODUCT");
      if (schema.variants) {
        const variantConflict = await db.$queryRaw<Array<{ variantId: string }>>`SELECT gv."variantId" FROM catalog_group_variants gv JOIN product_variants v ON v.id=gv."variantId" WHERE gv."groupId"=${parsed.data.groupId} AND v."productId"=${parsed.data.productId} LIMIT 1`;
        if (variantConflict.length) throw new Error("PRODUCT_VARIANT_CONFLICT");
      }
      await db.$executeRaw`INSERT INTO catalog_group_products ("groupId","productId","sortOrder","createdAt") VALUES (${parsed.data.groupId},${parsed.data.productId},${parsed.data.sortOrder},NOW())`; return NextResponse.json({ ok: true }, { status: 201 });
    }
    if (body.kind === "variant" || body.kind === "variants") {
      groupVariantSchemaRequired(schema);
      const parsedVariant = body.kind === "variant" ? variantInput.safeParse(body) : null;
      const parsedVariants = body.kind === "variants" ? variantsInput.safeParse(body) : null;
      if ((parsedVariant && !parsedVariant.success) || (parsedVariants && !parsedVariants.success)) return NextResponse.json({ error: "INVALID_VARIANT" }, { status: 400 });
      const groupId = parsedVariant?.success ? parsedVariant.data.groupId : parsedVariants?.success ? parsedVariants.data.groupId : "";
      const sortOrder = parsedVariant?.success ? parsedVariant.data.sortOrder : parsedVariants?.success ? parsedVariants.data.sortOrder : 0;
      const variantIds = parsedVariant?.success ? [parsedVariant.data.variantId] : parsedVariants?.success ? parsedVariants.data.variantIds : [];
      const uniqueIds = Array.from(new Set(variantIds));
      const rows = await db.$queryRaw<Array<{ id: string; productId: string }>>`SELECT id,"productId" FROM product_variants WHERE id IN (${Prisma.join(uniqueIds)})`;
      if (rows.length !== uniqueIds.length) throw new Error("INVALID_VARIANT");
      const productIds = Array.from(new Set(rows.map((row) => row.productId)));
      const conflicts = await db.$queryRaw<Array<{ productId: string }>>`SELECT "productId" FROM catalog_group_products WHERE "groupId"=${groupId} AND "productId" IN (${Prisma.join(productIds)})`;
      if (conflicts.length) throw new Error("PRODUCT_VARIANT_CONFLICT");
      const result = await db.$transaction(async (tx) => {
        for (const variantId of uniqueIds) await tx.$executeRaw`INSERT INTO catalog_group_variants ("groupId","variantId","sortOrder","createdAt") VALUES (${groupId},${variantId},${sortOrder},NOW())`;
        return uniqueIds.length;
      });
      return NextResponse.json({ ok: true, count: result }, { status: 201 });
    }
    if (body.kind === "rule") {
      const parsed = ruleInput.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "INVALID_RULE" }, { status: 400 });
      const rule = normalizeGroupRule(parsed.data); await validateGroupRuleReferences(db, rule); const id = newId(); await db.$executeRaw`INSERT INTO catalog_group_rules (id,"groupId","brandId","globalProductTypeId","modelId","sortOrder","isActive") VALUES (${id},${parsed.data.groupId},${rule.brandId},${rule.globalProductTypeId},${rule.modelId},${rule.sortOrder},${rule.isActive})`; return NextResponse.json({ data: { id } }, { status: 201 });
    }
    return NextResponse.json({ error: "INVALID_KIND" }, { status: 400 });
  } catch (error) { return responseError(error); }
}

export async function PATCH(request: Request) {
  try {
    await requireGlobalAdminMutation(request); const body = await request.json() as { kind?: string; id?: string; [key: string]: unknown }; const db = adminDb(); const schema = await groupSchema(db); groupSchemaRequired(schema);
    if (!body.id) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
    if (body.kind === "group") { const parsed = groupInput.partial().safeParse(body); if (!parsed.success) return NextResponse.json({ error: "INVALID_GROUP" }, { status: 400 }); const d=parsed.data; const result=await db.$executeRaw`UPDATE catalog_groups SET slug=COALESCE(${d.slug ?? null},slug),title=COALESCE(${d.title ?? null},title),description=COALESCE(${d.description ?? null},description),isactive=COALESCE(${d.isActive ?? null},isactive),sortorder=COALESCE(${d.sortOrder ?? null},sortorder),updatedat=NOW() WHERE id=${body.id}`; if(!result) throw new Error("NOT_FOUND"); return NextResponse.json({ ok:true }); }
    if (body.kind === "product") { const parsed=z.object({ groupId:z.string().min(1), productId:z.string().min(1), sortOrder:z.number().int().min(-100000).max(100000).optional() }).safeParse(body); if(!parsed.success) return NextResponse.json({error:"INVALID_PRODUCT"},{status:400}); const result=await db.$executeRaw`UPDATE catalog_group_products SET "sortOrder"=COALESCE(${parsed.data.sortOrder ?? null},"sortOrder") WHERE "groupId"=${parsed.data.groupId} AND "productId"=${parsed.data.productId}`; if(!result) throw new Error("NOT_FOUND"); return NextResponse.json({ok:true}); }
    if (body.kind === "variant") { groupVariantSchemaRequired(schema); const parsed=variantInput.partial({ groupId: true }).extend({ id: z.string().min(1) }).safeParse(body); if(!parsed.success) return NextResponse.json({error:"INVALID_VARIANT"},{status:400}); const result=await db.$executeRaw`UPDATE catalog_group_variants SET "sortOrder"=COALESCE(${parsed.data.sortOrder ?? null},"sortOrder") WHERE "groupId"=${parsed.data.groupId} AND "variantId"=${parsed.data.variantId}`; if(!result) throw new Error("NOT_FOUND"); return NextResponse.json({ok:true}); }
    if (body.kind === "rule") { const current=await db.$queryRaw<any[]>`SELECT "groupId","brandId","globalProductTypeId","modelId","sortOrder","isActive" FROM catalog_group_rules WHERE id=${body.id} LIMIT 1`; if(!current.length) throw new Error("NOT_FOUND"); const rule=normalizeGroupRule({ ...current[0], ...body }); await validateGroupRuleReferences(db,rule); const result=await db.$executeRaw`UPDATE catalog_group_rules SET "brandId"=${rule.brandId},"globalProductTypeId"=${rule.globalProductTypeId},"modelId"=${rule.modelId},"sortOrder"=${rule.sortOrder},"isActive"=${rule.isActive} WHERE id=${body.id}`; if(!result) throw new Error("NOT_FOUND"); return NextResponse.json({ok:true}); }
    return NextResponse.json({error:"INVALID_KIND"},{status:400});
  } catch(error){ return responseError(error); }
}

export async function DELETE(request: Request) {
  try { await requireGlobalAdminMutation(request); const body=await request.json() as {kind?:string; id?:string; groupId?:string; productId?:string; variantId?:string}; const db=adminDb(); const schema=await groupSchema(db); groupSchemaRequired(schema); let result=0; if(body.kind === "group") result=await db.$executeRaw`DELETE FROM catalog_groups WHERE id=${body.id}`; else if(body.kind === "rule") result=await db.$executeRaw`DELETE FROM catalog_group_rules WHERE id=${body.id}`; else if(body.kind === "product") result=await db.$executeRaw`DELETE FROM catalog_group_products WHERE "groupId"=${body.groupId} AND "productId"=${body.productId}`; else if(body.kind === "variant") { groupVariantSchemaRequired(schema); result=await db.$executeRaw`DELETE FROM catalog_group_variants WHERE "groupId"=${body.groupId} AND "variantId"=${body.variantId}`; } else return NextResponse.json({error:"INVALID_KIND"},{status:400}); if(!result) throw new Error("NOT_FOUND"); return NextResponse.json({ok:true}); } catch(error){ return responseError(error); }
}
