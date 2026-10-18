import CatalogView from "@/components/CatalogView";

const categories: Record<string, string> = {
  smartphones: "Смартфоны",
  tablets: "Планшеты",
  laptops: "Ноутбуки",
  appliances: "Бытовая техника",
  consoles: "Игровые консоли",
};

export default function CatalogSlugPage({ params }: { params: { slug: string[] } }) {
  const slug = params.slug.at(-1) ?? "";
  const category = categories[slug];
  const label = category ?? params.slug.map((part) => decodeURIComponent(part)).join(" / ");
  return <CatalogView title={label || "Каталог"} crumb={label || "Каталог"} category={category ?? ""} />;
}
