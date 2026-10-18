import StoreInfoPage from "@/components/StoreInfoPage";

export default function StoreInfoRoute({ params }: { params: { slug: string } }) {
  return <StoreInfoPage slug={params.slug} />;
}
