import StoreInfoPage from "@/components/StoreInfoPage";
import { pageMetadata } from "@/lib/page-metadata";
export default function Page() { return <StoreInfoPage slug="terms" />; }

export const metadata = pageMetadata("/terms", "Условия использования", "Условия использования сайта iCenter и размещённой на нём информации.");
