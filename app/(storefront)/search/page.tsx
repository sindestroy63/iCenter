import CatalogView from "@/components/CatalogView";

export default function SearchPage({ searchParams }: { searchParams: { q?: string; brand?: string; memory?: string; color?: string; sim?: string } }) {
  const query = searchParams.q ?? "";
  return <CatalogView query={query} brand={searchParams.brand ?? ""} memory={searchParams.memory ?? ""} color={searchParams.color ?? ""} sim={searchParams.sim ?? ""} title={query ? `Результаты по запросу «${query}»` : "Поиск товаров"} crumb="Результаты поиска" />;
}
