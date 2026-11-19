import type { MetadataRoute } from "next";
import { getSeoMenu, getSeoProductList } from "@/lib/catalog-seo";
import { readOnly } from "@/lib/catalog-api";

const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://icenter-store.com").replace(/\/$/, "");
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = ["", "/catalog", "/about", "/delivery", "/installment", "/payment", "/privacy", "/personal-data-consent", "/seller-info", "/terms", "/trade-in", "/warranty", "/catalog/smartphones", "/catalog/tablets", "/catalog/laptops", "/catalog/appliances", "/catalog/consoles"];
  const fixed = staticPaths.map((path) => ({ url: `${site}${path}`, changeFrequency: "weekly" as const, priority: path === "" ? 1 : path === "/catalog" ? 0.9 : 0.5 }));
  try {
    const menu = await getSeoMenu();
    const products = await readOnly((tx) => tx.$queryRaw<Array<{ slug: string; updatedAt: Date }>>`
      SELECT p.slug,p."updatedAt" FROM products p
      WHERE p.status='PUBLISHED'::"ProductStatus"
      AND EXISTS (SELECT 1 FROM brands b WHERE b.id=p."brandId" AND b."isActive"=TRUE)
      AND EXISTS (SELECT 1 FROM categories c WHERE c.id=p."categoryId" AND c."isActive"=TRUE)
      AND EXISTS (SELECT 1 FROM global_product_types t WHERE t.id=p."globalProductTypeId" AND t."isActive"=TRUE)
      AND EXISTS (
        SELECT 1 FROM product_variants v JOIN inventory i ON i."variantId"=v.id AND i."isActive"=TRUE
        JOIN cities city ON city.id=i."cityId" AND city."isActive"=TRUE
        WHERE v."productId"=p.id AND v."isActive"=TRUE
      ) ORDER BY p.slug
    `).catch(() => []);
    const sectionContent = [];
    for (const node of menu.flat) {
      sectionContent.push({ node, products: await getSeoProductList(node).catch(() => []) });
    }
    const sections = sectionContent
      .filter(({ products, node }) => products.length > 0 || node.children.length > 0)
      .map(({ node }) => ({ url: `${site}${node.path}`, changeFrequency: "weekly" as const, priority: node.parent ? 0.7 : 0.8 }));
    const productRows = products.length ? products : Array.from(new Map(sectionContent.flatMap(({ products }) => products).map((product) => [product.slug, product])).values());
    const productUrls = productRows.map(({ slug, ...product }) => ({ url: `${site}/product/${encodeURIComponent(slug)}`, ...( "updatedAt" in product ? { lastModified: product.updatedAt } : {}), changeFrequency: "weekly" as const, priority: 0.7 }));
    return Array.from(new Map([...fixed, ...sections, ...productUrls].map((entry) => [entry.url, entry])).values());
  } catch {
    return fixed;
  }
}
