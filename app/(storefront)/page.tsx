import HomeCatalog from "@/components/HomeCatalog";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Магазин техники и аксессуаров",
  description: "Смартфоны, планшеты, ноутбуки, наушники и аксессуары в iCenter. Каталог техники, актуальные цены и наличие для Самары, Оренбурга, Москвы и Санкт-Петербурга.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "iCenter — магазин техники и аксессуаров",
    description: "Каталог техники, актуальные цены и наличие для Самары, Оренбурга, Москвы и Санкт-Петербурга.",
    url: "/",
    images: [{ url: "/icon-1024.png", width: 1024, height: 1024, alt: "iCenter" }],
  },
  twitter: {
    title: "iCenter — магазин техники и аксессуаров",
    description: "Каталог техники, актуальные цены и наличие для Самары, Оренбурга, Москвы и Санкт-Петербурга.",
    images: ["/icon-1024.png"],
  },
};

export default function Home() {
  const jsonLd = { "@context": "https://schema.org", "@type": "WebSite", name: "iCenter", url: "https://icenter-store.com/", inLanguage: "ru-RU", potentialAction: { "@type": "SearchAction", target: "https://icenter-store.com/catalog?q={search_term_string}", "query-input": "required name=search_term_string" } };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /><div className="layout-container home-content">
    <HomeCatalog />
  </div></>;
}
