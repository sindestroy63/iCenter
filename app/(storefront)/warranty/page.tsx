import StoreInfoPage from "@/components/StoreInfoPage";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/warranty", "Гарантия и поддержка", "Информация о гарантии, документах на товар и обращении за поддержкой iCenter.");
export default function Page() { return <StoreInfoPage slug="warranty" />; }
