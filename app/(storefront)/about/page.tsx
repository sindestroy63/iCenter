import StoreInfoPage from "@/components/StoreInfoPage";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/about", "О магазине", "Информация о магазине iCenter и его работе.");
export default function Page() { return <StoreInfoPage slug="about" />; }
