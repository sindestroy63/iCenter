import InstallmentPage from "@/components/InstallmentPage";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata("/installment", "Рассрочка", "Оставьте заявку по товару, чтобы уточнить доступные условия рассрочки у менеджера iCenter.");

export default function Page() {
  return <InstallmentPage />;
}
