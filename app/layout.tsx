import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./storefront.css";
import "./admin-overrides.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://icenter-store.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "iCenter — магазин техники и аксессуаров", template: "%s | iCenter" },
  description: "Смартфоны, планшеты, ноутбуки, наушники и аксессуары в iCenter. Каталог техники, актуальные цены и наличие для Самары, Оренбурга, Москвы и Санкт-Петербурга.",
  applicationName: "iCenter",
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION, yandex: process.env.YANDEX_SITE_VERIFICATION },
  openGraph: { type: "website", locale: "ru_RU", siteName: "iCenter", title: "iCenter — магазин техники и аксессуаров", description: "Каталог техники, актуальные цены и наличие для Самары, Оренбурга, Москвы и Санкт-Петербурга.", url: "/", images: [{ url: "/icon-1024.png", width: 1024, height: 1024, alt: "iCenter — магазин техники и аксессуаров" }] },
  twitter: { card: "summary_large_image", title: "iCenter — магазин техники и аксессуаров", description: "Каталог техники, актуальные цены и наличие для Самары, Оренбурга, Москвы и Санкт-Петербурга.", images: ["/icon-1024.png"] },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = { themeColor: "#101820", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const organization = { "@context": "https://schema.org", "@type": "Organization", name: "iCenter", url: siteUrl };
  return <html lang="ru"><body><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization).replace(/</g, "\\u003c") }} />{children}</body></html>;
}
