import StoreInfoPage from "@/components/StoreInfoPage";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/delivery", "Доставка и получение", "Способы получения товаров iCenter и порядок согласования доставки.");
export default function Page() { return <StoreInfoPage slug="delivery" />; }
