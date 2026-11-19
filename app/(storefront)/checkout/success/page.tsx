import { SuccessView } from "@/components/CheckoutFlow";
export default function SuccessPage(){return <SuccessView/>}
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Заявка отправлена", robots: { index: false, follow: false } };
