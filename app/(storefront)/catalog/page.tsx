import CatalogView from "@/components/CatalogView";

export default function CatalogPage({ searchParams }: { searchParams: { q?: string; brand?: string; memory?: string; color?: string; sim?: string } }) {
  return <CatalogView query={searchParams.q ?? ""} brand={searchParams.brand ?? ""} memory={searchParams.memory ?? ""} color={searchParams.color ?? ""} sim={searchParams.sim ?? ""} />;
}
