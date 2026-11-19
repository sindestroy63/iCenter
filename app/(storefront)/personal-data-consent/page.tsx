import StoreInfoPage from "@/components/StoreInfoPage";
import { pageMetadata } from "@/lib/page-metadata";
export default function Page() { return <StoreInfoPage slug="personal-data-consent" />; }

export const metadata = pageMetadata("/personal-data-consent", "Согласие на обработку персональных данных", "Условия согласия на обработку персональных данных при отправке заявки в iCenter.");
