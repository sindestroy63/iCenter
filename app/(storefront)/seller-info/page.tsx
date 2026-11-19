import StoreInfoPage from "@/components/StoreInfoPage";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/seller-info", "Информация о продавце", "Юридические сведения и подтверждённые контакты продавца iCenter.");
export default function Page() { return <StoreInfoPage slug="seller-info" />; }
