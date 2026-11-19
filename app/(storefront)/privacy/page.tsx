import StoreInfoPage from "@/components/StoreInfoPage";
import { pageMetadata } from "@/lib/page-metadata";
export default function Page() { return <StoreInfoPage slug="privacy" />; }

export const metadata = pageMetadata("/privacy", "Политика обработки персональных данных", "Политика iCenter об обработке и хранении персональных данных.");
