import { CartView } from "@/components/CheckoutFlow";
export default function CartPage(){return <CartView/>}
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Корзина", robots: { index: false, follow: false } };
