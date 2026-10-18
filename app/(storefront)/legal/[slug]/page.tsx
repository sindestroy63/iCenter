import StoreInfoPage from "@/components/StoreInfoPage";

export default function LegalPage({ params }: { params: { slug: string } }) {
  return <StoreInfoPage slug={params.slug} />;
}
