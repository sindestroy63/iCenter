import CatalogView from "@/components/CatalogView";
import type { Metadata } from "next";
import { getSeoMenu, getSeoMenuImage, type SeoMenuNode } from "@/lib/catalog-seo";
import { redirect } from "next/navigation";

const catalogDescription = "Каталог техники и аксессуаров iCenter: выберите категорию, бренд и параметры товара.";
const catalogMetadata: Metadata = { title: "Каталог товаров", description: catalogDescription, alternates: { canonical: "/catalog" }, openGraph: { type: "website", title: "Каталог товаров iCenter", description: catalogDescription, url: "/catalog", images: ["/icon-1024.png"] }, twitter: { card: "summary_large_image", title: "Каталог товаров iCenter", description: catalogDescription, images: ["/icon-1024.png"] } };

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ menuItem?: string; brand?: string; category?: string }> }): Promise<Metadata> {
  const query = await searchParams;
  if (!query.menuItem && !query.brand && !query.category) return catalogMetadata;
  const menu = await getSeoMenu();
  const node = menu.flat.find((entry) => entry.id === query.menuItem)
    ?? menu.flat.find((entry) => entry.parent === null && (entry.id === query.brand || entry.slug === query.brand))
    ?? menu.flat.find((entry) => categoryNodeMatches(entry, query.category));
  if (!node) return { ...catalogMetadata, robots: { index: false, follow: true } };
  const title = `${node.title} — каталог iCenter`;
  const description = `Каталог ${node.title} в iCenter: доступные товары, цены и наличие.`;
  const image = await getSeoMenuImage(node).catch(() => null) ?? "/icon-1024.png";
  return { title, description, alternates: { canonical: `${menu.site}${node.path}` }, openGraph: { type: "website", title, description, url: `${menu.site}${node.path}`, images: [image] }, twitter: { card: "summary_large_image", title, description, images: [image] } };
}

function categoryNodeMatches(node: SeoMenuNode, category?: string) {
  if (!category) return false;
  if (node.id === category || node.slug === category) return true;
  if (node.action?.type === "category" && node.action.categoryId === category) return true;
  return node.action?.type === "filters" && node.action.rules.some((rule) => rule.field === "category" && rule.value === category);
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; brand?: string; category?: string; memory?: string; color?: string; sim?: string; ram?: string; type?: string; modelId?: string; section?: string; menuItem?: string; browse?: string; scopeBrand?: string; scopeCategory?: string; scopeType?: string }> }) {
  const queryParams = await searchParams;
  if (queryParams.menuItem && queryParams.browse !== queryParams.menuItem) {
    const menu = await getSeoMenu();
    const node = menu.flat.find((entry) => entry.id === queryParams.menuItem);
    if (node) {
      const preserved = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, value]) => { if (key !== "menuItem" && key !== "browse" && value) preserved.set(key, value); });
      const query = preserved.toString();
      redirect(`${node.path}${query ? `?${query}` : ""}`);
    }
  }
  return <CatalogView query={queryParams.q ?? ""} brand={queryParams.brand ?? ""} category={queryParams.category ?? ""} memory={queryParams.memory ?? ""} color={queryParams.color ?? ""} sim={queryParams.sim ?? ""} ram={queryParams.ram ?? ""} typeFilter={queryParams.type ?? ""} modelId={queryParams.modelId ?? ""} section={queryParams.section ?? ""} menuItem={queryParams.menuItem ?? ""} browse={queryParams.browse ?? ""} scopeBrand={queryParams.scopeBrand ?? ""} scopeCategory={queryParams.scopeCategory ?? ""} scopeType={queryParams.scopeType ?? ""} />;
}
