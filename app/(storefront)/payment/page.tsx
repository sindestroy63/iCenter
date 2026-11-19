import StoreInfoPage from "@/components/StoreInfoPage";
import { pageMetadata } from "@/lib/page-metadata";
export default function Page() { return <StoreInfoPage slug="payment" />; }

export const metadata = pageMetadata("/payment", "Оплата", "Информация об оплате и согласовании условий покупки в iCenter.");
