import "server-only";
import { createHash } from "node:crypto";
import { newId } from "@/lib/admin-db";

export async function saveVariants(tx: any, productId: string, variants: any[]) {
  const cities = await tx.$queryRaw<any[]>`SELECT id FROM cities WHERE "isActive"=TRUE`;
  const cityIds = new Set<string>(cities.map((city: {id:string}) => city.id));
  const savedIds: string[] = [];
  for (const item of variants) {
    if (item.inventory.some((record: any) => !cityIds.has(record.cityId))) throw new Error("INVALID_CITY");
    if (item.colorId) { const color = await tx.$queryRaw<any[]>`SELECT id FROM colors WHERE id=${item.colorId} AND "isActive"=TRUE`; if (!color.length) throw new Error("INVALID_COLOR"); }
    const id = item.id ?? newId();
    savedIds.push(id);
    const label = item.label || [item.storage, item.ram, item.colorId].filter(Boolean).join(" · ") || "Вариант";
    const canonicalKey = createHash("sha256").update(JSON.stringify([item.colorId ?? null,item.storage ?? null,item.ram ?? null,item.simType ?? null,item.connectivity ?? null,item.size ?? null,item.material ?? null,item.attributes])).digest("hex");
    if (item.id) {
      const exists = await tx.$queryRaw<any[]>`SELECT id FROM product_variants WHERE id=${item.id} AND "productId"=${productId}`;
      if (!exists.length) throw new Error("INVALID_VARIANT");
      await tx.$executeRaw`UPDATE product_variants SET label=${label},"colorId"=${item.colorId ?? null},storage=${item.storage ?? null},ram=${item.ram ?? null},"simType"=${item.simType ?? null},connectivity=${item.connectivity ?? null},size=${item.size ?? null},material=${item.material ?? null},attributes=${JSON.stringify(item.attributes)}::jsonb,"isActive"=${item.active},"canonicalKey"=${canonicalKey},"updatedAt"=NOW() WHERE id=${item.id} AND "productId"=${productId}`;
    } else {
      const sku = `IC-${productId.slice(-8).toUpperCase()}-${newId().slice(-6).toUpperCase()}`;
      await tx.$executeRaw`INSERT INTO product_variants (id,"productId",sku,label,"canonicalKey","colorId",storage,ram,"simType",connectivity,size,material,attributes,"isActive","updatedAt") VALUES (${id},${productId},${sku},${label},${canonicalKey},${item.colorId ?? null},${item.storage ?? null},${item.ram ?? null},${item.simType ?? null},${item.connectivity ?? null},${item.size ?? null},${item.material ?? null},${JSON.stringify(item.attributes)}::jsonb,${item.active},NOW())`;
    }
    for (const city of item.inventory) {
      const existing = await tx.$queryRaw<any[]>`SELECT id FROM inventory WHERE "variantId"=${id} AND "cityId"=${city.cityId} LIMIT 1`;
      if (existing.length) await tx.$executeRaw`UPDATE inventory SET price=${city.price},"oldPrice"=${city.oldPrice ?? null},availability=${city.availability}::"AvailabilityStatus","allowPreorder"=${city.allowPreorder},"deliveryTime"=${city.deliveryTime ?? null},"isActive"=TRUE,"updatedAt"=NOW() WHERE id=${existing[0].id}`;
      else await tx.$executeRaw`INSERT INTO inventory (id,"variantId","cityId",price,"oldPrice",availability,"allowPreorder","deliveryTime","updatedAt") VALUES (${newId()},${id},${city.cityId},${city.price},${city.oldPrice ?? null},${city.availability}::"AvailabilityStatus",${city.allowPreorder},${city.deliveryTime ?? null},NOW())`;
    }
  }
  return savedIds;
}

export async function saveImages(tx: any, productId: string, images: any[]) {
  const galleryKeys = new Set<string>();
  for (const image of images) {
    const key = `${image.colorId ?? ""}\u0000${image.mediaId}`;
    if (galleryKeys.has(key)) throw new Error("DUPLICATE_IMAGE");
    galleryKeys.add(key);
  }
  const existing = await tx.$queryRaw<any[]>`SELECT m.id FROM media m WHERE m.id = ANY(${images.map(item => item.mediaId)}::text[])`;
  if (existing.length !== new Set(images.map(item => item.mediaId)).size) throw new Error("INVALID_MEDIA");
  const colorIds = Array.from(new Set<string>(images.map(item => item.colorId).filter((id: unknown): id is string => typeof id === "string" && id.length > 0)));
  for (const colorId of colorIds) { const found = await tx.$queryRaw<any[]>`SELECT id FROM colors WHERE id=${colorId} AND "isActive"=TRUE`; if (!found.length) throw new Error("INVALID_COLOR"); }
  await tx.$executeRaw`DELETE FROM color_gallery_images WHERE "colorGalleryId" IN (SELECT id FROM color_galleries WHERE "productId"=${productId})`;
  await tx.$executeRaw`DELETE FROM color_galleries WHERE "productId"=${productId}`;
  await tx.$executeRaw`DELETE FROM product_gallery_images WHERE "productId"=${productId}`;
  for (let sortOrder = 0; sortOrder < images.length; sortOrder++) {
    const image = images[sortOrder];
    if (image.colorId) {
      const matches = await tx.$queryRaw<any[]>`SELECT id FROM color_galleries WHERE "productId"=${productId} AND "colorId"=${image.colorId} LIMIT 1`;
      const galleryId = matches[0]?.id ?? newId();
      if (!matches.length) await tx.$executeRaw`INSERT INTO color_galleries (id,"productId","colorId","updatedAt") VALUES (${galleryId},${productId},${image.colorId},NOW())`;
      await tx.$executeRaw`INSERT INTO color_gallery_images (id,"colorGalleryId","mediaId","sortOrder") VALUES (${newId()},${galleryId},${image.mediaId},${image.sortOrder ?? sortOrder})`;
    } else await tx.$executeRaw`INSERT INTO product_gallery_images (id,"productId","mediaId","sortOrder") VALUES (${newId()},${productId},${image.mediaId},${image.sortOrder ?? sortOrder})`;
  }
}
