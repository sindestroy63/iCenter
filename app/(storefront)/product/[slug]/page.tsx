import ProductView from "@/components/ProductView";
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { findSeoProductCategoryNode, getSeoMenu } from "@/lib/catalog-seo";
import { readOnly } from "@/lib/catalog-api";

export const dynamic = "force-dynamic";

const getProductSeoData = cache(async (slug: string, citySlug: string) => {
    const rows = await readOnly((tx) => tx.$queryRaw<Array<{ id: string; name: string; description: unknown; brand: string; brandId: string; category: string; categoryId: string; typeId: string; slug: string; image: string | null; price: string | null; availability: string | null }>>`
      SELECT p.id,p.name,p.description,b.name AS brand,b.id AS "brandId",c.name AS category,c.id AS "categoryId",p."globalProductTypeId" AS "typeId",p.slug,
        (SELECT gallery."storagePath" FROM (
          SELECT gi."sortOrder",img."storagePath" FROM product_gallery_images gi JOIN media img ON img.id=gi."mediaId" WHERE gi."productId"=p.id
          UNION ALL
          SELECT cgi."sortOrder",img."storagePath" FROM color_galleries cg JOIN color_gallery_images cgi ON cgi."colorGalleryId"=cg.id JOIN media img ON img.id=cgi."mediaId" WHERE cg."productId"=p.id
        ) gallery ORDER BY gallery."sortOrder" LIMIT 1) AS image,
        offer.price::text AS price,offer.availability::text AS availability
      FROM products p JOIN brands b ON b.id=p."brandId" AND b."isActive"=TRUE
      JOIN categories c ON c.id=p."categoryId" AND c."isActive"=TRUE
      JOIN global_product_types t ON t.id=p."globalProductTypeId" AND t."isActive"=TRUE
      LEFT JOIN LATERAL (SELECT inv.price,inv.availability FROM product_variants v JOIN inventory inv ON inv."variantId"=v.id JOIN cities city ON city.id=inv."cityId" AND city."isActive"=TRUE WHERE v."productId"=p.id AND v."isActive"=TRUE AND inv."isActive"=TRUE AND city.slug=${citySlug} ORDER BY inv.price NULLS LAST LIMIT 1) offer ON TRUE
      WHERE p.slug=${slug} AND p.status='PUBLISHED'::"ProductStatus" LIMIT 1
    `);
    return rows[0] ?? null;
});

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ city?: string }> }): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const city = query.city ?? "samara";
  const product = await getProductSeoData(slug, city);
  if (!product) return { title: "Товар не найден", robots: { index: false, follow: true } };
    const descriptionValue = typeof product.description === "string" ? product.description : product.description && typeof product.description === "object" && "text" in product.description ? product.description.text : "";
    const descriptionText = typeof descriptionValue === "string" ? descriptionValue : "";
    const description = `${product.brand} ${product.name} — ${product.category} в каталоге iCenter. ${descriptionText}`.replace(/\s+/g, " ").slice(0, 300);
    const image = product.image && /^(assets|uploads|media)\/[a-zA-Z0-9._/-]+$/.test(product.image) ? `/${product.image}` : "/icon-1024.png";
    const url = `/product/${encodeURIComponent(product.slug)}`;
    return { title: `${product.brand} ${product.name}`, description, alternates: { canonical: url }, openGraph: { type: "website", title: `${product.brand} ${product.name}`, description, url, images: [image] }, twitter: { card: "summary_large_image", title: `${product.brand} ${product.name}`, description, images: [image] } };
}

export default async function ProductPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{variant?:string;city?:string}>}){
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const city = query.city ?? "samara";
  const product = await getProductSeoData(slug, city);
  if (!product) notFound();
  const menu = await getSeoMenu();
  const parentCategory = findSeoProductCategoryNode(menu.flat, product);
  const image = product?.image && /^(assets|uploads|media)\/[a-zA-Z0-9._/-]+$/.test(product.image) ? `https://icenter-store.com/${product.image}` : undefined;
  const offerAvailability = product.availability === "IN_STOCK" ? "https://schema.org/InStock" : product.availability === "PREORDER" ? "https://schema.org/PreOrder" : product.availability === "OUT_OF_STOCK" ? "https://schema.org/OutOfStock" : null;
  const descriptionValue = typeof product.description === "string" ? product.description : product.description && typeof product.description === "object" && "text" in product.description ? product.description.text : "";
  const jsonLd = { "@context": "https://schema.org", "@type": "Product", name: product.name, brand: { "@type": "Brand", name: product.brand }, category: product.category, url: `https://icenter-store.com/product/${encodeURIComponent(product.slug)}`, ...(image ? { image: [image] } : {}), ...(typeof descriptionValue === "string" && descriptionValue.trim() ? { description: descriptionValue.trim().slice(0, 5000) } : {}), ...(product.price ? { offers: { "@type": "Offer", price: product.price, priceCurrency: "RUB", url: `https://icenter-store.com/product/${encodeURIComponent(product.slug)}`, ...(offerAvailability ? { availability: offerAvailability } : {}), seller: { "@type": "Organization", name: "iCenter" } } } : {}) };
  return <><span hidden data-analytics-product-id={product.id} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /><ProductView slug={slug} initialVariantId={query.variant ?? ""} initialName={product.name} categoryHref={parentCategory?.path ?? null}/></>;
}
