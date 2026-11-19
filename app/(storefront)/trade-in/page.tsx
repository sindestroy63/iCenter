import TradeInPage from "@/components/TradeInPage";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/trade-in", "Trade-in: обмен старого устройства на новое", "Оставьте заявку на Trade-in в iCenter. Менеджер уточнит сведения об устройстве и согласует проверку; итоговая оценка определяется после осмотра.");

export default function Page() {
  return <TradeInPage />;
}
