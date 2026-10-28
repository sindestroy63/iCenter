import CatalogView from "@/components/CatalogView";

export default function CatalogPage({ searchParams }: { searchParams: { q?: string; brand?: string; category?: string; memory?: string; color?: string; sim?: string; ram?: string; type?: string } }) {
  return <CatalogView query={searchParams.q ?? ""} brand={searchParams.brand ?? ""} category={searchParams.category ?? ""} memory={searchParams.memory ?? ""} color={searchParams.color ?? ""} sim={searchParams.sim ?? ""} ram={searchParams.ram ?? ""} typeFilter={searchParams.type ?? ""} />;
}
