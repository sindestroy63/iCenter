import CatalogView from "@/components/CatalogView";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; brand?: string; category?: string; memory?: string; color?: string; sim?: string; ram?: string; type?: string }> }) {
  const queryParams = await searchParams;
  const query = queryParams.q ?? "";
  return <CatalogView query={query} brand={queryParams.brand ?? ""} category={queryParams.category ?? ""} memory={queryParams.memory ?? ""} color={queryParams.color ?? ""} sim={queryParams.sim ?? ""} ram={queryParams.ram ?? ""} typeFilter={queryParams.type ?? ""} title={query ? `Результаты по запросу «${query}»` : "Поиск товаров"} />;
}
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Поиск", robots: { index: false, follow: false } };
