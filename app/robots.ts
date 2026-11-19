import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://icenter-store.com";
  return {
    rules: [{ userAgent: "*", allow: ["/", "/catalog", "/product/", "/assets/", "/images/", "/uploads/"], disallow: ["/admin", "/api", "/auth", "/cart", "/checkout", "/favorites", "/search"] }],
    sitemap: `${site.replace(/\/$/, "")}/sitemap.xml`,
    host: site,
  };
}
