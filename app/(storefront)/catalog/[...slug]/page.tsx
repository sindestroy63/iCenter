import CatalogView from "@/components/CatalogView";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSeoMenuImage, getSeoMenuNode, getSeoProductList } from "@/lib/catalog-seo";

export const dynamic = "force-dynamic";

const categories: Record<string, string> = {
  smartphones: "Смартфоны",
  tablets: "Планшеты",
  laptops: "Ноутбуки",
  appliances: "Бытовая техника",
  consoles: "Игровые консоли",
};

export async function generateMetadata({ params }: { params: { slug: string[] } }): Promise<Metadata> {
  const slug = params.slug.at(-1) ?? "";
  const category = params.slug.length === 1 ? categories[slug] : undefined;
  if (category) {
    const description = `${category} в каталоге iCenter. Сравните доступные товары, цены и наличие.`;
    const url = `/catalog/${encodeURIComponent(slug)}`;
    return { title: category, description, alternates: { canonical: url }, openGraph: { type: "website", title: `${category} в iCenter`, description, url, images: ["/icon-1024.png"] }, twitter: { card: "summary_large_image", title: `${category} в iCenter`, description, images: ["/icon-1024.png"] } };
  }
  const seo = await getSeoMenuNode(params.slug);
  if (seo) {
    const node = seo.node;
    const image = await getSeoMenuImage(node).catch(() => null) ?? "/icon-1024.png";
    if (node.action?.type === "category" && node.action.categoryId === "trade-in") {
      const products = await getSeoProductList(node).catch(() => []);
      return {
        title: "Trade-in — б/у техника в iCenter",
        description: "Каталог подержанной техники Trade-in в iCenter: актуальные цены и наличие.",
        alternates: { canonical: `${seo.site}/catalog/trade-in` },
        robots: products.length ? undefined : { index: false, follow: true },
        openGraph: { type: "website", title: "Trade-in — б/у техника в iCenter", description: "Каталог подержанной техники Trade-in в iCenter: актуальные цены и наличие.", url: `${seo.site}/catalog/trade-in`, images: [image] },
        twitter: { card: "summary_large_image", title: "Trade-in — б/у техника в iCenter", description: "Каталог подержанной техники Trade-in в iCenter: актуальные цены и наличие.", images: [image] },
      };
    }
    const model = node.action?.type === "group" || node.action?.type === "filters" && node.action.rules.some((rule) => rule.field === "model");
    const title = model ? `${node.title} — цены и наличие` : node.parent ? `Купить ${node.title} в iCenter` : `${node.title} — техника в iCenter`;
    const description = model
      ? `${node.title}: актуальные цены и наличие в iCenter.`
      : `Каталог ${node.title} в iCenter: доступные товары, цены и наличие.`;
    const hasContent = node.children.length > 0 || (await getSeoProductList(node).catch(() => [])).length > 0;
    return { title, description, alternates: { canonical: `${seo.site}${node.path}` }, robots: hasContent ? undefined : { index: false, follow: true }, openGraph: { type: "website", title, description, url: `${seo.site}${node.path}`, images: [image] }, twitter: { card: "summary_large_image", title, description, images: [image] } };
  }
  return { title: "Каталог", robots: { index: false, follow: true } };
}

export default async function CatalogSlugPage({ params }: { params: { slug: string[] } }) {
  const slug = params.slug.at(-1) ?? "";
  const category = params.slug.length === 1 ? categories[slug] : undefined;
  if (category) return <CatalogView title={category} category={slug} />;
  const seo = await getSeoMenuNode(params.slug);
  if (seo) {
    const node = seo.node;
    if (node.action?.type === "category" && node.action.categoryId === "trade-in") {
      return <CatalogView title={node.title} category="trade-in" menuItem={node.id} />;
    }
    return <CatalogView title={node.title} menuItem={node.id} />;
  }
  notFound();
}
