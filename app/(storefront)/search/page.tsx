import CatalogView from "@/components/CatalogView";

export default function SearchPage({ searchParams }: { searchParams: { q?: string; brand?: string; category?: string; memory?: string; color?: string; sim?: string; ram?: string; type?: string } }) {
  const query = searchParams.q ?? "";
  return <CatalogView query={query} brand={searchParams.brand ?? ""} category={searchParams.category ?? ""} memory={searchParams.memory ?? ""} color={searchParams.color ?? ""} sim={searchParams.sim ?? ""} ram={searchParams.ram ?? ""} typeFilter={searchParams.type ?? ""} title={query ? `Результаты по запросу «${query}»` : "Поиск товаров"} />;
}
